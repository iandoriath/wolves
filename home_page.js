/* home_page.js — the parent app that index.html boots.
   First-run player picker, merged household schedule, "needs your answer" strip,
   hero, polls, list/month schedule and the footer sheets.

   ES module. Reads Store (store.js), UI (ui.js), ScheduleLib (schedule_lib.js)
   and whichever Api is live (api.js, or mock_api.js under ?mock=).
   Exposes globalThis.HomePage so coach_sheets wiring can extend `actions`
   and call back into render()/ctxFor(). */

const L = globalThis.ScheduleLib, S = globalThis.Store, U = globalThis.UI;
const params = new URLSearchParams(location.search);
const app = document.getElementById('app'), topEl = document.getElementById('topbar');
const ORIGIN = SITE_CONFIG.ORIGIN;
const DEFAULT_COLOR = '#2d6a4f';

const ui = {
  teamFilter: params.get('team') || 'all', filter: 'all', expanded: new Set(),
  month: null, selectedDay: null, postsOpen: false, changesDismissed: new Set(),
  pendingEventOpen: Number(params.get('event')) || null,
  pendingPollOpen: Number(params.get('poll')) || null,
  booted: false,
};
const ls = {
  get: (k) => { try { return localStorage.getItem('wolves:' + k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem('wolves:' + k, v); } catch {} },
  del: (k) => { try { localStorage.removeItem('wolves:' + k); } catch {} },
};

// ---------- boot ----------
async function boot() {
  if (params.get('mock')) { globalThis.MOCK_MODE = params.get('mock'); await import('./mock_api.js'); }
  await S.init({ params });
  S.subscribe(onStore);
  app.addEventListener('click', onClick);
  topEl.addEventListener('click', onClick);
  if (ui.teamFilter !== 'all' && !SITE_CONFIG.TEAM_SLUGS.includes(ui.teamFilter)) ui.teamFilter = 'all';
  try { await S.loadTeams(SITE_CONFIG.TEAM_SLUGS); } catch {}
  ui.booted = true;
  render();
}
function onStore(ev) {
  if (ev.reason === 'data' || ev.reason === 'household' || ev.reason === 'online' || ev.reason === 'offline' || ev.reason === 'codes') render();
  if (ev.reason === 'error') U.toast('Couldn’t save — try again');
  if (ev.reason === 'queued') U.toast('You’re offline — saved on this phone, will sync when you’re back online');
  if (ev.reason === 'fetchError' && !S.cached(ev.slug)) render();
}

// ---------- helpers ----------
const allBundles = () => SITE_CONFIG.TEAM_SLUGS.map(s => S.bundles[s]).filter(Boolean);
const myBundles = () => allBundles().filter(b => S.kidsOn(b).length);
function teamsInView() {
  if (ui.teamFilter !== 'all') return allBundles().filter(b => b.team.slug === ui.teamFilter);
  const mine = myBundles();
  if (mine.length) return mine;
  return S.isCoach ? allBundles() : [];
}
const now = () => new Date();
const ctxFor = (b, e, extra = {}) => ({
  b, team: b.team, e, kids: S.kidsOn(b), isCoach: S.isCoach, now: now(), slug: b.team.slug, origin: ORIGIN,
  readOnly: !S.hasCode(b.team.slug), expanded: ui.expanded.has(e.id), showTeam: !!extra.showTeam,
  overlapWith: extra.overlaps?.get(e.id), multiKid: S.household.length > 1,
  prevSeen: ui.changesDismissed.has(b.team.slug) ? null : S.prevSeen[b.team.slug],
});
const findEvent = (slug, id) => S.bundles[slug]?.events.find(e => e.id === Number(id));
const teamColor = (b) => b.team.color || DEFAULT_COLOR;
const tzOf = (b) => b.team.tz || 'America/New_York';
const matchesFilter = (e) => ui.filter === 'all' || (ui.filter === 'games' ? e.kind === 'game' : e.kind === 'practice');
const filtered = (events) => events.filter(matchesFilter);
// The invite link (?team=…&c=CODE) and a cold start both land on the picker; a bare
// ?team=… link is a browse link, so it goes straight to that team's schedule.
const isFirstRun = () => !S.isCoach && !S.household.length && !ls.get('browsing')
  && (ui.teamFilter === 'all' || S.hasCode(ui.teamFilter));

// ---------- render ----------
// #topbar carries the sticky .topbar class itself — a wrapper sized to its own
// content leaves position:sticky nothing to travel inside, so the bar would
// scroll away. Empty markup drops the class so no bare colour band shows.
const setTop = (html) => { topEl.className = html ? 'topbar' : ''; topEl.innerHTML = html; };

function render() {
  if (!ui.booted) return;
  const y = window.scrollY;
  const bundles = allBundles();
  if (!bundles.length) {
    setTop(topbarHtml(null, false));
    app.innerHTML = `<div class="empty">Can’t reach the schedule server. <button class="btn" data-action="refresh">Try again</button></div>`;
    return;
  }
  const inView = teamsInView();
  const single = inView.length === 1 ? inView[0] : null;
  const accent = single ? teamColor(single) : DEFAULT_COLOR;
  document.documentElement.style.setProperty('--team', accent);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', accent);
  document.title = single ? single.team.name : 'My schedule';
  const firstRun = isFirstRun();
  setTop(topbarHtml(single, !firstRun));
  if (firstRun) { app.innerHTML = firstRunHtml(); window.scrollTo(0, 0); return; }
  if (!inView.length) { app.innerHTML = teamChooserHtml(); window.scrollTo(0, y); return; }
  app.innerHTML = homeHtml(inView);
  window.scrollTo(0, y);
  afterRender(inView);
}
// Smooth scrolling is off in some browsers and under reduced-motion settings, where
// scrollIntoView({behavior:'smooth'}) simply does nothing — so check whether the page
// actually moved and jump outright if it didn't. A deep link has to land either way.
function jumpTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const before = window.scrollY;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  setTimeout(() => { if (window.scrollY === before) el.scrollIntoView({ block: 'start' }); }, 300);
}
function afterRender(inView) {
  if (ui.pendingEventOpen) {
    const id = ui.pendingEventOpen; ui.pendingEventOpen = null;
    const b = inView.find(x => x.events.some(e => e.id === id));
    if (b) {
      ui.expanded.add(id); S.setView('list'); render();
      jumpTo('event-' + id);
      return;
    }
  }
  if (ui.pendingPollOpen) {
    const id = ui.pendingPollOpen; ui.pendingPollOpen = null;
    jumpTo('poll-' + id);
  }
  for (const b of inView) S.markSeen(b.team.slug);
}

