/* ui.js — shared UI: escaping, icons, toast, sheet, confirm, share (part 1) and
   the renderers every page draws with — rows, hero, RSVP, headcount, volunteers,
   polls, posts, month grid (part 2).
   Classic script; exposes globalThis.UI. Uses globalThis.ScheduleLib. */
(function () {
  const L = globalThis.ScheduleLib;
  const U = {};
  U.esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  U.isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  U.isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  U.relTimeLabel = (iso, tz) => (L || globalThis.ScheduleLib).relativeTime(iso, new Date(), tz);

  const P = {   // 24×24 stroke icons (Feather-style paths)
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    share: '<path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', more: '<circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/>',
    check: '<path d="M20 6L9 17l-5-5"/>', x: '<path d="M18 6L6 18M6 6l12 12"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    chevron: '<path d="M9 18l6-6-6-6"/>', 'chevron-down': '<path d="M6 9l6 6 6-6"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1zM15 9a3 3 0 0 1 0 6M18 6a7 7 0 0 1 0 12"/>',
    edit: '<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    refresh: '<path d="M23 4v6h-6M1 20v-6h6"/><path d="M3.5 9a9 9 0 0 1 14.9-3.4L23 10M1 14l4.6 4.4A9 9 0 0 0 20.5 15"/>',
    'arrow-left': '<path d="M19 12H5M12 19l-7-7 7-7"/>', 'arrow-right': '<path d="M5 12h14M12 5l7 7-7 7"/>',
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    star: '<path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>', phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8.1 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.8 2z"/>',
    message: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
    mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M22 6l-10 7L2 6"/>',
    map: '<path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z"/><path d="M8 2v16M16 6v16"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    alert: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  };
  U.icon = (name) => `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${P[name] || ''}</svg>`;

  // ---- toast ----
  let toastEl = null, toastTimer = null;
  const dropToast = (el) => {                 // retire `el` without touching a newer toast
    if (toastEl === el) { toastEl = null; clearTimeout(toastTimer); }
    el.__mo?.disconnect(); el.__mo = null;
    el.remove();
  };
  // A <dialog> sits in the top layer and paints above any z-index, so a toast has to
  // live *inside* the dialog to be seen while the sheet is open — and move back out
  // when it closes. close() drops the `open` attribute; watch the attribute rather
  // than the 'close' event, because observer callbacks are microtasks that still run
  // when the tab is hidden, so the toast always finds its way back to <body>.
  const adoptToast = (d, el) => {
    d.appendChild(el);
    el.__mo?.disconnect();
    el.__mo = new MutationObserver(() => {
      if (d.open) return;
      el.__mo.disconnect(); el.__mo = null;
      if (el.isConnected) document.body.appendChild(el);
    });
    el.__mo.observe(d, { attributes: true, attributeFilter: ['open'] });
  };
  U.toast = (message, { action, duration = 4500 } = {}) => {
    if (toastEl) dropToast(toastEl);
    clearTimeout(toastTimer);
    const el = document.createElement('div');
    el.className = 'toast'; el.setAttribute('role', 'status');
    el.innerHTML = `<span>${U.esc(message)}</span>${action ? `<button class="toast-action" type="button">${U.esc(action.label)}</button>` : ''}`;
    // Retire this toast *before* running the handler, so a toast the handler
    // raises itself (Undo -> "Undone") is not torn down on the way out.
    if (action) el.querySelector('button').onclick = () => { dropToast(el); action.onClick(); };
    toastEl = el;
    const d = document.getElementById('sheet');
    if (d?.open) adoptToast(d, el); else document.body.appendChild(el);
    toastTimer = setTimeout(() => dropToast(el), duration);
  };

  // ---- sheet ----
  const dialog = () => {
    let d = document.getElementById('sheet');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'sheet'; d.className = 'sheet'; document.body.appendChild(d);
      d.addEventListener('click', (e) => { if (e.target === d) d.close(); });   // backdrop tap
    }
    return d;
  };
  const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
  const focusInto = (d, root) => {
    // showModal() only focuses on the first open; re-populating an open sheet needs this too.
    const t = root.querySelector('[autofocus]') || root.querySelector(FOCUSABLE);
    if (t) { t.focus(); } else { d.tabIndex = -1; d.focus(); }
  };
  U.sheet = ({ title, html, className = '', onOpen }) => {
    const d = dialog();
    d.className = ('sheet ' + className).trim();
    const liveToast = toastEl && toastEl.parentElement === d ? toastEl : null;   // survive the innerHTML swap
    d.innerHTML = `<div class="sheet-handle"></div>${title ? `<div class="sheet-title" id="sheet-title">${U.esc(title)}</div>` : ''}<div class="sheet-body">${html}</div>`;
    if (liveToast) d.appendChild(liveToast);
    if (title) { d.setAttribute('aria-labelledby', 'sheet-title'); d.removeAttribute('aria-label'); }
    else { d.setAttribute('aria-label', 'Dialog'); d.removeAttribute('aria-labelledby'); }
    if (!d.open) {
      d.showModal();
      // A toast raised *before* the sheet opened is stranded under the dialog's
      // top layer, so bring it along too.
      if (toastEl?.isConnected && toastEl.parentElement !== d) adoptToast(d, toastEl);
    }
    const root = d.querySelector('.sheet-body');
    if (onOpen) onOpen(root);
    focusInto(d, root);
    return { close: () => d.close(), root };
  };
  U.closeSheet = () => { const d = document.getElementById('sheet'); if (d?.open) d.close(); };
  U.confirm = ({ title, body, confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false }) => new Promise((resolve) => {
    // On a destructive confirm the safe choice takes focus, so a stray Enter cancels.
    const { close, root } = U.sheet({ title, html: `<p>${U.esc(body)}</p><div class="sheet-actions">
      <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" type="button" data-ok>${U.esc(confirmLabel)}</button>
      <button class="btn btn-ghost" type="button" data-cancel${danger ? ' autofocus' : ''}>${U.esc(cancelLabel)}</button></div>` });
    const d = document.getElementById('sheet');
    // Dismissal (Esc / backdrop tap) resolves false — watched on the `open`
    // attribute rather than the 'close' event, for the reason above.
    const mo = new MutationObserver(() => { if (!d.open) { mo.disconnect(); resolve(false); } });
    mo.observe(d, { attributes: true, attributeFilter: ['open'] });
    const done = (v) => { mo.disconnect(); resolve(v); close(); };
    root.querySelector('[data-ok]').onclick = () => done(true);
    root.querySelector('[data-cancel]').onclick = () => done(false);
  });

  // ---- share / copy ----
  U.copy = async (text) => { try { await navigator.clipboard.writeText(text); return true; } catch { return false; } };
  U.share = async ({ title, text, url }) => {
    const body = String(text == null ? '' : text);
    if (navigator.share) { try { await navigator.share(url ? { title, text: body, url } : { title, text: body }); return 'shared'; } catch (e) { if (e?.name === 'AbortError') return 'failed'; } }
    const ok = await U.copy(url && !body.includes(url) ? `${body}\n${url}` : body);
    U.toast(ok ? 'Copied to clipboard' : 'Couldn’t copy — long-press to select');
    return ok ? 'copied' : 'failed';
  };

  // ================= renderers =================
  // Every renderer returns an HTML string. `ctx` is the shared render context:
  //   { b, team, e, kids, isCoach, now, readOnly, expanded, overlapWith, prevSeen,
  //     origin, slug, showTeam, multiKid }
  // Interaction is delegated: controls carry data-action (+ data-slug/event/player/…)
  // and the page binds one listener.
  U.dataAttrs = (o) => Object.entries(o).filter(([, v]) => v != null).map(([k, v]) => `data-${k}="${U.esc(v)}"`).join(' ');
  const tzOf = (team) => team.tz || 'America/New_York';
  const kidName = (p) => U.esc(L.displayName(p));
  // en-US puts U+202F (narrow no-break space) before AM/PM, so split on any
  // whitespace — and escape *before* inserting markup, never after.
  const timeHtml = (iso, tz, sep) => U.esc(L.fmtTime(iso, tz)).replace(/\s/, sep);
  // Shown wherever an answer is asked for but no player has been picked yet.
  const pickKids = (text, cls = 'btn btn-block') => `<button class="${cls}" data-action="pick-kids">${text}</button>`;

  U.statusPill = (status) => status === 'going' ? '<span class="pill pill-going">Going</span>'
    : status === 'maybe' ? '<span class="pill pill-maybe">Maybe</span>'
    : status === 'out' ? '<span class="pill pill-out">Can’t</span>' : '<span class="pill pill-silent">No reply</span>';

  U.badges = (ctx) => {
    const { e, team, now, prevSeen } = ctx; const out = [];
    if (e.status === 'cancelled') out.push('<span class="badge badge-cancelled">Cancelled</span>');
    else if (e.status === 'tentative') out.push('<span class="badge badge-tentative">Weather pending</span>');
    if (e.rescheduled_from) out.push('<span class="badge badge-moved">Moved</span>');
    if (e.time_tbd) out.push('<span class="badge badge-tbd">Time TBD</span>');
    if (e.status !== 'cancelled' && L.isNow(e, team, now)) out.push('<span class="badge badge-now">Now</span>');
    const r = L.resultLabel(e); if (r) out.push(`<span class="badge badge-result">${U.esc(r)}</span>`);
    if (prevSeen && e.updated_at && L.T(e.updated_at) > L.T(prevSeen) && !L.isPast(e, team, now))
      out.push(`<span class="badge badge-new">${e.created_at && L.T(e.created_at) > L.T(prevSeen) ? 'New' : 'Updated'}</span>`);
    return out.join(' ');
  };

  U.rsvpControl = ({ slug, e, kid, status, disabled, label }) => {
    const btn = (st, text) => `<button type="button" class="${status === st ? 'on-' + st : ''}" ${U.dataAttrs({ action: 'rsvp', slug, event: e.id, player: kid.id, status: st })} aria-pressed="${status === st}" ${disabled ? 'disabled' : ''}>${text}</button>`;
    return `${label ? `<div class="rsvp-kid">${label}</div>` : ''}<div class="rsvp" role="group" aria-label="RSVP for ${kidName(kid)}">${btn('going', 'Going')}${btn('maybe', 'Maybe')}${btn('out', 'Can’t')}</div>`;
  };
  U.rsvpBlock = (ctx) => {
    const { b, e, kids, slug, readOnly, team } = ctx;
    if (readOnly) return `<div class="notice notice-info">${U.icon('info')}<div>Tap your invite link to RSVP and see who’s going.</div></div>`;
    if (!kids.length) return ctx.isCoach ? '' : pickKids('Pick your player to RSVP');
    if (e.status === 'cancelled') return '';
    return kids.map(kid => {
      const r = b.rsvps.find(x => x.event_id === e.id && x.player_id === kid.id);
      const meta = r ? `<div class="tiny muted" style="margin-top:6px">Answered ${U.esc(L.relativeTime(r.updated_at, ctx.now, tzOf(team)))}${r.note ? ` · “${U.esc(r.note)}”` : ''} · <button class="btn btn-ghost btn-sm" style="min-height:28px;padding:0 6px" ${U.dataAttrs({ action: 'note', slug, event: e.id, player: kid.id })}>${r.note ? 'Edit note' : 'Add a note'}</button></div>` : '';
      return U.rsvpControl({ slug, e, kid, status: r?.status, label: kids.length > 1 ? kidName(kid) : '' }) + meta;
    }).join('');
  };

  U.headcountLine = (s, minPlayers) => {
    const parts = [`<b class="count">${s.going.length}</b> going`];
    if (s.maybe.length) parts.push(`<b class="count">${s.maybe.length}</b> maybe`);
    parts.push(`<b class="count">${s.out.length}</b> can’t`, `<b class="count">${s.silent.length}</b> no reply`);
    const short = s.shortBy > 0 && minPlayers ? ` <span class="pill pill-silent">need ${s.shortBy} more</span>` : '';
    return `<div class="tiny muted" style="margin-top:8px">${parts.join(' · ')}${short}</div>`;
  };

  U.whoIsGoing = (ctx, s) => {
    const { slug, e, isCoach, readOnly, b } = ctx;
    if (readOnly) return '';
    const conflicts = new Set(L.volunteerConflicts(e, b.claims, b.rsvps).map(c => c.player_id));
    const name = (p) => isCoach
      ? `<button class="btn btn-sm btn-ghost" style="min-height:32px;padding:2px 8px" ${U.dataAttrs({ action: 'coach-player', slug, event: e.id, player: p.id })}>${kidName(p)}${conflicts.has(p.id) ? ' ⚠️' : ''}</button>`
      : `<span>${kidName(p)}</span>`;
    const group = (label, list, cls) => list.length ? `<div style="margin-top:8px"><span class="pill ${cls}">${label} · ${list.length}</span><div class="cluster tiny" style="margin-top:4px">${list.map(name).join(isCoach ? '' : '<span class="muted">·</span>')}</div></div>` : '';
    return `<div class="kicker" style="margin-top:14px">Who’s going</div>${group('Going', s.going, 'pill-going')}${group('Maybe', s.maybe, 'pill-maybe')}${group('Can’t', s.out, 'pill-out')}${group('No reply', s.silent, 'pill-silent')}`
      + (isCoach && s.silent.length ? `<div class="cluster" style="margin-top:10px"><button class="btn btn-sm" ${U.dataAttrs({ action: 'coach-text-noreply', slug, event: e.id })}>${U.icon('message')} Text no-replies</button></div>` : '');
  };

  U.volunteerRoles = (ctx) => {
    const { b, e, kids, slug, readOnly } = ctx;
    const roles = e.volunteer_roles || [];
    if (!roles.length || readOnly || e.status === 'cancelled') return '';
    let open = 0;
    const rows = roles.map(role => {
      const claim = b.claims.find(c => c.event_id === e.id && c.role === role);
      if (claim) {
        const p = b.players.find(x => x.id === claim.player_id);
        const mine = kids.find(k => k.id === claim.player_id);
        return `<div class="cluster" style="justify-content:space-between"><span><b>${U.esc(role)}</b>: ${p ? kidName(p) : 'someone'}</span>${mine ? `<button class="btn btn-sm" ${U.dataAttrs({ action: 'unclaim', slug, event: e.id, role, player: claim.player_id })}>Unclaim</button>` : ''}</div>`;
      }
      open++;
      const claimBtns = kids.map(k => `<button class="btn btn-sm btn-primary" ${U.dataAttrs({ action: 'claim', slug, event: e.id, role, player: k.id })}>Claim${kids.length > 1 ? ' for ' + kidName(k) : ''}</button>`).join('');
      return `<div class="cluster" style="justify-content:space-between"><span><b>${U.esc(role)}</b>: <span class="muted">open</span></span><span class="cluster">${claimBtns}</span></div>`;
    }).join('');
    // An open role you can't claim yet is a dead end without this.
    const pick = open && !kids.length ? `<div style="margin-top:8px">${pickKids('Pick your player to claim', 'btn btn-sm')}</div>` : '';
    return `<div class="kicker" style="margin-top:14px">Volunteers</div><div class="stack" style="margin-top:6px">${rows}</div>${pick}`;
  };

  const metaLines = (ctx) => {
    const { e, team } = ctx; const tz = tzOf(team); const lines = [];
    const ab = L.arriveBy(e, team);
    if (e.status === 'tentative' || e.status === 'cancelled') lines.push(`<div class="notice ${e.status === 'cancelled' ? 'notice-danger' : 'notice-warn'}">${U.icon('alert')}<div><b>${e.status === 'cancelled' ? 'Cancelled' : 'Weather pending'}</b>${e.status_note ? ` — ${U.esc(e.status_note)}` : ''}</div></div>`);
    if (e.rescheduled_from) lines.push(`<div>${U.icon('clock')} Moved from ${U.esc(L.fmtDay(e.rescheduled_from, tz))} ${U.esc(L.fmtTime(e.rescheduled_from, tz))}</div>`);
    if (ab && e.status !== 'cancelled') lines.push(`<div>${U.icon('clock')} Arrive by <b>${U.esc(L.fmtTime(ab, tz))}</b></div>`);
    if (!e.time_tbd) lines.push(`<div>${U.icon('clock')} ${U.esc(L.fmtTime(e.starts_at, tz))} – ${U.esc(L.fmtTime(L.eventEnd(e, team), tz))}</div>`);
    if (e.location) lines.push(`<div>${U.icon('pin')} <a href="${U.esc(L.mapsUrl(e.location, U.isIOS))}" target="_blank" rel="noopener">${U.esc(e.location)}</a></div>`);
    if (e.notes) lines.push(`<div class="muted">${U.esc(e.notes)}</div>`);
    if (ctx.overlapWith?.length) lines.push(`<div class="tiny" style="color:var(--maybe)">${U.icon('alert')} Overlaps ${ctx.overlapWith.map(o => `${U.esc(o.team.emoji)} ${U.esc(L.eventTitle(o.event))}`).join(', ')}</div>`);
    return lines.length ? `<div class="meta">${lines.join('')}</div>` : '';
  };

  U.eventDetail = (ctx) => {
    const { b, e, team, slug, isCoach, readOnly } = ctx;
    const s = L.summarizeRsvps(b.players, b.rsvps.filter(r => r.event_id === e.id), team.min_players);
    const actions = `<div class="cluster" style="margin-top:14px">
      <button class="btn btn-sm" ${U.dataAttrs({ action: 'add-cal-event', slug, event: e.id })}>${U.icon('calendar')} Add to calendar</button>
      <button class="btn btn-sm" ${U.dataAttrs({ action: 'share-event', slug, event: e.id })}>${U.icon('share')} Share</button>
      ${isCoach ? `<button class="btn btn-sm btn-primary" ${U.dataAttrs({ action: 'coach-menu', slug, event: e.id })}>${U.icon('edit')} Manage</button>` : ''}</div>`;
    // Without the invite code RLS returns no roster and no RSVP rows (§4.2), so every
    // tally here would be a zero the viewer has no way to read as "hidden" — it says
    // "nobody is going". Drop the line entirely; rsvpBlock's notice already explains.
    const headcount = !readOnly && e.status !== 'cancelled' ? U.headcountLine(s, team.min_players) : '';
    return `${metaLines(ctx)}<div style="margin-top:12px">${U.rsvpBlock(ctx)}</div>${headcount}${U.whoIsGoing(ctx, s)}${U.volunteerRoles(ctx)}${actions}`;
  };

  const myStatusPills = (ctx) => ctx.kids.map(k => {
    const r = ctx.b.rsvps.find(x => x.event_id === ctx.e.id && x.player_id === k.id);
    return `<span title="${kidName(k)}">${ctx.kids.length > 1 ? `<span class="tiny muted">${kidName(k)} </span>` : ''}${U.statusPill(r?.status)}</span>`;
  }).join('');

  U.eventRow = (ctx) => {
    const { e, team, slug, expanded, now, readOnly } = ctx; const tz = tzOf(team);
    const diff = L.dayDiff(e.starts_at, tz, now);
    const dayLabel = diff === 0 ? 'Today' : diff === 1 ? 'Tmrw' : L.fmtDay(e.starts_at, tz).slice(0, 3);
    const dateNum = L.utcToZoned(e.starts_at, tz).d;
    // The right column shows this household's answers when there are any to show,
    // and falls back to the badges. Badges appear under the title only when the
    // right column isn't already carrying them, so they never render twice.
    const pills = e.status === 'cancelled' || readOnly || L.isPast(e, team, now) ? '' : myStatusPills(ctx);
    const right = pills || U.badges(ctx);
    const flagged = e.status !== 'scheduled' || e.rescheduled_from || e.time_tbd;
    return `<div class="row-wrap" id="event-${e.id}">
      <button type="button" class="row ${e.status === 'cancelled' ? 'cancelled' : ''}" ${U.dataAttrs({ action: 'toggle-event', slug, event: e.id })} aria-expanded="${!!expanded}">
        <div class="row-when"><div class="row-day">${U.esc(dayLabel)} ${dateNum}</div><div class="row-time">${e.time_tbd ? 'TBD' : timeHtml(e.starts_at, tz, '<br>')}</div></div>
        <div class="row-body"><div class="row-title">${ctx.showTeam ? U.esc(team.emoji) + ' ' : ''}${U.esc(L.eventTitle(e))}</div>
          <div class="row-sub">${U.esc(e.location || team.default_location || '')}</div>
          ${pills && flagged ? `<div style="margin-top:4px">${U.badges(ctx)}</div>` : ''}</div>
        <div class="row-right">${right}</div>
      </button>
      ${expanded ? `<div class="row-detail">${U.eventDetail(ctx)}</div>` : ''}</div>`;
  };

  U.hero = (ctx, { alsoToday = [] } = {}) => {
    const { e, team, now, slug } = ctx; const tz = tzOf(team);
    const later = alsoToday.filter(x => x.id !== e.id).map(x => `<button class="btn btn-sm btn-ghost" ${U.dataAttrs({ action: 'open-event', slug, event: x.id })}>Later today: ${U.esc(L.fmtTime(x.starts_at, tz))} ${U.esc(L.eventTitle(x))} ${U.icon('chevron')}</button>`).join('');
    // The hero event is usually also a row in the schedule below, and both carry an id —
    // so the hero is namespaced and `event-N` stays a unique handle on the row (deep
    // links from ?event= / "Since your last visit" scroll to the row and expand it).
    return `<section class="hero ${e.status === 'cancelled' ? 'cancelled' : ''}" id="hero-event-${e.id}" aria-label="Up next">
      <div class="cluster" style="justify-content:space-between"><span class="kicker">${L.isNow(e, team, now) ? 'Happening now' : 'Up next'}${ctx.showTeam ? ` · ${U.esc(team.emoji)} ${U.esc(team.name)}` : ''}</span><span>${U.badges(ctx)}</span></div>
      <div class="hero-when"><span class="hero-day">${U.esc(L.relativeDay(e.starts_at, tz, now))}</span><span class="hero-time">${e.time_tbd ? 'Time TBD' : U.esc(L.fmtTime(e.starts_at, tz))}</span></div>
      <div class="hero-title">${U.esc(L.eventTitle(e))}${e.kind === 'game' && e.home != null ? ` <span class="pill" style="background:var(--surface-2);vertical-align:middle">${e.home ? 'Home' : 'Away'}</span>` : ''}</div>
      ${U.eventDetail(ctx)}${later ? `<div style="margin-top:10px">${later}</div>` : ''}</section>`;
  };

  U.needsRow = (item, ctx) => {
    const tz = tzOf(item.team);
    if (item.kind === 'poll') return `<div class="strip-row"><div style="flex:1"><b>Vote:</b> ${U.esc(item.poll.title)}${ctx.multiKid ? ` <span class="tiny muted">· ${kidName(item.player)}</span>` : ''}</div><button class="btn btn-sm btn-primary" ${U.dataAttrs({ action: 'open-poll', slug: item.team.slug, poll: item.poll.id })}>Vote</button></div>`;
    const e = item.event;
    return `<div class="strip-row" style="flex-wrap:wrap"><div style="flex:1;min-width:140px"><b>${U.esc(L.relativeDay(e.starts_at, tz, ctx.now))}</b> <span class="muted">${e.time_tbd ? 'TBD' : U.esc(L.fmtTime(e.starts_at, tz))}</span><div class="tiny muted">${U.esc(item.team.emoji)} ${U.esc(L.eventTitle(e))}${ctx.multiKid ? ` · ${kidName(item.player)}` : ''}</div></div>
      <div style="flex-basis:100%;margin-top:6px">${U.rsvpControl({ slug: item.team.slug, e, kid: item.player, status: null })}</div></div>`;
  };

  // One table drives the vote buttons, the coach's per-choice names and the tally,
  // so a choice can never be labelled one way and counted another. `tone` reuses the
  // RSVP fill classes.
  const CHOICES = [{ key: 'yes', label: 'Yes', glyph: '✅', tone: 'going' },
    { key: 'ifneeded', label: 'If needed', glyph: '🤷', tone: 'maybe' },
    { key: 'no', label: 'No', glyph: '❌', tone: 'out' }];

  U.pollCard = (ctx, poll) => {
    const { b, team, kids, slug, readOnly, isCoach } = ctx; const tz = tzOf(team);
    const slots = b.slots.filter(s => s.poll_id === poll.id);
    const votesFor = (slotId, choice) => b.votes.filter(v => v.slot_id === slotId && v.choice === choice);
    const rows = slots.map(s => {
      // Same reason as eventDetail's headcount: a read-only viewer gets no vote rows,
      // so "✅ 0 · 🤷 0 · ❌ 0" would be a fabricated result rather than a hidden one.
      const tally = readOnly ? '' : `<span class="tiny muted">${CHOICES.map(c => `${c.glyph} ${votesFor(s.id, c.key).length}`).join(' · ')}</span>`;
      const controls = readOnly ? '' : kids.map(k => {
        const mine = b.votes.find(v => v.slot_id === s.id && v.player_id === k.id)?.choice;
        const btn = (c) => `<button type="button" class="${mine === c.key ? 'on-' + c.tone : ''}" ${U.dataAttrs({ action: 'vote', slug, slot: s.id, player: k.id, choice: c.key })} aria-pressed="${mine === c.key}" aria-label="${c.label} for ${kidName(k)}">${c.glyph} ${c.label}</button>`;
        return `${kids.length > 1 ? `<div class="rsvp-kid">${kidName(k)}</div>` : ''}<div class="rsvp">${CHOICES.map(btn).join('')}</div>`;
      }).join('');
      const names = isCoach ? `<div class="tiny muted" style="margin-top:4px">${CHOICES.map(c => {
        const ps = votesFor(s.id, c.key).map(v => b.players.find(p => p.id === v.player_id)).filter(Boolean);
        return ps.length ? `${c.glyph} ${ps.map(kidName).join(', ')}` : '';
      }).filter(Boolean).join(' · ')}</div>` : '';
      return `<div style="padding:12px 0;border-top:1px solid var(--line)"><div class="cluster" style="justify-content:space-between"><b>${U.esc(L.fmtWhen(s.starts_at, tz))}</b>${tally}</div>${names}<div style="margin-top:8px">${controls}</div>
        ${isCoach ? `<button class="btn btn-sm" style="margin-top:8px" ${U.dataAttrs({ action: 'coach-poll-convert', slug, poll: poll.id, slot: s.id })}>Make this the practice</button>` : ''}</div>`;
    }).join('');
    return `<div class="card card-pad" id="poll-${poll.id}"><div class="cluster" style="justify-content:space-between"><h3>${U.icon('users')} ${U.esc(poll.title)}</h3>${isCoach ? `<button class="btn btn-sm btn-ghost" ${U.dataAttrs({ action: 'coach-poll-close', slug, poll: poll.id })}>Close poll</button>` : ''}</div>
      ${!kids.length && !readOnly && !isCoach ? `<div style="margin-top:8px">${pickKids('Pick your player to vote')}</div>` : ''}${readOnly ? '<p class="tiny muted">Tap your invite link to vote.</p>' : ''}${rows}</div>`;
  };

  U.postItem = (post, team, { isNew, isCoach, slug, now } = {}) => `<div class="post ${post.pinned ? 'pinned' : ''}">
    <div style="white-space:pre-wrap">${post.pinned ? U.icon('star') + ' ' : ''}${U.esc(post.body)}</div>
    <div class="post-meta">${isNew ? '<span class="badge badge-new">New</span> ' : ''}${U.esc(L.relativeTime(post.created_at, now || new Date(), tzOf(team)))}${isCoach ? ` · <button class="btn btn-ghost btn-sm" style="min-height:26px;padding:0 6px" ${U.dataAttrs({ action: 'coach-post-edit', slug, post: post.id })}>Edit</button>` : ''}</div></div>`;

  // A month cell is ~37px of usable width, so the dot time is squeezed hard:
  // "10:00 AM" → "10a", "5:30 PM" → "5:30p". Longer than that and the cell ellipsises it.
  const dotTime = (iso, tz) => L.fmtTime(iso, tz).replace(':00', '').replace(/\s/, '').toLowerCase().replace(/m$/, '');
  // A cell key is a plain calendar date, so read it back at noon UTC in UTC —
  // no zone shifts the day, and the label says "Sat, Aug 22" instead of "2026-08-22".
  const cellLabel = (key) => L.fmtDay(key + 'T12:00:00Z', 'UTC');
  // The caller stamps each event with `_tz` (its team's tz) before merging teams so a
  // dot can format its own time; `colorFor(event)` maps an event to its team colour.
  U.monthGrid = (grid, { selectedKey, colorFor, teamColorFor } = {}) => {
    const color = colorFor || teamColorFor || (() => 'var(--team)');
    const dows = ['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<div class="dow">${d}</div>`).join('');
    const cells = grid.weeks.flat().map(c => `<button type="button" class="month-cell ${c.inMonth ? '' : 'out'} ${c.isToday ? 'today' : ''} ${c.key === selectedKey ? 'sel' : ''}" ${U.dataAttrs({ action: 'month-day', key: c.key })} aria-label="${U.esc(cellLabel(c.key))}${c.events.length ? `, ${c.events.length} event${c.events.length > 1 ? 's' : ''}` : ''}"${c.isToday ? ' aria-current="date"' : ''}${c.key === selectedKey ? ' aria-pressed="true"' : ''}>
      <div class="d">${c.d}</div>${c.events.slice(0, 2).map(e => `<div class="month-dot ${e.status === 'cancelled' ? 'cancelled' : ''}" style="background:${U.esc(color(e))}">${e.kind === 'game' ? 'G' : e.kind === 'practice' ? 'P' : '•'}${e.time_tbd ? '' : ' ' + U.esc(dotTime(e.starts_at, e._tz || 'America/New_York'))}</div>`).join('')}${c.events.length > 2 ? `<div class="tiny muted" style="text-align:center">+${c.events.length - 2}</div>` : ''}</button>`).join('');
    return `<div class="month"><div class="month-head"><button class="btn btn-ghost btn-sm" data-action="month-nav" data-dir="-1" aria-label="Previous month">${U.icon('arrow-left')}</button><span>${U.esc(grid.label)}</span><button class="btn btn-ghost btn-sm" data-action="month-nav" data-dir="1" aria-label="Next month">${U.icon('arrow-right')}</button></div><div class="month-grid">${dows}${cells}</div></div>`;
  };

  globalThis.UI = U;
})();
