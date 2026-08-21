// Run: node store.test.js
// Fake DOM/storage for a classic (non-module) script that expects a browser.
// Node >= 21 ships a built-in, read-only `navigator` global (accessor, no setter) — a
// plain `globalThis.navigator = {...}` assignment silently no-ops there, so `navigator.onLine`
// would stay `undefined`. Use defineProperty to actually replace it.
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true, writable: true });
globalThis.localStorage = { _m: {}, getItem(k) { return this._m[k] ?? null; }, setItem(k, v) { this._m[k] = String(v); }, removeItem(k) { delete this._m[k]; } };
globalThis.window = { addEventListener() {} };
globalThis.document = { addEventListener() {}, visibilityState: 'visible' };
require('./config.js');
require('./schedule_lib.js');
globalThis.MOCK_MODE = '1';

let fails = 0, count = 0;
const eq = (a, b, msg) => { count++; const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) { fails++; console.error('FAIL', msg, '\n  got     ', ja, '\n  expected', jb); } };
const ok = (c, msg) => { count++; if (!c) { fails++; console.error('FAIL', msg); } };

(async () => {
  await import('./mock_api.js');
  require('./store.js');

  // --- (a) brief's original smoke scenario: optimistic -> pending -> flush -> undo -> gone;
  // codes parsed from ?team=softball&c=wolf26
  await Store.init({ params: new URLSearchParams('team=softball&c=wolf26') });
  await Store.loadTeams(['softball']);
  eq(Store.codes, { softball: 'WOLF26' }, 'codes parsed from ?c=wolf26 for ?team=softball');

  const b = Store.bundles.softball;
  const futureScheduled = b.events.filter(e => e.status === 'scheduled' && new Date(e.starts_at) > new Date());
  const ev = futureScheduled[0], ev2 = futureScheduled[1];
  ok(ev && ev2 && ev.id !== ev2.id, 'fixture has two distinct future scheduled events to work with');

  Store.setHousehold([1]);
  const { undo } = Store.rsvp('softball', ev.id, 1, 'going');
  eq(b.rsvps.find(r => r.event_id === ev.id && r.player_id === 1)?.status, 'going', 'optimistic rsvp visible immediately');
  ok(Store.hasPending(), 'op queued after optimistic write');
  await Store.flush();
  ok(!Store.hasPending(), 'queue drains after flush');
  undo();
  await Store.flush();
  ok(!b.rsvps.find(r => r.event_id === ev.id && r.player_id === 1), 'undo removes the rsvp after flush');

  // --- (d) I3: cached() must not poison bundles with a null entry, and myTeams() must
  // tolerate a missing/null bundle
  eq(Store.cached('soccer'), null, 'cached() returns null when nothing is cached');
  ok(!Object.prototype.hasOwnProperty.call(Store.bundles, 'soccer'), 'a cache miss does not create an own bundles.soccer key');
  let threw = false;
  try { Store.myTeams(); } catch { threw = true; }
  ok(!threw, 'myTeams() does not throw with no soccer bundle present');

  // --- (b) C1 + (e) I4: coalescing mid-flight must not drop the replacement write, and the
  // coalesced op must keep the ORIGINAL prev (not the superseded optimistic state)
  {
    let release;
    const gate = new Promise(res => { release = res; });
    const realUpsertRsvp = Api.upsertRsvp;
    Api.upsertRsvp = async (args) => { await gate; return realUpsertRsvp(args); };

    // Fixture data may already seed an rsvp for this event/player pair — capture whatever
    // that pristine prior state is (could be an existing row or null) rather than assuming null.
    const originalPrev = b.rsvps.find(r => r.event_id === ev2.id && r.player_id === 3) || null;

    Store.rsvp('softball', ev2.id, 3, 'going');  // first tap: goes in flight against the gate
    Store.rsvp('softball', ev2.id, 3, 'maybe');  // second tap before the first settles: coalesces

    eq(Store.pending.length, 1, 'coalescing keeps a single queued op per key');
    eq(Store.pending[0].status, 'maybe', 'the queued op reflects the latest tap');
    eq(Store.pending[0].prev, originalPrev, 'the coalesced op keeps the ORIGINAL prev, not the first tap\'s optimistic state (I4)');

    release();
    await Store.flush();
    Api.upsertRsvp = realUpsertRsvp;

    ok(!Store.hasPending(), 'queue fully drains once both the in-flight write and its replacement are sent (C1)');
    const fresh = await Api.loadTeam('softball');
    eq(fresh.rsvps.find(r => r.event_id === ev2.id && r.player_id === 3)?.status, 'maybe',
      'the server ends up with the LAST write, not the superseded first one (C1: nothing got silently dropped)');
  }

  // --- (c) C2: loadTeams' catch handler must reference the right slug, not an out-of-scope var
  {
    const realLoadTeam = Api.loadTeam;
    let rejectOnce = true;
    Api.loadTeam = (slug) => { if (rejectOnce) { rejectOnce = false; return Promise.reject(new Error('synthetic load failure')); } return realLoadTeam(slug); };
    const seen = [];
    const unsub = Store.subscribe(e => { if (e.reason === 'fetchError') seen.push(e); });

    await Store.loadTeams(['softball']);
    unsub();
    Api.loadTeam = realLoadTeam;

    eq(seen.length, 1, 'exactly one fetchError emitted');
    eq(seen[0]?.slug, 'softball', 'fetchError carries the correct slug, not undefined from an out-of-scope var (C2)');
  }

  // --- (f) I6: a pending queue restored from storage must be flushed automatically on init
  {
    const seededOp = { kind: 'rsvp', slug: 'softball', event_id: ev.id, player_id: 7, status: 'going', note: '', prev: null, ts: new Date().toISOString() };
    localStorage.setItem('wolves:pending', JSON.stringify([seededOp]));

    await Store.init({ params: new URLSearchParams('team=softball&c=wolf26') });
    await Store.flush();

    const fresh = await Api.loadTeam('softball');
    ok(fresh.rsvps.some(r => r.event_id === ev.id && r.player_id === 7 && r.status === 'going'),
      'a pending op restored from storage before init is auto-flushed after init resolves (I6)');
  }

  console.log(fails ? `${fails}/${count} FAILURES` : `ALL PASS (${count})`);
  process.exit(fails ? 1 : 0);
})();