function topbarHtml(single, showTabs = true) {
  // A kid on two teams is one person — show the name once.
  const names = [...new Set(myBundles().flatMap(b => S.kidsOn(b)).map(k => k.first_name))];
  const chips = names.length ? `<button class="chip" data-action="pick-kids" aria-label="Change my players">${U.icon('users')} ${U.esc(names.join(' · '))}</button>` : '';
  const brand = single
    ? `<span class="brand-emoji">${U.esc(single.team.emoji)}</span><span class="brand-name">${U.esc(single.team.name)}</span>`
    : `<span class="brand-emoji">${U.icon('home')}</span><span class="brand-name">My schedule</span>`;
  return `<div class="topbar-inner"><div class="brand">${brand}</div>
    ${S.isCoach ? '<span class="chip" title="Coach mode">Coach</span>' : ''}${chips}${refreshIndicator()}</div>
    ${showTabs ? teamTabsHtml() : ''}`;
}
function refreshIndicator() {
  const b = teamsInView()[0] || allBundles()[0];
  if (!b) return '';
  const label = !S.online ? 'Offline'
    : U.relTimeLabel(b.fetchedAt, tzOf(b)).replace('just now', 'Updated now').replace(/^(\d)/, 'Updated $1');
  return `<button class="btn btn-ghost btn-sm" data-action="refresh" aria-label="Refresh" title="${U.esc(label)}">${U.icon('refresh')}</button>`;
}
function teamTabsHtml() {
  const mine = myBundles();
  // A coach always gets the tabs: the coach tools all write to one team, so without a
  // way to narrow the view down to a single team they'd have nothing to act on.
  if (mine.length < 2 && ui.teamFilter === 'all' && !S.isCoach) return '';
  const tabs = [{ slug: 'all', label: 'All' }, ...allBundles().map(b => ({ slug: b.team.slug, label: `${b.team.emoji} ${b.team.name.split(' ').slice(-1)[0]}` }))];
  return `<div class="topbar-inner" style="padding-top:0"><div class="seg" role="group" aria-label="Team">${tabs.map(t => `<button type="button" aria-pressed="${ui.teamFilter === t.slug}" ${U.dataAttrs({ action: 'team-tab', slug: t.slug })}>${U.esc(t.label)}</button>`).join('')}</div></div>`;
}

