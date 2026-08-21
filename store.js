(function () {
  const L = globalThis.ScheduleLib;
  const K = (k) => 'wolves:' + k;
  const read = (k, d) => { try { const v = localStorage.getItem(K(k)); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(K(k), JSON.stringify(v)); } catch {} };
  // A `navigator` with no `onLine` (Node's built-in global, older embedded webviews) must
  // not read as "offline" — that would park every write in the pending queue forever.
  const S = { household: [], codes: {}, bundles: {}, isCoach: false, online: typeof navigator?.onLine === 'boolean' ? navigator.onLine : true,
    view: 'list', prevSeen: {}, lastSeen: {}, pending: [], pendingKids: [], listeners: new Set() };
  const emit = (reason, extra = {}) => [...S.listeners].forEach(fn => { try { fn({ reason, ...extra }); } catch (e) { console.error(e); } });
  S.subscribe = (fn) => { S.listeners.add(fn); return () => S.listeners.delete(fn); };

  function migrateLegacy() {
    for (const slug of SITE_CONFIG.TEAM_SLUGS) {
      try {
        const v = Number(localStorage.getItem('kid:' + slug));
        if (v) { S.household = [...new Set([...S.household, v])]; localStorage.removeItem('kid:' + slug); write('household', S.household); }
        localStorage.removeItem('cache:' + slug);
      } catch {}
    }
  }

  S.init = async ({ params }) => {
    S.household = read('household', []); S.codes = read('codes', {}); S.lastSeen = read('lastSeen', {});
    S.prevSeen = { ...S.lastSeen }; S.pending = read('pending', []); S.view = read('view', 'list');
    migrateLegacy();
    const c = L.parseCodeParam(params.get('c'));
    const slug = params.get('team');
    if (c.single && slug) S.setCode(slug, c.single, true);
    for (const p of c.pairs) S.setCode(p.slug, p.code, true);
    const kids = String(params.get('kids') || '').split(',').map(Number).filter(Boolean);
    if (kids.length) S.pendingKids = kids;
    if (globalThis.Api) Api.init(Object.values(S.codes));
    try { S.isCoach = !!(await Api.session()); } catch { S.isCoach = false; }
    window.addEventListener('online', () => { S.online = true; emit('online'); S.flush().then(() => S.refreshAll()); });
    window.addEventListener('offline', () => { S.online = false; emit('offline'); });
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { S.flush().then(() => S.refreshAll()); } });
    if (S.pending.length && S.online) S.flush();
  };

  S.setCode = (slug, code, quiet) => { S.codes[slug] = String(code).trim().toUpperCase(); write('codes', S.codes); if (globalThis.Api) Api.init(Object.values(S.codes)); if (!quiet) emit('codes', { slug }); };
  // Used to roll back a hand-typed code that turned out not to open the roster: a code kept
  // in storage makes hasCode() true forever, which is the difference between "you can't see
  // this" and a screen full of zeroes.
  S.clearCode = (slug, quiet) => { if (!(slug in S.codes)) return; delete S.codes[slug]; write('codes', S.codes); if (globalThis.Api) Api.init(Object.values(S.codes)); if (!quiet) emit('codes', { slug }); };
  S.hasCode = (slug) => S.isCoach || !!S.codes[slug];
  S.codePairs = () => Object.entries(S.codes).map(([slug, code]) => ({ slug, code }));
  S.setHousehold = (ids) => { S.household = [...new Set(ids.map(Number).filter(Boolean))]; write('household', S.household); emit('household'); };
  S.addKids = (ids) => S.setHousehold([...S.household, ...ids]);
  S.kidsOn = (b) => b.players.filter(p => p.active && S.household.includes(p.id));
  S.myTeams = () => Object.values(S.bundles).filter(b => b && S.kidsOn(b).length);
  S.setView = (v) => { S.view = v; write('view', v); };
  S.markSeen = (slug) => { S.lastSeen[slug] = new Date().toISOString(); write('lastSeen', S.lastSeen); };
  S.dismissChanges = (slug) => { S.prevSeen[slug] = new Date().toISOString(); };

  // ---- data ----
  S.cached = (slug) => { const c = S.bundles[slug] || read('cache:' + slug, null); if (c) S.bundles[slug] = c; return c || null; };
  const overlayPending = (b) => {                       // keep optimistic state on top of fresh server data
    for (const op of S.pending) {
      if (op.slug !== b.team.slug) continue;
      if (op.kind === 'rsvp') setRsvp(b, op.event_id, op.player_id, op.status ? { event_id: op.event_id, player_id: op.player_id, status: op.status, note: op.note || '', updated_at: op.ts } : null);
      if (op.kind === 'vote') setVote(b, op.slot_id, op.player_id, op.choice);
      if (op.kind === 'claim') setClaim(b, op.event_id, op.role, op.player_id);
      if (op.kind === 'unclaim') setClaim(b, op.event_id, op.role, null);
    }
  };
  S.fetchTeam = async (slug) => {
    const b = await Api.loadTeam(slug);
    overlayPending(b);
    S.bundles[slug] = b; write('cache:' + slug, b);
    if (S.pendingKids.length) { const mine = b.players.filter(p => S.pendingKids.includes(p.id)).map(p => p.id); if (mine.length) { S.pendingKids = S.pendingKids.filter(id => !mine.includes(id)); S.addKids(mine); } }
    emit('data', { slug });
    return b;
  };
  S.loadTeams = async (slugs) => {
    for (const slug of slugs) if (S.cached(slug)) emit('data', { slug, cached: true });
    await Promise.allSettled(slugs.map(s => S.fetchTeam(s).catch(err => { emit('fetchError', { slug: s, err }); throw err; })));
  };
  S.refreshAll = () => Promise.allSettled(Object.keys(S.bundles).map(s => S.fetchTeam(s).catch(() => {})));

  // ---- optimistic writes ----
  const setRsvp = (b, event_id, player_id, row) => { b.rsvps = b.rsvps.filter(r => !(r.event_id === event_id && r.player_id === player_id)); if (row) b.rsvps.push(row); };
  const setVote = (b, slot_id, player_id, choice) => { b.votes = b.votes.filter(v => !(v.slot_id === slot_id && v.player_id === player_id)); if (choice) b.votes.push({ slot_id, player_id, choice }); };
  const setClaim = (b, event_id, role, player_id) => { b.claims = b.claims.filter(c => !(c.event_id === event_id && c.role === role)); if (player_id) b.claims.push({ event_id, role, player_id }); };
  const touch = (slug) => { write('cache:' + slug, S.bundles[slug]); emit('data', { slug, optimistic: true }); };
  const enqueue = (op) => {
    const existing = S.pending.find(o => L.opKey(o) === L.opKey(op));
    const merged = { ...op, ts: new Date().toISOString() };
    if (existing) merged.prev = existing.prev;
    S.pending = L.coalescePending(S.pending, merged);
    write('pending', S.pending);
    S.flush();
  };
  S.hasPending = () => S.pending.length > 0;

  S.rsvp = (slug, event_id, player_id, status, note) => {
    const b = S.bundles[slug];
    const prev = b.rsvps.find(r => r.event_id === event_id && r.player_id === player_id) || null;
    const nextNote = note != null ? note : (prev?.note || '');
    setRsvp(b, event_id, player_id, status ? { event_id, player_id, status, note: nextNote, updated_at: new Date().toISOString() } : null);
    touch(slug);
    enqueue({ kind: 'rsvp', slug, event_id, player_id, status, note: nextNote, prev });
    return { undo: () => S.rsvp(slug, event_id, player_id, prev?.status || null, prev?.note || '') };
  };
  S.vote = (slug, slot_id, player_id, choice) => {
    const b = S.bundles[slug];
    const prev = b.votes.find(v => v.slot_id === slot_id && v.player_id === player_id) || null;
    setVote(b, slot_id, player_id, choice); touch(slug);
    enqueue({ kind: 'vote', slug, slot_id, player_id, choice, prev });
  };
  S.claim = (slug, event_id, role, player_id) => {
    const b = S.bundles[slug]; const prev = b.claims.find(c => c.event_id === event_id && c.role === role) || null;
    setClaim(b, event_id, role, player_id); touch(slug); enqueue({ kind: 'claim', slug, event_id, role, player_id, prev });
  };
  S.unclaim = (slug, event_id, role) => {
    const b = S.bundles[slug]; const prev = b.claims.find(c => c.event_id === event_id && c.role === role) || null;
    setClaim(b, event_id, role, null); touch(slug); enqueue({ kind: 'unclaim', slug, event_id, role, prev });
  };

  const perform = (op) => {
    if (op.kind === 'rsvp') return op.status ? Api.upsertRsvp({ event_id: op.event_id, player_id: op.player_id, status: op.status, note: op.note }) : Api.deleteRsvp(op.event_id, op.player_id);
    if (op.kind === 'vote') return op.choice ? Api.upsertVote(op.slot_id, op.player_id, op.choice) : Api.deleteVote(op.slot_id, op.player_id);
    if (op.kind === 'claim') return Api.claimRole(op.event_id, op.role, op.player_id);
    if (op.kind === 'unclaim') return Api.unclaimRole(op.event_id, op.role);
  };
  const isNetworkError = (e) => (typeof navigator !== 'undefined' && !navigator.onLine) || /fetch|network|load failed|timeout/i.test(String(e?.message || e));
  const revert = (op) => {
    const b = S.bundles[op.slug]; if (!b) return;
    if (op.kind === 'rsvp') setRsvp(b, op.event_id, op.player_id, op.prev);
    if (op.kind === 'vote') setVote(b, op.slot_id, op.player_id, op.prev?.choice || null);
    if (op.kind === 'claim' || op.kind === 'unclaim') setClaim(b, op.event_id, op.role, op.prev?.player_id || null);
    touch(op.slug);
  };
  let flushing = null;
  S.flush = () => {
    if (flushing) return flushing;
    flushing = (async () => {
      while (S.pending.length) {
        const op = S.pending[0];
        if (!S.online) { emit('queued', { op }); break; }
        try { await perform(op); }
        catch (err) {
          if (isNetworkError(err)) { emit('queued', { op }); break; }      // keep it; retry on online/visible
          if (S.pending[0] === op) { S.pending.shift(); write('pending', S.pending); }
          const superseded = S.pending.some(o => L.opKey(o) === L.opKey(op));
          if (!superseded) revert(op);
          emit('error', { op, err }); continue;
        }
        // A same-key op may have been coalesced into a replacement (appended at the tail)
        // while `op` was in flight — only remove it from the queue if it's still there.
        if (S.pending[0] === op) { S.pending.shift(); write('pending', S.pending); }
      }
    })().finally(() => { flushing = null; });
    return flushing;
  };

  // ---- coach ----
  S.coachWrite = async (slug, fn) => { const r = await fn(); await S.fetchTeam(slug); return r; };

  globalThis.Store = S;
})();
