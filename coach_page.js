/* coach_page.js — the admin page coach.html boots.
   Passcode sign-in, a cross-team "at a glance" summary, then per-team schedule
   actions, roster + contacts (paste-add, mark-all-inactive), announcements and
   team settings. Every write goes through CoachSheets or Store.coachWrite(),
   which refetch the bundle so the page re-renders off the 'data' event.

   ES module. Reads Store (store.js), UI (ui.js), ScheduleLib (schedule_lib.js),
   CoachSheets (coach_sheets.js) and whichever Api is live (api.js, or
   mock_api.js under ?mock=). */

const L = globalThis.ScheduleLib, S = globalThis.Store, U = globalThis.UI, C = globalThis.CoachSheets;
const params = new URLSearchParams(location.search);
const app = document.getElementById('app'), topEl = document.getElementById('topbar');
const DEFAULT_COLOR = '#2d6a4f';

const ui = { tab: params.get('team') || SITE_CONFIG.TEAM_SLUGS[0] };
if (!SITE_CONFIG.TEAM_SLUGS.includes(ui.tab)) ui.tab = SITE_CONFIG.TEAM_SLUGS[0];

// #topbar carries the sticky .topbar class itself (same as home_page.js): a wrapper
// sized to its own content leaves position:sticky nothing to travel inside, so the
// bar would scroll away. Empty markup drops the class so no bare colour band shows.
const setTop = (html) => { topEl.className = html ? 'topbar' : ''; topEl.innerHTML = html; };
const setAccent = (color) => {
  document.documentElement.style.setProperty('--team', color);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', color);
};

// ---------- boot ----------
async function boot() {
  if (params.get('mock')) { globalThis.MOCK_MODE = params.get('mock'); await import('./mock_api.js'); }
  await S.init({ params });
  S.subscribe(onStore);
  app.addEventListener('click', onClick);
  topEl.addEventListener('click', onClick);
  if (!S.isCoach) { renderLogin(); return; }
  await S.loadTeams(SITE_CONFIG.TEAM_SLUGS);
  render();
}
function onStore(ev) {
  if (!S.isCoach) return;                       // the login card owns the page until sign-in lands
  if (ev.reason === 'data' || ev.reason === 'online' || ev.reason === 'offline') render();
  if (ev.reason === 'error') U.toast('Couldn’t save — try again');
  if (ev.reason === 'fetchError' && !S.cached(ev.slug)) render();
}

// ---------- sign in ----------
function renderLogin() {
  setAccent(DEFAULT_COLOR);
  document.title = 'Coach sign-in';
  setTop('<div class="topbar-inner"><div class="brand"><span class="brand-name">Coach</span></div></div>');
  app.innerHTML = `<div class="card card-pad stack" style="margin-top:20px">
    <h1 style="font-size:20px;margin:0">Coach sign-in</h1>
    <div class="field" style="margin-bottom:0"><label for="pw">Passcode</label>
      <input id="pw" type="password" autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false"></div>
    <button type="button" class="btn btn-primary btn-block" data-action="login">Unlock</button>
    <p id="err" class="tiny" role="alert" style="color:var(--danger);margin:0"></p>
    <p class="tiny muted" style="margin:0"><a href="index.html">← Back to the schedule</a></p></div>`;
  const pw = app.querySelector('#pw');
  pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') onAction('login'); });
  pw.focus();
}
let signingIn = false;
async function login() {
  const input = app.querySelector('#pw'), err = app.querySelector('#err'), btn = app.querySelector('[data-action="login"]');
  if (!input || signingIn) return;
  const pw = input.value;
  if (!pw) { err.textContent = 'Enter the passcode.'; input.focus(); return; }
  signingIn = true; btn.disabled = true; err.textContent = '';
  let error = null;
  // Supabase resolves with { error } for a bad password but throws on a network failure;
  // either way the coach just needs one message and the field back.
  try { ({ error } = await Api.signIn(SITE_CONFIG.COACH_EMAIL, pw)); } catch (e) { error = e; }
  signingIn = false;
  if (!app.contains(btn)) return;               // the page moved on while the request was in flight
  btn.disabled = false;
  if (error) { err.textContent = S.online ? 'Wrong passcode' : 'You’re offline — signing in needs a connection.'; input.value = ''; input.focus(); return; }
  S.isCoach = true;
  await S.loadTeams(SITE_CONFIG.TEAM_SLUGS);
  render();
}
async function logout() {
  try { await Api.signOut(); } catch {}
  // The cached bundles hold parent phone numbers and emails, so they leave with the session.
  for (const slug of SITE_CONFIG.TEAM_SLUGS) { try { localStorage.removeItem('wolves:cache:' + slug); } catch {} }
  // A reload re-reads the session; under ?mock=coach that would sign straight back in, so drop to ?mock=1.
  const p = new URLSearchParams(location.search);
  if (p.get('mock')) p.set('mock', '1');
  const q = p.toString();
  location.replace(location.pathname + (q ? '?' + q : ''));
}