// ---------- first run ----------
function firstRunHtml() {
  const target = allBundles().filter(b => S.hasCode(b.team.slug) && b.players.some(p => p.active));
  if (!target.length) return teamChooserHtml(true);
  const many = target.length > 1 || target[0].players.filter(p => p.active).length > 1;
  return `<div class="card card-pad stack" style="margin-top:8px">
    <div class="kicker">Welcome</div><h1>Pick your player${many ? '(s)' : ''}</h1>
    <p class="muted">Tap the kids you’re here for — you’ll RSVP for them in one tap. No account needed. You can change this anytime.</p>
    ${pickerFormHtml(target)}
    <button class="btn btn-primary btn-block" data-action="picker-done">Done</button>
    <p class="tiny muted">My player isn’t listed? Ask Coach to add them. <button class="btn btn-ghost btn-sm" data-action="browse">Just browsing</button></p></div>`;
}
function pickerFormHtml(bundles) {
  return bundles.map(b => `<div><div class="kicker" style="margin:10px 0 6px">${U.esc(b.team.emoji)} ${U.esc(b.team.name)}</div><div class="chips" data-picker="${U.esc(b.team.slug)}">
    ${b.players.filter(p => p.active).map(p => `<button type="button" class="chip ${S.household.includes(p.id) ? 'on' : ''}" ${U.dataAttrs({ action: 'picker-toggle', player: p.id })} aria-pressed="${S.household.includes(p.id)}">${U.esc(L.displayName(p))}</button>`).join('')}</div></div>`).join('');
}
function teamChooserHtml(firstRun = false) {
  const head = firstRun
    ? '<h1>Team schedules</h1><p class="muted">Have an invite link from your coach? Tap it to pick your player and RSVP. Otherwise, browse a schedule:</p>'
    : '<h1>Teams</h1>';
  const cards = allBundles().map(b => {
    const n = L.nextEvent(b.events, b.team, now());
    const sub = n ? `Next: ${U.esc(L.relativeDay(n.starts_at, tzOf(b), now()))} · ${U.esc(L.eventTitle(n))}` : 'Nothing scheduled yet';
    return `<button type="button" class="card card-pad" style="display:flex;gap:12px;align-items:center;width:100%;text-align:left" ${U.dataAttrs({ action: 'team-tab', slug: b.team.slug })}>
      <span style="font-size:32px">${U.esc(b.team.emoji)}</span><span style="flex:1"><b>${U.esc(b.team.name)}</b><div class="tiny muted">${sub}</div></span>${U.icon('chevron')}</button>`;
  }).join('');
  return `<div class="stack" style="margin-top:8px">${head}${cards}
    <p class="tiny muted"><a href="coach.html">Coach</a></p></div>`;
}

// ---------- home ----------
function homeHtml(inView) {
  const showTeam = inView.length > 1;
  const parts = [];
  // notices
  if (!S.online) parts.push(`<div class="notice notice-warn">${U.icon('alert')}<div>You’re offline — showing the saved schedule. RSVPs you tap will sync later.</div></div>`);
  for (const b of inView) if (!S.hasCode(b.team.slug)) parts.push(`<div class="notice notice-info">${U.icon('info')}<div><b>${U.esc(b.team.name)}</b>: tap your invite link to RSVP and see who’s going.</div></div>`);
  if (U.isIOS && !U.isStandalone && !ls.get('installHintDismissed') && S.household.length) parts.push(`<div class="notice notice-info">${U.icon('share')}<div>Add this to your Home Screen: tap <b>Share</b> then <b>Add to Home Screen</b>. <button class="btn btn-ghost btn-sm" data-action="install-dismiss">Got it</button></div></div>`);
  // coach tools: every sheet writes to exactly one team, so the row only appears once
  // the view is narrowed to one — otherwise point at the tabs that narrow it.
  if (S.isCoach) parts.push(inView.length === 1
    ? coachBarHtml(inView[0].team.slug)
    : '<p class="tiny muted">Coach tools: pick a team tab to add events, announce, or manage.</p>');
  parts.push(postsHtml(inView));
  parts.push(changesHtml(inView));
  // needs your answer — only for teams this phone can actually write to
  const needs = L.needsAnswer(inView.filter(b => S.hasCode(b.team.slug)), S.household, now());
  if (needs.length) parts.push(`<section class="section"><div class="section-head"><span class="section-title">Needs your answer <span class="pill pill-silent">${needs.length}</span></span></div><div class="strip">${needs.slice(0, 8).map(i => U.needsRow(i, { now: now(), multiKid: S.household.length > 1 })).join('')}${needs.length > 8 ? `<div class="strip-row tiny muted">…and ${needs.length - 8} more below</div>` : ''}</div></section>`);
  // hero
  const merged = inView.flatMap(b => b.events.map(e => ({ event: e, team: b.team, b })));
  const overlaps = L.findOverlaps(merged.map(x => ({ event: x.event, team: x.team })));
  const nexts = inView.map(b => ({ b, e: L.nextEvent(b.events, b.team, now()) })).filter(x => x.e).sort((x, y) => L.T(x.e.starts_at) - L.T(y.e.starts_at));
  if (nexts.length) {
    const { b, e } = nexts[0]; const tz = tzOf(b); const key = L.dateKey(e.starts_at, tz);
    // The hero formats these with its own team's tz and slug, so only that team's events belong here.
    const alsoToday = b.events.filter(x => x.id !== e.id && x.status !== 'cancelled'
      && L.dateKey(x.starts_at, tz) === key && !L.isPast(x, b.team, now())).sort(L.byStart);
    parts.push(`<section class="section">${U.hero(ctxFor(b, e, { showTeam, overlaps }), { alsoToday })}</section>`);
  } else parts.push('<div class="empty">Nothing scheduled yet — check back soon.</div>');
  // polls
  for (const b of inView) for (const poll of b.polls.filter(p => p.status === 'open')) parts.push(`<section class="section">${U.pollCard(ctxFor(b, { id: 0 }), poll)}</section>`);
  parts.push(scheduleHtml(inView, showTeam, overlaps));
  parts.push(footerHtml());
  if (S.isCoach && inView.length === 1) parts.push(fabHtml(inView[0].team.slug));
  return parts.join('');
}
function postsHtml(inView) {
  const items = inView.flatMap(b => b.posts.map(p => ({ p, b }))).filter(x => S.hasCode(x.b.team.slug));
  if (!items.length) return '';
  const pinned = items.filter(x => x.p.pinned);
  const rest = items.filter(x => !x.p.pinned).sort((a, b) => L.T(b.p.created_at) - L.T(a.p.created_at));
  const isNew = (x) => { const ps = ui.changesDismissed.has(x.b.team.slug) ? null : S.prevSeen[x.b.team.slug]; return !!ps && L.T(x.p.created_at) > L.T(ps); };
  const opts = (x) => ({ isNew: isNew(x), isCoach: S.isCoach, slug: x.b.team.slug, now: now() });
  const newCount = rest.filter(isNew).length;
  return `<section class="section stack" style="margin-top:8px">${pinned.map(x => `<div class="card">${U.postItem(x.p, x.b.team, opts(x))}</div>`).join('')}
    ${rest.length ? `<details class="card" ${ui.postsOpen || newCount ? 'open' : ''}><summary class="post" style="font-weight:700">${U.icon('megaphone')} Updates ${newCount ? `<span class="badge badge-new">${newCount} new</span>` : `<span class="muted tiny">(${rest.length})</span>`}</summary>${rest.map(x => U.postItem(x.p, x.b.team, opts(x))).join('')}</details>` : ''}</section>`;
}
function changesHtml(inView) {
  const rows = [];
  for (const b of inView) {
    if (ui.changesDismissed.has(b.team.slug)) continue;
    const ch = L.changedSince(b, S.prevSeen[b.team.slug], now());
    for (const { event: e, isNew } of ch.events) {
      const label = e.status === 'cancelled' ? 'Cancelled' : isNew ? 'New' : e.rescheduled_from ? 'Moved' : 'Updated';
      rows.push(`<button type="button" class="strip-row" style="width:100%;text-align:left;background:none;border-left:0;border-right:0;border-bottom:0" ${U.dataAttrs({ action: 'open-event', slug: b.team.slug, event: e.id })}><span class="badge ${e.status === 'cancelled' ? 'badge-cancelled' : 'badge-new'}">${label}</span><span style="flex:1">${U.esc(L.fmtDay(e.starts_at, tzOf(b)))} · ${U.esc(L.eventTitle(e))}</span>${U.icon('chevron')}</button>`);
    }
  }
  if (!rows.length) return '';
  return `<section class="section"><div class="section-head"><span class="section-title">Since your last visit</span><button class="btn btn-ghost btn-sm" data-action="dismiss-changes">Dismiss</button></div><div class="strip">${rows.join('')}</div></section>`;
}
function scheduleHtml(inView, showTeam, overlaps) {
  const merged = inView.flatMap(b => b.events.map(e => ({ e, b })));
  const upcoming = merged.filter(x => !L.isPast(x.e, x.b.team, now())).sort((a, c) => L.byStart(a.e, c.e));
  const past = merged.filter(x => L.isPast(x.e, x.b.team, now())).sort((a, c) => L.byStart(c.e, a.e));
  const head = `<div class="section-head"><span class="section-title">Schedule</span><div class="seg" role="group" aria-label="Schedule view"><button type="button" aria-pressed="${S.view === 'list'}" ${U.dataAttrs({ action: 'view', view: 'list' })} aria-label="List view">${U.icon('list')}</button><button type="button" aria-pressed="${S.view === 'month'}" ${U.dataAttrs({ action: 'view', view: 'month' })} aria-label="Month view">${U.icon('grid')}</button></div></div>
    <div class="chips" style="margin-bottom:10px">${[['all', 'All'], ['games', 'Games'], ['practices', 'Practices']].map(([k, l]) => `<button type="button" class="chip ${ui.filter === k ? 'on' : ''}" aria-pressed="${ui.filter === k}" ${U.dataAttrs({ action: 'filter', filter: k })}>${l}</button>`).join('')}</div>`;
  const tz = tzOf(inView[0]);
  let body;
  if (S.view === 'month') {
    const z = L.utcToZoned(now().toISOString(), tz);
    if (!ui.month) ui.month = { y: z.y, m: z.m };
    // Each dot formats its own time, so stamp the event with its team's tz/colour before merging.
    const evs = filtered(merged.map(x => Object.assign({}, x.e, { _tz: tzOf(x.b), _slug: x.b.team.slug, _color: teamColor(x.b) })));
    const grid = L.monthGrid(ui.month.y, ui.month.m, evs, tz, now());
    const sel = ui.selectedDay ? grid.weeks.flat().find(c => c.key === ui.selectedDay) : null;
    const dayRows = sel
      ? (sel.events.length
        ? `<div class="rowlist" style="margin-top:10px">${sel.events.map(e => { const b = S.bundles[e._slug]; const real = b?.events.find(x => x.id === e.id); return real ? U.eventRow(ctxFor(b, real, { showTeam, overlaps })) : ''; }).join('')}</div>`
        : '<div class="empty">Nothing on this day.</div>')
      : '<p class="tiny muted" style="text-align:center;margin-top:8px">Tap a day to see its events.</p>';
    body = U.monthGrid(grid, { selectedKey: ui.selectedDay, colorFor: (e) => e._color }) + dayRows;
  } else {
    const byId = new Map(upcoming.map(x => [x.e.id, x.b]));
    const weeks = L.groupByWeek(filtered(upcoming.map(x => x.e)), tz, now());
    body = weeks.length
      ? weeks.map(w => `<div class="kicker" style="margin:14px 0 6px">${U.esc(w.label)}</div><div class="rowlist">${w.events.map(e => U.eventRow(ctxFor(byId.get(e.id), e, { showTeam, overlaps }))).join('')}</div>`).join('')
      : '<div class="empty">No upcoming events.</div>';
  }
  const rec = inView.map(b => ({ b, r: L.record(b.events) })).filter(x => x.r.w + x.r.l + x.r.t);
  const recLabel = rec.length ? ' · ' + rec.map(x => `${U.esc(x.b.team.emoji)} ${x.r.w}–${x.r.l}${x.r.t ? '–' + x.r.t : ''}`).join(' ') : '';
  const pastRows = past.filter(x => matchesFilter(x.e)).map(x => U.eventRow(ctxFor(x.b, x.e, { showTeam }))).join('');
  const pastHtml = past.length
    ? `<details style="margin-top:16px"><summary class="muted">${past.length} past event${past.length === 1 ? '' : 's'}${recLabel}</summary>${pastRows ? `<div class="rowlist" style="margin-top:8px">${pastRows}</div>` : '<div class="empty">Nothing matches this filter.</div>'}</details>`
    : '';
  return `<section class="section">${head}${body}${pastHtml}</section>`;
}
function footerHtml() {
  return `<section class="section" style="margin-top:26px"><div class="stack">
    <button class="btn btn-block" data-action="calendar">${U.icon('calendar')} Subscribe in my calendar app</button>
    ${S.household.length ? `<button class="btn btn-block" data-action="coparent">${U.icon('share')} Share with my co-parent</button>` : ''}
    <button class="btn btn-block btn-ghost" data-action="pick-kids">${U.icon('users')} ${S.household.length ? 'Change my players' : 'Pick my player'}</button>
    <p class="tiny muted" style="text-align:center"><a href="coach.html">${S.isCoach ? 'Coach admin' : 'Coach'}</a> · <a href="index.html" data-action="all-teams">All teams</a> · ${U.esc(refreshLabel())}</p></div></section>`;
}
const refreshLabel = () => { const b = teamsInView()[0]; return b ? (S.online ? `Updated ${U.relTimeLabel(b.fetchedAt, tzOf(b))}` : 'Offline') : ''; };