// ---------- render ----------
const bundles = () => SITE_CONFIG.TEAM_SLUGS.map(s => S.bundles[s]).filter(Boolean);
const shortName = (team) => team.name.split(' ').filter(Boolean).slice(-1)[0] || team.name;

function render() {
  const bs = bundles();
  if (!bs.length) {
    setAccent(DEFAULT_COLOR);
    setTop(`<div class="topbar-inner"><div class="brand"><span class="brand-name">Coach admin</span></div>
      <button type="button" class="btn btn-ghost btn-sm" data-action="logout">Sign out</button></div>`);
    app.innerHTML = '<div class="empty">Can’t reach the schedule server. <button type="button" class="btn" data-action="refresh">Try again</button></div>';
    return;
  }
  const b = bs.find(x => x.team.slug === ui.tab) || bs[0];
  ui.tab = b.team.slug;
  const y = window.scrollY;
  setAccent(b.team.color || DEFAULT_COLOR);
  document.title = 'Coach · ' + b.team.name;
  setTop(topbarHtml(bs, b));
  app.innerHTML = summaryHtml(bs) + teamAdminHtml(b);
  window.scrollTo(0, y);
}

function topbarHtml(bs, b) {
  const tabs = bs.length > 1
    ? `<div class="topbar-inner" style="padding-top:0"><div class="seg" role="group" aria-label="Team">${bs.map(x =>
        `<button type="button" aria-pressed="${x.team.slug === ui.tab}" ${U.dataAttrs({ action: 'tab', slug: x.team.slug })}>${U.esc(x.team.emoji)} ${U.esc(shortName(x.team))}</button>`).join('')}</div></div>`
    : '';
  return `<div class="topbar-inner"><div class="brand"><span class="brand-name">Coach admin</span></div>
    <a class="btn btn-ghost btn-sm" href="index.html?team=${encodeURIComponent(b.team.slug)}">Team page</a>
    <button type="button" class="btn btn-ghost btn-sm" data-action="logout">Sign out</button></div>${tabs}`;
}

function summaryHtml(bs) {
  const now = new Date();
  const cards = bs.map((b) => {
    const tz = b.team.tz || 'America/New_York';
    const n = L.nextEvent(b.events, b.team, now);
    const s = n ? L.summarizeRsvps(b.players, b.rsvps.filter(r => r.event_id === n.id), b.team.min_players) : null;
    const open = n ? (n.volunteer_roles || []).filter(r => !b.claims.some(c => c.event_id === n.id && c.role === r)) : [];
    const openLine = open.length ? `<div class="tiny" style="color:var(--maybe)">Open: ${U.esc(open.join(', '))}</div>` : '';
    const next = n
      ? `<div style="margin-top:6px">${U.esc(L.relativeDay(n.starts_at, tz, now))} ${n.time_tbd ? 'TBD' : U.esc(L.fmtTime(n.starts_at, tz))} · ${U.esc(L.eventTitle(n))}</div>
         ${U.headcountLine(s, b.team.min_players)}${openLine}`
      : '<div class="muted" style="margin-top:6px">Nothing scheduled yet.</div>';
    return `<button type="button" class="card card-pad" style="display:block;width:100%;text-align:left;font:inherit;color:inherit" ${U.dataAttrs({ action: 'tab', slug: b.team.slug })}>
      <div class="cluster" style="justify-content:space-between"><b>${U.esc(b.team.emoji)} ${U.esc(b.team.name)}</b>
      <span class="tiny muted">${b.players.filter(p => p.active).length} active players</span></div>${next}</button>`;
  }).join('');
  return `<section class="section" style="margin-top:6px"><div class="section-title" style="margin-bottom:8px">At a glance</div>
    <div class="stack">${cards}</div></section>`;
}