// ---------- sheets ----------
const wireSheet = (root) => root.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (el && root.contains(el)) onAction(el.dataset.action, el.dataset, el);
});
function pickerSheet() {
  const bundles = allBundles().filter(b => S.hasCode(b.team.slug) && b.players.some(p => p.active));
  if (!bundles.length) { U.sheet({ title: 'Pick your player', html: '<p>Tap the invite link your coach sent to pick your player.</p>' }); return; }
  U.sheet({
    title: 'My players',
    html: `${pickerFormHtml(bundles)}<div class="sheet-actions"><button class="btn btn-primary" data-action="picker-done">Done</button></div><p class="tiny muted">My player isn’t listed? Ask Coach to add them.</p>`,
    onOpen: wireSheet,
  });
}
const collectPicker = (root) => [...root.querySelectorAll('[data-action="picker-toggle"][aria-pressed="true"]')].map(el => Number(el.dataset.player));
function calendarSheet() {
  const inView = teamsInView().length ? teamsInView() : allBundles();
  const rows = inView.map(b => {
    const url = `${ORIGIN}/${b.team.slug}.ics`;
    const webcal = url.replace(/^https?:/, 'webcal:');
    return `<div class="card card-pad stack" style="margin-top:10px"><b>${U.esc(b.team.emoji)} ${U.esc(b.team.name)}</b>
      ${U.isIOS ? `<a class="btn btn-primary btn-block" href="${U.esc(webcal)}">${U.icon('calendar')} Subscribe (iPhone/iPad)</a><p class="tiny muted">Tap Subscribe, then “Add”. Games, practices, changes and cancellations stay in sync, with reminders the day before and 2 hours before.</p>` : ''}
      <button class="btn btn-block" ${U.dataAttrs({ action: 'copy', text: url })}>${U.icon('copy')} Copy calendar link</button>
      <p class="tiny muted">Google Calendar: Settings → Add calendar → <b>From URL</b> → paste. (Google ignores the built-in reminders — set a default notification on that calendar.)</p></div>`;
  }).join('');
  U.sheet({
    title: 'Subscribe to the schedule',
    html: rows + '<p class="tiny muted" style="margin-top:10px">Calendar apps refresh on their own schedule (usually within a few hours). For same-day changes, check here or the team text.</p>',
    onOpen: wireSheet,
  });
}
function coparentSheet() {
  const pairs = S.codePairs().filter(p => myBundles().some(b => b.team.slug === p.slug));
  const link = L.coParentLink(ORIGIN, S.household, pairs);
  U.sheet({
    title: 'Share with my co-parent',
    html: `<p>Send this link to the other parent (or open it on another phone). It sets up the same players there.</p>
      <div class="sheet-actions"><button class="btn btn-primary" ${U.dataAttrs({ action: 'share-text', title: 'Team schedule', text: 'Our team schedule + RSVP link:', url: link })}>${U.icon('share')} Share link</button>
      <button class="btn" ${U.dataAttrs({ action: 'copy', text: link })}>${U.icon('copy')} Copy link</button></div>
      <p class="tiny muted" style="margin-top:10px;word-break:break-all">${U.esc(link)}</p>`,
    onOpen: wireSheet,
  });
}
function noteSheet(slug, eventId, playerId) {
  const b = S.bundles[slug];
  const r = b.rsvps.find(x => x.event_id === Number(eventId) && x.player_id === Number(playerId));
  const { root, close } = U.sheet({
    title: 'Add a note for Coach',
    html: `<div class="field"><label for="note-input">Note (optional, 80 characters)</label><input id="note-input" maxlength="80" placeholder="e.g. Leaving at 11 for a recital" value="${U.esc(r?.note || '')}"></div><div class="sheet-actions"><button class="btn btn-primary" data-save>Save</button></div>`,
  });
  root.querySelector('[data-save]').onclick = () => {
    const v = root.querySelector('#note-input').value.trim();
    S.rsvp(slug, Number(eventId), Number(playerId), r?.status || 'going', v);
    close(); U.toast('Note saved');
  };
}
function addCalEventSheet(slug, eventId) {
  const b = S.bundles[slug], e = findEvent(slug, eventId);
  if (!b || !e) return;
  const blob = new Blob([L.buildEventIcs(b.team, e, ORIGIN)], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  U.sheet({
    title: 'Add this event to my calendar',
    html: `<div class="sheet-actions"><a class="btn btn-primary" href="${U.esc(L.googleCalUrl(e, b.team, ORIGIN))}" target="_blank" rel="noopener">Google Calendar</a>
      <a class="btn" href="${url}" download="event-${U.esc(e.id)}.ics">Apple / Outlook (.ics)</a>
      <button class="btn btn-ghost" data-action="calendar">Or subscribe to the whole schedule</button></div>`,
    onOpen: (root) => root.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-action]');
      if (el && root.contains(el)) { U.closeSheet(); onAction(el.dataset.action, el.dataset, el); }
    }),
  });
}

// ---------- actions ----------
const actions = {
  'refresh': () => { S.refreshAll(); U.toast('Refreshing…', { duration: 1200 }); },
  'team-tab': (d) => { ui.teamFilter = d.slug; ui.selectedDay = null; ls.set('browsing', '1'); render(); },
  'all-teams': () => { ui.teamFilter = 'all'; ui.selectedDay = null; render(); },
  'browse': () => { ls.set('browsing', '1'); render(); },
  'view': (d) => { S.setView(d.view); render(); },
  'filter': (d) => { ui.filter = d.filter; render(); },
  'month-nav': (d) => {
    if (!ui.month) return;
    const m = ui.month.m + Number(d.dir);
    ui.month = { y: ui.month.y + (m < 1 ? -1 : m > 12 ? 1 : 0), m: ((m - 1 + 12) % 12) + 1 };
    ui.selectedDay = null; render();
  },
  'month-day': (d) => { ui.selectedDay = ui.selectedDay === d.key ? null : d.key; render(); },
  'toggle-event': (d) => { const id = Number(d.event); ui.expanded.has(id) ? ui.expanded.delete(id) : ui.expanded.add(id); render(); },
  'open-event': (d) => { ui.expanded.add(Number(d.event)); S.setView('list'); render(); jumpTo('event-' + Number(d.event)); },
  'open-poll': (d) => jumpTo('poll-' + Number(d.poll)),
  'dismiss-changes': () => { for (const b of teamsInView()) { ui.changesDismissed.add(b.team.slug); S.dismissChanges(b.team.slug); } render(); },
  'install-dismiss': () => { ls.set('installHintDismissed', '1'); render(); },
  'pick-kids': () => pickerSheet(),
  'picker-toggle': (d, el) => { el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') !== 'true'); el.classList.toggle('on'); },
  'picker-done': (d, el) => {
    const root = el.closest('.sheet-body') || app;
    const ids = collectPicker(root);
    S.setHousehold(ids); U.closeSheet(); ls.del('browsing'); ui.teamFilter = 'all'; render();
    if (ids.length) U.toast('Saved — tap Going / Maybe / Can’t on any event');
  },
  'rsvp': (d) => {
    const b = S.bundles[d.slug]; if (!b) return;
    const cur = b.rsvps.find(r => r.event_id === Number(d.event) && r.player_id === Number(d.player))?.status;
    if (cur === d.status) return;
    const kid = b.players.find(p => p.id === Number(d.player)); const e = findEvent(d.slug, d.event);
    const { undo } = S.rsvp(d.slug, Number(d.event), Number(d.player), d.status);
    const label = d.status === 'going' ? 'Going' : d.status === 'maybe' ? 'Maybe' : 'Can’t';
    U.toast(`${kid ? L.displayName(kid) : 'Saved'}: ${label}${e ? ' · ' + L.eventTitle(e) : ''}`,
      { action: { label: 'Undo', onClick: () => { undo(); U.toast('Undone'); } } });
  },
  'vote': (d) => {
    const b = S.bundles[d.slug]; if (!b) return;
    const cur = b.votes.find(v => v.slot_id === Number(d.slot) && v.player_id === Number(d.player))?.choice;
    S.vote(d.slug, Number(d.slot), Number(d.player), cur === d.choice ? null : d.choice);
  },
  'claim': (d) => { S.claim(d.slug, Number(d.event), d.role, Number(d.player)); U.toast(`You’ve got ${d.role} — thank you!`); },
  'unclaim': (d) => { S.unclaim(d.slug, Number(d.event), d.role); },
  'note': (d) => noteSheet(d.slug, d.event, d.player),
  'share-event': (d) => {
    const b = S.bundles[d.slug]; const e = findEvent(d.slug, d.event); if (!b || !e) return;
    U.share({ title: L.eventTitle(e), text: L.composeEventShare({ team: b.team, event: e, link: L.eventLink(ORIGIN, d.slug, e.id) }) });
  },
  'add-cal-event': (d) => addCalEventSheet(d.slug, d.event),
  'calendar': () => calendarSheet(),
  'coparent': () => coparentSheet(),
  'copy': async (d) => { U.toast((await U.copy(d.text)) ? 'Copied' : 'Couldn’t copy'); },
  'share-text': (d) => U.share({ title: d.title, text: d.text, url: d.url }),
};
// ---------- coach mode ----------
// Coach mode is this same page with extra affordances rather than a separate screen:
// the ⋯ "Manage" menu on the hero and expanded rows, tappable names under "Who's going",
// poll close/convert, post edit (all emitted by ui.js when ctx.isCoach), plus the row of
// team-level buttons and the "+" FAB below. The forms live in coach_sheets.js; this file
// only resolves data-attribute ids back to bundle rows and hands them over.
function coachBarHtml(slug) {
  const at = (action) => U.dataAttrs({ action, slug });
  return `<div class="cluster" style="margin:6px 0 4px">
    <button class="btn btn-sm" ${at('coach-announce')}>${U.icon('megaphone')} Announce</button>
    <button class="btn btn-sm" ${at('coach-poll-new')}>${U.icon('users')} New poll</button>
    <button class="btn btn-sm" ${at('coach-bulk')}>${U.icon('calendar')} Add a series</button>
    <button class="btn btn-sm" ${at('coach-settings')}>${U.icon('edit')} Team settings</button></div>`;
}
function fabHtml(slug) {
  return `<button class="fab" ${U.dataAttrs({ action: 'coach-add', slug })} aria-label="Add event">${U.icon('plus')}</button>`;
}
// The button's own slug wins; team-level buttons that omit it fall back to the team in view.
const coachSlug = (d) => d.slug || teamsInView()[0]?.team.slug || SITE_CONFIG.TEAM_SLUGS[0];
const rowById = (list, id) => (list || []).find(x => x.id === Number(id));
// Every coach handler runs through this: coach markup only renders when Store.isCoach, but
// a DOM left over from before a sign-out — or a hand-typed data-action — must not reach a
// coach write. A missing bundle (offline first load, failed fetch) says so instead of throwing.
function coach(fn) {
  return (d) => {
    const C = globalThis.CoachSheets;
    if (!S.isCoach || !C) return;
    const slug = coachSlug(d), b = S.bundles[slug];
    if (!b) { U.toast('That team hasn’t loaded yet — tap Refresh'); return; }
    fn({ C, slug, b, d });
  };
}
Object.assign(actions, {
  'coach-add': coach(({ C, slug }) => C.eventSheet({ slug })),
  'coach-bulk': coach(({ C, slug }) => C.bulkAddSheet({ slug })),
  'coach-announce': coach(({ C, slug }) => C.announceSheet({ slug })),
  'coach-poll-new': coach(({ C, slug }) => C.pollSheet({ slug })),
  'coach-settings': coach(({ C, slug }) => C.settingsSheet({ slug })),
  'coach-menu': coach(({ C, slug, d }) => { const e = findEvent(slug, d.event); if (e) C.menu({ slug, event: e }); }),
  'coach-text-noreply': coach(({ C, slug, d }) => { const e = findEvent(slug, d.event); if (e) C.textNoReplies({ slug, event: e }); }),
  'coach-player': coach(({ C, slug, b, d }) => { const player = rowById(b.players, d.player); if (player) C.playerSheet({ slug, player, event: findEvent(slug, d.event) || null }); }),
  'coach-post-edit': coach(({ C, slug, b, d }) => { const post = rowById(b.posts, d.post); if (post) C.announceSheet({ slug, post }); }),
  'coach-poll-close': coach(({ C, slug, b, d }) => { const poll = rowById(b.polls, d.poll); if (poll) C.closePoll({ slug, poll }); }),
  'coach-poll-convert': coach(({ C, slug, b, d }) => {
    const poll = rowById(b.polls, d.poll), slot = rowById(b.slots, d.slot);
    if (poll && slot) C.convertSlot({ slug, poll, slot });
  }),
});

function onAction(name, d, el) { const fn = actions[name]; if (fn) fn(d, el); else console.warn('no action', name); }
function onClick(ev) {
  const el = ev.target.closest('[data-action]');
  if (!el || !ev.currentTarget.contains(el)) return;
  if (el.tagName === 'A' && el.dataset.action === 'all-teams') ev.preventDefault();
  onAction(el.dataset.action, el.dataset, el);
}

globalThis.HomePage = { actions, render, ctxFor, ui, params, onAction, findEvent, refreshIndicator, teamsInView, allBundles };
boot();