function teamAdminHtml(b) {
  const slug = b.team.slug;
  const roster = b.players.map((p) => {
    const c = b.contacts.find(x => x.player_id === p.id) || {};
    const sub = [c.parent_name, c.phone, c.email].filter(Boolean).join(' · ');
    return `<button type="button" class="row" style="grid-template-columns:1fr auto" ${U.dataAttrs({ action: 'player', slug, player: p.id })}>
      <div><div class="row-title">${U.esc(L.displayName(p))}${p.active ? '' : ' <span class="badge badge-tbd">Inactive</span>'}</div>
      <div class="row-sub">${sub ? U.esc(sub) : 'No contact info'}</div></div>${U.icon('chevron')}</button>`;
  }).join('');
  const activeCount = b.players.filter(p => p.active).length;
  return `<section class="section"><div class="section-head"><span class="section-title">Schedule</span></div>
      <div class="cluster">
        <button type="button" class="btn" ${U.dataAttrs({ action: 'add', slug })}>${U.icon('plus')} Add event</button>
        <button type="button" class="btn" ${U.dataAttrs({ action: 'bulk', slug })}>${U.icon('calendar')} Add a series</button>
        <button type="button" class="btn" ${U.dataAttrs({ action: 'announce', slug })}>${U.icon('megaphone')} Announce</button>
        <button type="button" class="btn" ${U.dataAttrs({ action: 'poll', slug })}>${U.icon('users')} New poll</button>
      </div>
      <p class="tiny muted" style="margin-top:8px">Edit, cancel, reschedule or nudge from the <a href="index.html?team=${encodeURIComponent(slug)}">team page</a> (you’re in coach mode there).</p></section>
    <section class="section"><div class="section-head"><span class="section-title">Roster <span class="muted tiny">${activeCount} active</span></span>
        <span class="cluster"><button type="button" class="btn btn-sm" ${U.dataAttrs({ action: 'paste', slug })}>Paste names</button>
        <button type="button" class="btn btn-sm" ${U.dataAttrs({ action: 'add-player', slug })}>+ Player</button></span></div>
      <div class="rowlist">${roster || '<div class="empty">No players yet — paste names to get started.</div>'}</div>
      ${activeCount ? `<div class="cluster" style="margin-top:8px"><button type="button" class="btn btn-sm btn-ghost" ${U.dataAttrs({ action: 'all-inactive', slug })}>Mark all inactive (season rollover)</button></div>` : ''}</section>
    <section class="section"><div class="section-head"><span class="section-title">Announcements</span>
        <button type="button" class="btn btn-sm" ${U.dataAttrs({ action: 'announce', slug })}>${U.icon('plus')} New</button></div>
      <div class="card">${b.posts.length ? b.posts.map(p => U.postItem(p, b.team, { isCoach: true, slug })).join('') : '<div class="empty">None yet.</div>'}</div></section>
    <section class="section"><div class="section-head"><span class="section-title">Settings</span></div>
      <button type="button" class="btn btn-block" ${U.dataAttrs({ action: 'settings', slug })}>${U.icon('edit')} Team settings &amp; invite link</button>
      <p class="tiny muted" style="margin-top:8px">Calendar feed: <a href="${encodeURIComponent(slug)}.ics">${U.esc(slug)}.ics</a></p></section>`;
}

// ---------- roster sheets owned by this page ----------
// (Everything else routes into CoachSheets, which is shared with the team page.)
const saveFailed = (e) => { U.toast('Save failed: ' + (e?.message || e)); return false; };
const coachWrite = (slug, fn) => S.coachWrite(slug, fn).then(() => true, saveFailed);

function addPlayerSheet(slug) {
  const b = S.bundles[slug]; if (!b) return;
  const { root, close } = U.sheet({ title: 'Add player', html: `
    <div class="field-row"><div class="field"><label for="np-first">First name</label><input id="np-first" autofocus></div>
    <div class="field"><label for="np-init">Last initial</label><input id="np-init" maxlength="1"></div></div>
    <div class="sheet-actions"><button type="button" class="btn btn-primary" data-ok>Add</button>
    <button type="button" class="btn btn-ghost" data-cancel>Cancel</button></div>` });
  const okBtn = root.querySelector('[data-ok]');
  root.querySelector('[data-cancel]').onclick = () => close();
  okBtn.onclick = async () => {
    const first = root.querySelector('#np-first').value.trim();
    if (!first) return U.toast('Enter a first name');
    okBtn.disabled = true;
    const ok = await coachWrite(slug, () => Api.savePlayer({ team_id: b.team.id, first_name: first, last_initial: root.querySelector('#np-init').value.trim() || null, active: true }));
    if (!ok) { okBtn.disabled = false; return; }
    close(); U.toast('Added ' + first);
  };
}

function pasteSheet(slug) {
  const b = S.bundles[slug]; if (!b) return;
  const { root, close } = U.sheet({ title: 'Paste names', html: `
    <p class="muted tiny">One per line: “Kate B” or just “Kate”. Jersey numbers and “Last, First” both work.</p>
    <div class="field"><textarea id="paste" rows="8" autofocus></textarea></div>
    <div data-preview></div>
    <div class="sheet-actions"><button type="button" class="btn" data-prev>Preview</button>
    <button type="button" class="btn btn-primary" data-ok disabled>Add players</button>
    <button type="button" class="btn btn-ghost" data-cancel>Cancel</button></div>` });
  const okBtn = root.querySelector('[data-ok]'), preview = root.querySelector('[data-preview]');
  let rows = [];
  // Any edit after a preview invalidates it, so "Add players" can never insert a stale list.
  const invalidate = () => { rows = []; okBtn.disabled = true; okBtn.textContent = 'Add players'; preview.innerHTML = ''; };
  root.querySelector('#paste').addEventListener('input', invalidate);
  root.querySelector('[data-cancel]').onclick = () => close();
  root.querySelector('[data-prev]').onclick = () => {
    rows = L.parseRosterPaste(root.querySelector('#paste').value);
    preview.innerHTML = rows.length
      ? `<div class="chips">${rows.map(r => `<span class="chip">${U.esc(L.displayName(r))}</span>`).join('')}</div>`
      : '<p class="muted">Nothing to add.</p>';
    okBtn.disabled = !rows.length;
    okBtn.textContent = rows.length ? `Add ${rows.length} player${rows.length === 1 ? '' : 's'}` : 'Add players';
  };
  okBtn.onclick = async () => {
    const n = rows.length; if (!n) return;
    okBtn.disabled = true;
    const ok = await coachWrite(slug, async () => { for (const r of rows) await Api.savePlayer({ team_id: b.team.id, first_name: r.first_name, last_initial: r.last_initial, active: true }); });
    if (!ok) { okBtn.disabled = false; return; }
    close(); U.toast(`Added ${n} player${n === 1 ? '' : 's'}`);
  };
}

async function markAllInactive(slug) {
  const b = S.bundles[slug]; if (!b) return;
  const active = b.players.filter(p => p.active);
  if (!active.length) return U.toast('Nobody is active');
  if (!(await U.confirm({ title: 'Mark everyone inactive?', body: 'Use this at season end. Parents’ saved players will stop showing until you re-activate them.', confirmLabel: 'Mark all inactive', danger: true }))) return;
  const ok = await coachWrite(slug, async () => { for (const p of active) await Api.savePlayer({ id: p.id, active: false }); });
  if (ok) U.toast(`${active.length} player${active.length === 1 ? '' : 's'} marked inactive`);
}

// ---------- actions ----------
const actions = {
  login,
  logout,
  refresh: () => { U.toast('Refreshing…', { duration: 1200 }); S.refreshAll(); },
  tab: (d) => { if (d.slug === ui.tab) return; ui.tab = d.slug; render(); window.scrollTo(0, 0); },
  add: (d) => C.eventSheet({ slug: d.slug }),
  bulk: (d) => C.bulkAddSheet({ slug: d.slug }),
  announce: (d) => C.announceSheet({ slug: d.slug }),
  poll: (d) => C.pollSheet({ slug: d.slug }),
  settings: (d) => C.settingsSheet({ slug: d.slug }),
  // U.postItem renders the coach Edit button with this action.
  'coach-post-edit': (d) => {
    const post = S.bundles[d.slug]?.posts.find(p => p.id === Number(d.post));
    if (post) C.announceSheet({ slug: d.slug, post });
  },
  player: (d) => {
    const player = S.bundles[d.slug]?.players.find(p => p.id === Number(d.player));
    if (player) C.playerSheet({ slug: d.slug, player });
  },
  'add-player': (d) => addPlayerSheet(d.slug),
  paste: (d) => pasteSheet(d.slug),
  'all-inactive': (d) => markAllInactive(d.slug),
};
function onAction(name, d = {}, el) { const fn = actions[name]; if (fn) fn(d, el); }
function onClick(ev) {
  const el = ev.target.closest('[data-action]');
  if (!el || el.tagName === 'A') return;        // links navigate on their own
  onAction(el.dataset.action, el.dataset, el);
}

boot();
