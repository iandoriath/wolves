/* coach_sheets.js — coach forms and composers, shared by index.html (coach mode) and coach.html.
   Classic script; exposes only globalThis.CoachSheets. Uses ScheduleLib (L), UI (U), Store (S), Api.
   Every write goes through Store.coachWrite(slug, fn) so the bundle refetches and pages re-render
   off the 'data' event; failures surface as a toast and leave the sheet open. */
(function () {
  const L = globalThis.ScheduleLib, U = globalThis.UI, S = globalThis.Store;
  const C = {};
  const ORIGIN = SITE_CONFIG.ORIGIN;
  const bundle = (slug) => S.bundles[slug];
  const tzOf = (slug) => bundle(slug).team.tz || 'America/New_York';
  const link = (slug, e) => L.eventLink(ORIGIN, slug, e.id);
  const fail = (err) => U.toast('Save failed: ' + (err?.message || err));
  // writeRow keeps the saved row separate from the success flag: deletes resolve to null in both
  // api.js and mock_api.js, so "did it work?" cannot be read off the value. write() is the flag-only
  // form used by everything that just needs to know whether to close.
  const writeRow = (slug, fn) => S.coachWrite(slug, fn).then(r => ({ ok: true, row: r ?? null }), (err) => { fail(err); return { ok: false, row: null }; });
  const write = (slug, fn) => writeRow(slug, fn).then(r => r.ok || null);
  const wire = (root, map) => root.addEventListener('click', (ev) => { const el = ev.target.closest('[data-act]'); if (el && map[el.dataset.act]) { ev.preventDefault(); map[el.dataset.act](el); } });
  const val = (root, sel) => root.querySelector(sel)?.value?.trim() ?? '';
  const num = (root, sel, lo, hi) => Math.max(lo, Math.min(hi, Number(val(root, sel)) || 1));

  // ---------- day + time ("When") ----------
  // The coach is on Android, where datetime-local is a pair of spinner wheels — so every
  // start time is picked as a day on an inline calendar (U.mountDatePicker, showing what the
  // team already has on) plus a native time input (a clock dial there) with quick-time chips
  // drawn from the team's own habits (L.recentTimes). whenHtml renders the slot; wireWhen
  // mounts the picker into it and hands back readers plus the Time-TBD switch. focusTime marks the
  // time input as the sheet's first focus (U.sheet honours [autofocus]) for a sheet where the
  // calendar comes first: the picker's arrows are no place to land, the time is.
  const hmOf = (iso, tz) => iso ? L.toLocalInput(iso, tz).slice(11) : '';
  const hmLabel = (hm) => L.fmtTime(`2000-01-01T${hm}:00Z`, 'UTC');          // '17:30' → '5:30 PM'
  const whenHtml = (id, { dayLabel = 'When', time = '', chips = [], focusTime = false } = {}) => `<div class="field"><label>${U.esc(dayLabel)}</label><div data-picker="${id}"></div></div>
    <div class="field"><label for="${id}-time">Time</label><input id="${id}-time" type="time" step="300" value="${U.esc(time)}"${focusTime ? ' autofocus' : ''}>${chips.length ? `<div class="chips" data-times="${id}">${chips.map(t => `<button type="button" class="chip" data-time="${U.esc(t)}" aria-pressed="false">${U.esc(hmLabel(t))}</button>`).join('')}</div>` : ''}</div>`;
  const wireWhen = (root, id, { tz, events, value = null, onChange }) => {
    const input = root.querySelector(`#${id}-time`), chipsBox = root.querySelector(`[data-times="${id}"]`);
    const chips = () => [...(chipsBox?.querySelectorAll('.chip') || [])];
    const syncChips = () => chips().forEach(c => { const on = c.dataset.time === input.value; c.classList.toggle('on', on); c.setAttribute('aria-pressed', on); });
    // A chip writes the input and raises 'input' on it, so anything watching the field
    // (bulk add's invalidate, the chip highlight) sees a chip tap exactly like a typed time.
    chipsBox?.addEventListener('click', (ev) => { const c = ev.target.closest('.chip'); if (!c || input.disabled) return; input.value = c.dataset.time; input.dispatchEvent(new Event('input', { bubbles: true })); });
    input.addEventListener('input', syncChips); syncChips();
    const picker = U.mountDatePicker(root.querySelector(`[data-picker="${id}"]`), { tz, events, value, onChange: () => onChange?.() });
    return { picker, day: () => picker.get(), time: () => input.value,
      iso: () => { const d = picker.get(), t = input.value; return d && t ? L.fromLocalInput(`${d}T${t}`, tz) : null; },
      setTbd: (on) => { input.disabled = on; chips().forEach(c => { c.disabled = on; }); } };
  };

  // ---------- role chips ----------
  const rolesChips = (all, selected) => `<div class="chips" data-roles>${[...new Set([...all, ...selected])].map(r => `<button type="button" class="chip ${selected.includes(r) ? 'on' : ''}" data-role="${U.esc(r)}" aria-pressed="${selected.includes(r)}">${U.esc(r)}</button>`).join('')}<input placeholder="+ role" style="min-height:36px;border:1px dashed var(--line);border-radius:999px;padding:4px 10px;width:110px" data-new-role></div>`;
  const readRoles = (root) => [...root.querySelectorAll('[data-roles] .chip.on')].map(c => c.dataset.role);
  const setRoles = (root, selected) => root.querySelectorAll('[data-roles] .chip').forEach(c => {
    const on = selected.includes(c.dataset.role);
    c.classList.toggle('on', on); c.setAttribute('aria-pressed', on);
  });
  const wireRoles = (root, onTouch) => {
    const box = root.querySelector('[data-roles]'), input = root.querySelector('[data-new-role]');
    if (!box) return;
    box.addEventListener('click', (ev) => { const c = ev.target.closest('.chip'); if (!c) return; c.classList.toggle('on'); c.setAttribute('aria-pressed', c.classList.contains('on')); onTouch?.(); });
    if (!input) return;
    const commit = () => {                       // Enter or leaving the field both commit the typed role
      const v = input.value.trim(); if (!v) return;
      input.value = '';
      const existing = [...box.querySelectorAll('.chip')].find(c => c.dataset.role === v);
      if (existing) { existing.classList.add('on'); existing.setAttribute('aria-pressed', 'true'); }
      else input.insertAdjacentHTML('beforebegin', `<button type="button" class="chip on" data-role="${U.esc(v)}" aria-pressed="true">${U.esc(v)}</button>`);
      onTouch?.();
    };
    input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); commit(); } });
    input.addEventListener('blur', commit);
  };

  // ---------- kind segmented control (event editor + bulk add) ----------
  const wireKind = (root, initialKind, onChange) => {
    let kind = initialKind;
    const showOnly = () => root.querySelectorAll('[data-only]').forEach(el => { el.style.display = el.dataset.only === kind ? '' : 'none'; });
    showOnly();
    root.querySelector('[data-kind]')?.addEventListener('click', (ev) => {
      const bt = ev.target.closest('button'); if (!bt || bt.dataset.k === kind) return;
      kind = bt.dataset.k;
      root.querySelectorAll('[data-kind] button').forEach(x => x.setAttribute('aria-pressed', x === bt));
      showOnly(); onChange?.(kind);
    });
    return () => kind;
  };

  const shareAfter = (title, text) => U.sheet({ title, html: `<p class="muted">Send it to the team text?</p><div class="sheet-actions"><button class="btn btn-primary" data-act="share">${U.icon('share')} Text the team</button><button class="btn btn-ghost" data-act="done">Done</button></div>`,
    onOpen: (root) => wire(root, { share: () => { U.closeSheet(); U.share({ title, text }); }, done: () => U.closeSheet() }) });

  // Vetted team colours — the top bar prints white on --team, so only shades that stay legible.
  const PALETTE = [['#2d6a4f', 'Forest'], ['#1d4ed8', 'Royal blue'], ['#4338ca', 'Indigo'], ['#7e22ce', 'Purple'],
    ['#9f1239', 'Maroon'], ['#0f766e', 'Teal'], ['#334155', 'Slate'], ['#c2410c', 'Burnt orange']];
  const RING = 'inset 0 0 0 2px var(--surface), 0 0 0 2px var(--ink)';
  const colorChips = (current) => {
    const cur = String(current || '').toLowerCase();
    const on = PALETTE.some(([hex]) => hex === cur) ? cur : PALETTE[0][0];
    return `<div class="chips" data-colors>${PALETTE.map(([hex, name]) => `<button type="button" class="chip" data-color="${hex}" aria-pressed="${hex === on}" style="background:${hex};color:#fff;border-color:transparent${hex === on ? ';box-shadow:' + RING : ''}">${U.esc(name)}</button>`).join('')}</div>`;
  };
  const readColor = (root) => root.querySelector('[data-colors] .chip[aria-pressed="true"]')?.dataset.color || PALETTE[0][0];
  const wireColors = (root) => root.querySelector('[data-colors]')?.addEventListener('click', (ev) => {
    const c = ev.target.closest('.chip'); if (!c) return;
    root.querySelectorAll('[data-colors] .chip').forEach(x => { x.setAttribute('aria-pressed', x === c); x.style.boxShadow = x === c ? RING : ''; });
  });

  // ---------- event editor ----------
  C.eventSheet = ({ slug, event = null, preset = {}, onSaved }) => {
    const b = bundle(slug), t = b.team, tz = t.tz;
    const e = event || { kind: preset.kind || 'game', title: '', opponent: '', starts_at: preset.starts_at || null, time_tbd: false, duration_min: null,
      location: preset.location ?? t.default_location, home: null, notes: '', volunteer_roles: preset.volunteer_roles ?? (preset.kind === 'game' || !preset.kind ? t.default_volunteer_roles : []), status: 'scheduled', status_note: '' };
    const locs = [...new Set(b.events.map(x => x.location).filter(Boolean).concat(t.default_location ? [t.default_location] : []))];
    const opps = [...new Set(b.events.map(x => x.opponent).filter(Boolean))];
    const chips = L.recentTimes(b.events, tz, 4);
    const html = `<form data-form>
      <div class="field"><label>Kind</label><div class="seg" data-kind>${['game', 'practice', 'other'].map(k => `<button type="button" data-k="${k}" aria-pressed="${e.kind === k}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
      <div class="field" data-only="game"><label for="ev-opp">Opponent</label><input id="ev-opp" list="opp-list" value="${U.esc(e.opponent || '')}"><datalist id="opp-list">${opps.map(o => `<option value="${U.esc(o)}">`).join('')}</datalist></div>
      <div class="field" data-only="game"><label>Home / Away</label><div class="seg" data-home>${[['true', 'Home'], ['false', 'Away'], ['', 'Unknown']].map(([v, l]) => `<button type="button" data-h="${v}" aria-pressed="${String(e.home ?? '') === v}">${l}</button>`).join('')}</div></div>
      <div class="field" data-only="other"><label for="ev-title">Title</label><input id="ev-title" value="${U.esc(e.title || '')}" placeholder="Picture day, Team party…"></div>
      ${whenHtml('ev', { time: hmOf(e.starts_at, tz), chips })}
      <div class="switch"><label for="ev-tbd">Time TBD (shows date only)</label><input type="checkbox" id="ev-tbd" ${e.time_tbd ? 'checked' : ''}></div>
      <div class="field-row"><div class="field"><label for="ev-dur">Duration (min)</label><input id="ev-dur" type="number" inputmode="numeric" value="${U.esc(e.duration_min ?? '')}" placeholder="${U.esc(e.kind === 'game' ? t.game_duration_min : t.practice_duration_min)}"></div>
      <div class="field"><label for="ev-loc">Location</label><input id="ev-loc" list="loc-list" value="${U.esc(e.location || '')}"><datalist id="loc-list">${locs.map(o => `<option value="${U.esc(o)}">`).join('')}</datalist></div></div>
      <div class="field"><label>Volunteer roles</label>${rolesChips(t.default_volunteer_roles || [], e.volunteer_roles || [])}</div>
      <div class="field"><label for="ev-notes">Notes <span class="muted" style="font-weight:400">(parents see these; they also appear in the public calendar feed)</span></label><textarea id="ev-notes">${U.esc(e.notes || '')}</textarea></div>
      ${event && event.status !== 'scheduled' ? `<div class="field"><label for="ev-snote">Status note (${U.esc(event.status)})</label><input id="ev-snote" value="${U.esc(event.status_note || '')}"></div>` : ''}
      <div class="sheet-actions"><button class="btn btn-primary" data-act="save">Save</button>${event ? '' : '<button class="btn" data-act="save-another">Save &amp; add another (+7 days)</button>'}<button class="btn btn-ghost" data-act="cancel">Cancel</button></div></form>`;
    const { root, close } = U.sheet({ title: event ? 'Edit event' : 'New event', html });
    let home = e.home, rolesTouched = false;
    const getKind = wireKind(root, e.kind, (kind) => {
      root.querySelector('#ev-dur').placeholder = kind === 'game' ? t.game_duration_min : t.practice_duration_min;
      if (!rolesTouched) setRoles(root, kind === 'game' ? (t.default_volunteer_roles || []) : []);
    });
    wireRoles(root, () => { rolesTouched = true; });
    root.querySelector('[data-home]').addEventListener('click', (ev) => { const bt = ev.target.closest('button'); if (!bt) return; home = bt.dataset.h === '' ? null : bt.dataset.h === 'true'; root.querySelectorAll('[data-home] button').forEach(x => x.setAttribute('aria-pressed', x === bt)); });
    // Editing preselects the event's day; Save-&-add-another / Duplicate arrive with preset.starts_at
    // (+7 days) and preselect that; a fresh event opens on this month with nothing picked.
    const when = wireWhen(root, 'ev', { tz, events: b.events, value: e.starts_at ? L.dateKey(e.starts_at, tz) : null });
    const tbd = root.querySelector('#ev-tbd');
    when.setTbd(tbd.checked); tbd.addEventListener('change', () => when.setTbd(tbd.checked));
    const collect = () => {
      const kind = getKind();
      const day = when.day(); if (!day) { U.toast('Pick a day on the calendar'); return null; }
      // A TBD event still needs a point in time to sort and feed by. A new one is pinned to noon,
      // whatever the disabled field happens to show; an existing one keeps its stored time and only
      // falls back to noon when the field is empty.
      const time = tbd.checked ? (event ? when.time() || '12:00' : '12:00') : when.time();
      if (!time) { U.toast('Pick a time, or check Time TBD'); return null; }
      const starts_at = L.fromLocalInput(`${day}T${time}`, tz);
      const dur = val(root, '#ev-dur');
      return { team_id: t.id, kind, title: kind === 'other' ? val(root, '#ev-title') : '', opponent: kind === 'game' ? (val(root, '#ev-opp') || null) : null, home: kind === 'game' ? home : null,
        starts_at, time_tbd: root.querySelector('#ev-tbd').checked, duration_min: dur ? Number(dur) : null, location: val(root, '#ev-loc'), volunteer_roles: readRoles(root), notes: val(root, '#ev-notes'),
        ...(event ? { id: event.id, status_note: root.querySelector('#ev-snote') ? val(root, '#ev-snote') : event.status_note } : {}) };
    };
    wire(root, {
      cancel: () => close(),
      save: async () => { const row = collect(); if (!row) return; const { ok, row: saved } = await writeRow(slug, () => Api.saveEvent(row)); if (ok) { close(); U.toast(event ? 'Saved' : 'Event added'); onSaved?.(saved); } },
      'save-another': async () => { const row = collect(); if (!row) return; if (!(await write(slug, () => Api.saveEvent(row)))) return; U.toast('Added — next one prefilled'); close();
        C.eventSheet({ slug, preset: { kind: row.kind, starts_at: L.addDaysLocal(row.starts_at, tz, 7), location: row.location, volunteer_roles: row.volunteer_roles }, onSaved }); },
    });
    root.querySelector('[data-form]').addEventListener('submit', (ev) => ev.preventDefault());
  };

  // ---------- status changes ----------
  const statusSheet = ({ slug, event, status, title, placeholder, compose }) => {
    const b = bundle(slug);
    const { root, close } = U.sheet({ title, html: `<div class="field"><label for="st-note">Note for parents (optional)</label><input id="st-note" placeholder="${U.esc(placeholder)}" value="${U.esc(event.status === status ? event.status_note : '')}"></div><div class="sheet-actions"><button class="btn ${status === 'cancelled' ? 'btn-danger' : 'btn-primary'}" data-act="go">${U.esc(title)}</button><button class="btn btn-ghost" data-act="x">Back</button></div>` });
    wire(root, { x: () => close(), go: async () => { const note = val(root, '#st-note'); const saved = await write(slug, () => Api.saveEvent({ id: event.id, status, status_note: note })); if (!saved) return; close();
      shareAfter(title, compose({ team: b.team, event: { ...event, status, status_note: note }, note, link: link(slug, event) })); } });
  };
  C.cancelSheet = ({ slug, event }) => statusSheet({ slug, event, status: 'cancelled', title: 'Cancel event', placeholder: 'Rained out — makeup TBD', compose: L.composeCancel });
  C.tentativeSheet = ({ slug, event }) => statusSheet({ slug, event, status: 'tentative', title: 'Mark weather-pending', placeholder: 'Field check at 8 — decision by 8:30', compose: L.composeTentative });
  C.restore = ({ slug, event }) => write(slug, () => Api.saveEvent({ id: event.id, status: 'scheduled', status_note: '' })).then(r => r && U.toast('Back on the schedule'));
  C.rescheduleSheet = ({ slug, event }) => {
    const b = bundle(slug), tz = b.team.tz;
    const { root, close } = U.sheet({ title: 'Reschedule', html: `${whenHtml('rs', { dayLabel: 'New date', time: hmOf(event.starts_at, tz), chips: L.recentTimes(b.events, tz, 4), focusTime: true })}<div class="field"><label for="rs-loc">Location</label><input id="rs-loc" value="${U.esc(event.location || '')}"></div><p class="tiny muted">RSVPs will be cleared so families answer again; volunteer sign-ups stay.</p><div class="sheet-actions"><button class="btn btn-primary" data-act="go">Move it</button><button class="btn btn-ghost" data-act="x">Back</button></div>` });
    const when = wireWhen(root, 'rs', { tz, events: b.events, value: L.dateKey(event.starts_at, tz) });
    wire(root, { x: () => close(), go: async () => { const starts_at = when.iso(); if (!starts_at) return U.toast('Pick a day and time');
      const oldStart = event.rescheduled_from || event.starts_at;
      const location = val(root, '#rs-loc');
      const saved = await write(slug, async () => { await Api.clearEventRsvps(event.id); return Api.saveEvent({ id: event.id, starts_at, location, rescheduled_from: oldStart, status: 'scheduled', status_note: '' }); });
      if (!saved) return; close(); shareAfter('Moved', L.composeReschedule({ team: b.team, event: { ...event, starts_at, location }, oldStart, link: link(slug, event) })); } });
  };
  C.resultSheet = ({ slug, event }) => {
    const { root, close } = U.sheet({ title: 'Enter result', html: `<div class="field-row"><div class="field"><label for="r-us">Us</label><input id="r-us" type="number" inputmode="numeric" value="${U.esc(event.score_us ?? '')}"></div><div class="field"><label for="r-them">${U.esc(event.opponent || 'Them')}</label><input id="r-them" type="number" inputmode="numeric" value="${U.esc(event.score_them ?? '')}"></div></div><div class="sheet-actions"><button class="btn btn-primary" data-act="go">Save</button><button class="btn" data-act="clear">Clear result</button><button class="btn btn-ghost" data-act="x">Back</button></div>` });
    wire(root, { x: () => close(),
      go: async () => { const us = val(root, '#r-us'), them = val(root, '#r-them'); if (us === '' || them === '') return U.toast('Enter both scores'); if (await write(slug, () => Api.saveEvent({ id: event.id, score_us: Number(us), score_them: Number(them) }))) close(); },
      clear: async () => { if (await write(slug, () => Api.saveEvent({ id: event.id, score_us: null, score_them: null }))) close(); } });
  };
  C.deleteEvent = async ({ slug, event }) => { if (await U.confirm({ title: 'Delete this event?', body: 'This removes it for everyone, including RSVPs. Cancelling keeps it visible.', confirmLabel: 'Delete', danger: true })) { if (await write(slug, () => Api.deleteEvent(event.id))) U.toast('Deleted'); } };
  C.duplicate = ({ slug, event }) => C.eventSheet({ slug, preset: { kind: event.kind, starts_at: L.addDaysLocal(event.starts_at, tzOf(slug), 7), location: event.location, volunteer_roles: event.volunteer_roles } });

  // ---------- composers ----------
  const summary = (slug, event) => { const b = bundle(slug); return L.summarizeRsvps(b.players, b.rsvps.filter(r => r.event_id === event.id), b.team.min_players); };
  const openRoles = (slug, event) => (event.volunteer_roles || []).filter(r => !bundle(slug).claims.some(c => c.event_id === event.id && c.role === r));
  C.nudge = ({ slug, event }) => { const b = bundle(slug); const s = summary(slug, event); U.share({ title: 'RSVP reminder', text: L.composeNudge({ team: b.team, event, silentNames: s.silent.map(L.displayName), openRoles: openRoles(slug, event), link: link(slug, event) }) }); };
  C.textTeam = ({ slug, event }) => { const b = bundle(slug); U.share({ title: L.eventTitle(event), text: L.composeEventShare({ team: b.team, event, link: link(slug, event) }) }); };
  C.copyNoReplies = async ({ slug, event }) => { const s = summary(slug, event); U.toast((await U.copy(s.silent.map(L.displayName).join(', ') || '(everyone answered)')) ? 'Copied no-reply names' : 'Couldn’t copy'); };
  C.textNoReplies = ({ slug, event }) => {
    const b = bundle(slug); const s = summary(slug, event);
    const phones = s.silent.map(p => b.contacts.find(c => c.player_id === p.id)?.phone).filter(Boolean).map(p => p.replace(/[^\d+]/g, ''));
    const body = L.composeNudge({ team: b.team, event, silentNames: [], openRoles: openRoles(slug, event), link: link(slug, event) });
    if (!phones.length) return U.share({ title: 'RSVP reminder', text: L.composeNudge({ team: b.team, event, silentNames: s.silent.map(L.displayName), openRoles: openRoles(slug, event), link: link(slug, event) }) });
    // iOS puts the recipients in a query string, where a bare '+' would decode as a space.
    location.href = U.isIOS ? `sms:/open?addresses=${phones.map(encodeURIComponent).join(',')}&body=${encodeURIComponent(body)}` : `sms:${phones.join(',')}?body=${encodeURIComponent(body)}`;
  };

  // ---------- player ----------
  C.playerSheet = ({ slug, player, event }) => {
    const b = bundle(slug); const c = b.contacts.find(x => x.player_id === player.id) || { parent_name: '', phone: '', email: '', notes: '' };
    const r = event ? b.rsvps.find(x => x.event_id === event.id && x.player_id === player.id) : null;
    const rsvpPart = event ? `<div class="kicker">RSVP for ${U.esc(L.eventTitle(event))}</div><div class="rsvp" style="margin:6px 0 4px">${['going', 'maybe', 'out'].map(st => `<button type="button" class="${r?.status === st ? 'on-' + st : ''}" data-act="rsvp-${st}">${st === 'going' ? 'Going' : st === 'maybe' ? 'Maybe' : 'Can’t'}</button>`).join('')}</div><button class="btn btn-ghost btn-sm" data-act="rsvp-clear">Clear answer</button>${r?.note ? `<p class="tiny muted">Note: “${U.esc(r.note)}”</p>` : ''}<div class="divider"></div>` : '';
    const contactPart = `<div class="cluster">${c.phone ? `<a class="btn btn-sm" href="tel:${U.esc(c.phone.replace(/[^\d+]/g, ''))}">${U.icon('phone')} Call</a><a class="btn btn-sm" href="sms:${U.esc(c.phone.replace(/[^\d+]/g, ''))}">${U.icon('message')} Text</a>` : ''}${c.email ? `<a class="btn btn-sm" href="mailto:${U.esc(c.email)}">${U.icon('mail')} Email</a>` : ''}</div>
      <div class="field" style="margin-top:12px"><label for="pc-first">First name</label><input id="pc-first" value="${U.esc(player.first_name)}"></div>
      <div class="field-row"><div class="field"><label for="pc-init">Last initial</label><input id="pc-init" maxlength="1" value="${U.esc(player.last_initial || '')}"></div><div class="switch"><label for="pc-active">Active</label><input type="checkbox" id="pc-active" ${player.active ? 'checked' : ''}></div></div>
      <div class="field"><label for="pc-parent">Parent name (coach-only)</label><input id="pc-parent" value="${U.esc(c.parent_name)}"></div>
      <div class="field-row"><div class="field"><label for="pc-phone">Phone</label><input id="pc-phone" type="tel" value="${U.esc(c.phone)}"></div><div class="field"><label for="pc-email">Email</label><input id="pc-email" type="email" value="${U.esc(c.email)}"></div></div>
      <div class="field"><label for="pc-notes">Notes (coach-only)</label><input id="pc-notes" value="${U.esc(c.notes)}"></div>
      <div class="sheet-actions"><button class="btn btn-primary" data-act="save">Save</button><button class="btn btn-ghost" data-act="x">Back</button></div>`;
    const { root, close } = U.sheet({ title: L.displayName(player), html: rsvpPart + contactPart });
    const setR = async (st) => { const ok = await write(slug, () => st ? Api.upsertRsvp({ event_id: event.id, player_id: player.id, status: st, note: r?.note || '' }) : Api.deleteRsvp(event.id, player.id)); if (ok) close(); };
    wire(root, { x: () => close(), 'rsvp-going': () => setR('going'), 'rsvp-maybe': () => setR('maybe'), 'rsvp-out': () => setR('out'), 'rsvp-clear': () => setR(null),
      save: async () => { const ok = await write(slug, async () => { await Api.savePlayer({ id: player.id, team_id: b.team.id, first_name: val(root, '#pc-first'), last_initial: val(root, '#pc-init') || null, active: root.querySelector('#pc-active').checked });
        await Api.saveContact({ player_id: player.id, parent_name: val(root, '#pc-parent'), phone: val(root, '#pc-phone'), email: val(root, '#pc-email'), notes: val(root, '#pc-notes') }); return true; }); if (ok) { close(); U.toast('Saved'); } } });
  };

  // ---------- posts ----------
  C.announceSheet = ({ slug, post = null, draft = null }) => {
    const b = bundle(slug);
    const body0 = draft ? draft.body : (post?.body || '');
    const pinned0 = draft ? draft.pinned : !!post?.pinned;
    const { root, close } = U.sheet({ title: post ? 'Edit announcement' : 'Announcement', html: `<div class="field"><label for="an-body">Message</label><textarea id="an-body" placeholder="Picture day forms due Friday…">${U.esc(body0)}</textarea></div><div class="switch"><label for="an-pin">Pin to the top</label><input type="checkbox" id="an-pin" ${pinned0 ? 'checked' : ''}></div><div class="sheet-actions"><button class="btn btn-primary" data-act="save">${post ? 'Save' : 'Post'}</button>${post ? '<button class="btn btn-danger" data-act="del">Delete</button>' : ''}<button class="btn btn-ghost" data-act="x">Cancel</button></div>` });
    const readDraft = () => ({ body: val(root, '#an-body'), pinned: root.querySelector('#an-pin').checked });
    wire(root, { x: () => close(),
      // U.confirm takes over the one shared dialog, so carry the unsaved draft back into the re-opened sheet.
      del: async () => { const d = readDraft();
        if (!(await U.confirm({ title: 'Delete this announcement?', body: 'It disappears from every parent’s home screen.', confirmLabel: 'Delete', danger: true }))) return C.announceSheet({ slug, post, draft: d });
        if (await write(slug, () => Api.deletePost(post.id))) { U.closeSheet(); U.toast('Deleted'); } else C.announceSheet({ slug, post, draft: d }); },
      save: async () => { const { body, pinned } = readDraft(); if (!body) return U.toast('Write something first');
        const saved = await write(slug, () => Api.savePost({ ...(post ? { id: post.id } : { team_id: b.team.id }), body, pinned })); if (!saved) return; close();
        if (!post) shareAfter('Announcement', L.composeAnnouncement({ team: b.team, body, link: `${ORIGIN}/?team=${encodeURIComponent(slug)}` })); } });
  };

  // ---------- polls ----------
  C.pollSheet = ({ slug }) => {
    const b = bundle(slug), tz = b.team.tz;
    const usual = L.recentTimes(b.events, tz, 1)[0] || '17:30';
    // sheet-tall: the sheet opens at its full height, so the rows that appear under the calendar as
    // days are tapped never grow the sheet — and shift the calendar — under the coach's thumb.
    const { root, close } = U.sheet({ title: 'New practice-time poll', className: 'sheet-tall', html: `<div class="field"><label for="pl-title">Title</label><input id="pl-title" placeholder="Extra practice next week?"></div>
      <div class="field"><label>Tap the days you’re offering <span class="muted" style="font-weight:400">(2–6)</span></label><div data-picker="pl"></div></div>
      <div data-slots style="margin-bottom:4px"></div>
      <div class="sheet-actions"><button class="btn btn-primary" data-act="save">Post poll</button><button class="btn btn-ghost" data-act="x">Cancel</button></div>` });
    // One row per picked day, sorted. times remembers each day's time across re-renders; a day
    // that is untapped (on the calendar or via its ×) drops out, a new day borrows the time of the
    // row above it — or the one below, or the team's usual practice time — so a 3-day poll is
    // usually three taps and no typing.
    const times = new Map();
    const slotsEl = root.querySelector('[data-slots]');
    const renderRows = (picked) => {                 // picked: the picker's Set of day keys
      const days = [...picked].sort();
      for (const k of [...times.keys()]) if (!days.includes(k)) times.delete(k);
      days.forEach((k, i) => { if (!times.has(k)) times.set(k, (i > 0 && times.get(days[i - 1])) || days.slice(i + 1).map(d => times.get(d)).find(Boolean) || usual); });
      slotsEl.innerHTML = days.length
        ? days.map(k => `<div class="slot-row"><b>${U.esc(L.fmtKey(k))}</b><input type="time" step="300" value="${U.esc(times.get(k))}" data-slot-time="${U.esc(k)}" aria-label="Time on ${U.esc(L.fmtKey(k))}"><button type="button" class="btn btn-ghost" data-act="drop" data-key="${U.esc(k)}" aria-label="Remove ${U.esc(L.fmtKey(k))}">${U.icon('x')}</button></div>`).join('')
        : '<p class="tiny muted" style="margin:0 0 8px">Pick at least 2 days above — each gets its own time.</p>';
    };
    const picker = U.mountDatePicker(root.querySelector('[data-picker="pl"]'), { tz, events: b.events, multi: true, max: 6, onChange: renderRows });
    slotsEl.addEventListener('input', (ev) => { const k = ev.target.dataset.slotTime; if (k) times.set(k, ev.target.value); });
    renderRows(picker.get());
    wire(root, { x: () => close(),
      drop: (el) => {
        const key = el.dataset.key, s = picker.get(); s.delete(key); picker.set(s); renderRows(s);
        // The × just used went with its row, so focus moves to that day on the calendar (still the
        // thing being edited) or, when the view is on another month, to the nearest remaining row's ×.
        const xs = [...slotsEl.querySelectorAll('[data-act="drop"]')];
        (root.querySelector(`[data-pick-day="${key}"]`) || xs.find(x => x.dataset.key > key) || xs[xs.length - 1] || root.querySelector('[data-pick-day]'))?.focus();
      },
      save: async () => { const title = val(root, '#pl-title'); const days = [...picker.get()].sort();
        if (!title || days.length < 2) return U.toast('Add a title and pick at least 2 days');
        if (days.some(k => !times.get(k))) return U.toast('Set a time for every day');
        const starts = days.map(k => L.fromLocalInput(`${k}T${times.get(k)}`, tz));
        if (await write(slug, () => Api.savePoll({ team_id: b.team.id, title, status: 'open' }, starts))) { close(); U.toast('Poll posted'); } } });
  };
  C.closePoll = ({ slug, poll }) => write(slug, () => Api.closePoll(poll.id)).then(r => r && U.toast('Poll closed'));
  C.convertSlot = ({ slug, poll, slot }) => {
    const b = bundle(slug), tz = b.team.tz;
    const { root, close } = U.sheet({ title: 'Make this the practice', html: `<p><b>${U.esc(L.fmtWhen(slot.starts_at, tz))}</b></p><div class="field"><label for="cv-loc">Location</label><input id="cv-loc" value="${U.esc(b.team.default_location || '')}"></div><div class="switch"><label for="cv-rep">Repeat weekly</label><input type="checkbox" id="cv-rep"></div><div class="field" data-until style="display:none"><label for="cv-until">Until</label><input id="cv-until" type="date"></div><div class="sheet-actions"><button class="btn btn-primary" data-act="go">Add practice &amp; close poll</button><button class="btn btn-ghost" data-act="x">Cancel</button></div>` });
    root.querySelector('#cv-rep').addEventListener('change', (ev) => { root.querySelector('[data-until]').style.display = ev.target.checked ? '' : 'none'; });
    wire(root, { x: () => close(), go: async () => { const rep = root.querySelector('#cv-rep').checked; const until = val(root, '#cv-until'); const starts = rep && until ? L.expandWeekly(slot.starts_at, tz, { until: L.fromLocalInput(until + 'T23:59', tz) }) : [slot.starts_at];
      const rows = starts.map(starts_at => ({ team_id: b.team.id, kind: 'practice', starts_at, location: val(root, '#cv-loc'), volunteer_roles: [] }));
      if (await write(slug, async () => { await Api.insertEvents(rows); return Api.closePoll(poll.id); })) { close(); U.toast(`Added ${rows.length} practice${rows.length === 1 ? '' : 's'}`); } } });
  };

  // ---------- settings ----------
  C.settingsSheet = async ({ slug, draft = null }) => {
    const b = bundle(slug), t = b.team;
    const v = { name: t.name, emoji: t.emoji, color: t.color, tz: t.tz, default_location: t.default_location || '',
      min_players: t.min_players, arrive_early_min: t.arrive_early_min, game_duration_min: t.game_duration_min,
      practice_duration_min: t.practice_duration_min, roles: t.default_volunteer_roles || [], ...(draft || {}) };
    // Render first, then fill the invite link in — teamSecrets() is a network round trip and the
    // sheet must not wait on it before appearing.
    const { root, close } = U.sheet({ title: 'Team settings', html: `<div class="card card-pad stack" style="margin-bottom:14px"><div class="kicker">Invite link</div><div class="tiny muted" style="word-break:break-all" data-inv>Loading invite link…</div><div class="cluster"><button class="btn btn-sm btn-primary" data-act="share-inv" disabled>${U.icon('share')} Share</button><button class="btn btn-sm" data-act="copy-inv" disabled>${U.icon('copy')} Copy</button><button class="btn btn-sm btn-ghost" data-act="regen" disabled>Regenerate code</button></div><p class="tiny muted">Parents need this link once per phone. Regenerating logs everyone out of RSVPs until they tap the new link.</p></div>
      <div class="field-row"><div class="field"><label for="ts-name">Team name</label><input id="ts-name" value="${U.esc(v.name)}"></div><div class="field"><label for="ts-emoji">Emoji</label><input id="ts-emoji" value="${U.esc(v.emoji)}"></div></div>
      <div class="field"><label>Colour</label>${colorChips(v.color)}</div>
      <div class="field"><label for="ts-tz">Time zone</label><select id="ts-tz">${['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'].map(z => `<option ${z === v.tz ? 'selected' : ''}>${z}</option>`).join('')}</select></div>
      <div class="field"><label for="ts-loc">Default location</label><input id="ts-loc" value="${U.esc(v.default_location)}"></div>
      <div class="field-row"><div class="field"><label for="ts-min">Min players</label><input id="ts-min" type="number" inputmode="numeric" value="${U.esc(v.min_players)}"></div><div class="field"><label for="ts-arr">Arrive early (min)</label><input id="ts-arr" type="number" inputmode="numeric" value="${U.esc(v.arrive_early_min)}"></div></div>
      <div class="field-row"><div class="field"><label for="ts-gd">Game length (min)</label><input id="ts-gd" type="number" inputmode="numeric" value="${U.esc(v.game_duration_min)}"></div><div class="field"><label for="ts-pd">Practice length (min)</label><input id="ts-pd" type="number" inputmode="numeric" value="${U.esc(v.practice_duration_min)}"></div></div>
      <div class="field"><label>Default volunteer roles (games)</label>${rolesChips(t.default_volunteer_roles || [], v.roles)}</div>
      <div class="sheet-actions"><button class="btn btn-primary" data-act="save">Save</button><button class="btn btn-ghost" data-act="x">Cancel</button></div>` });
    wireRoles(root); wireColors(root);
    const readDraft = () => ({ name: val(root, '#ts-name'), emoji: val(root, '#ts-emoji'), color: readColor(root), tz: val(root, '#ts-tz'), default_location: val(root, '#ts-loc'),
      min_players: val(root, '#ts-min'), arrive_early_min: val(root, '#ts-arr'), game_duration_min: val(root, '#ts-gd'), practice_duration_min: val(root, '#ts-pd'), roles: readRoles(root) });
    let inv = '';
    // Wire before the fetch: Cancel and Save are enabled from the first frame, so they must not wait
    // on the invite-code round trip. The three link buttons stay disabled until `inv` is filled in below.
    wire(root, { x: () => close(), 'share-inv': () => U.share({ title: `${t.name} schedule`, text: `${t.emoji} ${t.name} schedule & RSVP — tap to pick your player:`, url: inv }), 'copy-inv': async () => U.toast((await U.copy(inv)) ? 'Copied' : 'Couldn’t copy'),
      regen: async () => { const d = readDraft();
        if (!(await U.confirm({ title: 'Regenerate invite code?', body: 'Every parent will need the new link to RSVP again.', confirmLabel: 'Regenerate', danger: true }))) return C.settingsSheet({ slug, draft: d });
        // Same shape the migration seeds with — upper(encode(gen_random_bytes(4),'hex')) —
        // from a CSPRNG, because this code is the only thing gating the roster.
        const nc = [...crypto.getRandomValues(new Uint8Array(4))].map(x => x.toString(16).padStart(2, '0')).join('').toUpperCase();
        try { await Api.setTeamCode(t.id, nc); U.toast('New code: ' + nc); } catch (e) { fail(e); }
        close(); C.settingsSheet({ slug, draft: d }); },
      save: async () => { const d = readDraft();
        const row = { id: t.id, name: d.name, emoji: d.emoji, color: d.color, tz: d.tz, default_location: d.default_location, min_players: Number(d.min_players || 0), arrive_early_min: Number(d.arrive_early_min || 0), game_duration_min: Number(d.game_duration_min || 90), practice_duration_min: Number(d.practice_duration_min || 60), default_volunteer_roles: d.roles };
        if (await write(slug, () => Api.saveTeam(row))) { close(); U.toast('Saved'); } } });
    try {
      const code = (await Api.teamSecrets()).find(s => s.team_id === t.id)?.code || '';
      if (!code) throw new Error('no invite code for this team');
      inv = L.teamLink(ORIGIN, slug, code);
      const el = root.querySelector('[data-inv]'); el.textContent = inv; el.classList.remove('muted');
      root.querySelectorAll('[data-act="share-inv"],[data-act="copy-inv"],[data-act="regen"]').forEach(x => { x.disabled = false; });
    } catch { root.querySelector('[data-inv]').textContent = 'Couldn’t load the invite code — try again'; }
  };

  // ---------- bulk add ----------
  C.bulkAddSheet = ({ slug }) => {
    const b = bundle(slug), t = b.team, tz = t.tz;
    const { root, close } = U.sheet({ title: 'Add a series', html: `<div class="field"><label>Kind</label><div class="seg" data-kind>${['game', 'practice', 'other'].map(k => `<button type="button" data-k="${k}" aria-pressed="${k === 'practice'}">${k[0].toUpperCase() + k.slice(1)}</button>`).join('')}</div></div>
      <div class="field" data-only="game"><label for="bk-opp">Opponent</label><input id="bk-opp"></div><div class="field" data-only="other"><label for="bk-title">Title</label><input id="bk-title"></div>
      ${whenHtml('bk', { dayLabel: 'First date', chips: L.recentTimes(b.events, tz, 4) })}
      <div class="field-row"><div class="field"><label for="bk-every">Every (weeks)</label><input id="bk-every" type="number" inputmode="numeric" value="1" min="1" max="52"></div><div class="field"><label for="bk-count">How many</label><input id="bk-count" type="number" inputmode="numeric" value="8" min="1" max="60"></div></div>
      <div class="field"><label for="bk-loc">Location</label><input id="bk-loc" value="${U.esc(t.default_location || '')}"></div>
      <div class="field"><label>Volunteer roles</label>${rolesChips(t.default_volunteer_roles || [], [])}</div>
      <button class="btn btn-block" data-act="preview">Preview</button><div data-preview style="margin-top:10px"></div>
      <div class="sheet-actions"><button class="btn btn-primary" data-act="save" disabled>Add all</button><button class="btn btn-ghost" data-act="x">Cancel</button></div>` });
    let rolesTouched = false;
    const saveBtn = root.querySelector('[data-act="save"]');
    // Any edit after a preview invalidates it, so "Add all" can never insert a stale set.
    const invalidate = () => { saveBtn.disabled = true; saveBtn.textContent = 'Add all'; root.querySelector('[data-preview]').innerHTML = ''; };
    const getKind = wireKind(root, 'practice', (kind) => { if (!rolesTouched) setRoles(root, kind === 'game' ? (t.default_volunteer_roles || []) : []); invalidate(); });
    wireRoles(root, () => { rolesTouched = true; invalidate(); });
    // Only real value changes invalidate: the fields fire input/change, and the chips and the kind
    // control invalidate through their own callbacks above — so reading the preview list leaves it alone.
    root.addEventListener('input', invalidate);
    root.addEventListener('change', invalidate);
    // A calendar tap is a click, not an input event, so the picker invalidates through its own callback.
    const when = wireWhen(root, 'bk', { tz, events: b.events, onChange: invalidate });
    const buildRows = () => {                    // single source of truth for both Preview and Add all
      const first = when.iso();
      if (!first) { U.toast('Pick the first date and time'); return null; }
      const kind = getKind();
      const starts = L.expandWeekly(first, tz, { count: num(root, '#bk-count', 1, 60), everyWeeks: num(root, '#bk-every', 1, 52) });
      return starts.map(starts_at => ({ team_id: t.id, kind, title: kind === 'other' ? val(root, '#bk-title') : '', opponent: kind === 'game' ? (val(root, '#bk-opp') || null) : null, starts_at, location: val(root, '#bk-loc'), volunteer_roles: readRoles(root) }));
    };
    wire(root, { x: () => close(),
      preview: () => { const rows = buildRows(); if (!rows) return;
        root.querySelector('[data-preview]').innerHTML = `<div class="rowlist">${rows.map(r => `<div class="row" style="grid-template-columns:1fr"><div>${U.esc(L.fmtWhen(r.starts_at, tz))}</div></div>`).join('')}</div>`;
        saveBtn.disabled = false; saveBtn.textContent = `Add ${rows.length} event${rows.length === 1 ? '' : 's'}`; },
      save: async () => { const rows = buildRows(); if (!rows) return; if (!rows.length) return U.toast('Nothing to add — check the dates');
        if (await write(slug, () => Api.insertEvents(rows))) { close(); U.toast(`Added ${rows.length} event${rows.length === 1 ? '' : 's'}`); } } });
  };

  // ---------- per-event menu ----------
  C.menu = ({ slug, event }) => {
    const past = L.isPast(event, bundle(slug).team, new Date());
    const items = [
      ['edit', U.icon('edit'), 'Edit'],
      event.status === 'cancelled' ? ['restore', U.icon('check'), 'Restore to schedule'] : ['cancel', U.icon('x'), 'Cancel…'],
      event.status === 'tentative' ? ['restore', U.icon('check'), 'Confirm it’s on'] : (event.status === 'scheduled' ? ['tentative', U.icon('alert'), 'Weather pending…'] : null),
      ['reschedule', U.icon('clock'), 'Reschedule…'],
      event.kind === 'game' ? ['result', U.icon('star'), past || event.score_us != null ? 'Enter result…' : 'Enter result (after the game)…'] : null,
      ['nudge', U.icon('megaphone'), 'Nudge no-replies'], ['text', U.icon('message'), 'Text the team'], ['copy', U.icon('copy'), 'Copy no-reply names'],
      ['dup', U.icon('plus'), 'Duplicate (+7 days)'], ['del', U.icon('trash'), 'Delete…'],
    ].filter(Boolean);
    const { root, close } = U.sheet({ title: L.eventTitle(event), className: 'menu', html: `<div style="display:grid;gap:4px">${items.map(([k, ic, label]) => `<button class="btn btn-block ${k === 'del' ? 'btn-danger' : ''}" data-act="${k}">${ic} ${U.esc(label)}</button>`).join('')}</div>` });
    const go = (fn) => () => { close(); fn(); };
    wire(root, { edit: go(() => C.eventSheet({ slug, event })), cancel: go(() => C.cancelSheet({ slug, event })), tentative: go(() => C.tentativeSheet({ slug, event })), restore: go(() => C.restore({ slug, event })),
      reschedule: go(() => C.rescheduleSheet({ slug, event })), result: go(() => C.resultSheet({ slug, event })), nudge: go(() => C.nudge({ slug, event })), text: go(() => C.textTeam({ slug, event })),
      copy: go(() => C.copyNoReplies({ slug, event })), dup: go(() => C.duplicate({ slug, event })), del: go(() => C.deleteEvent({ slug, event })) });
  };

  globalThis.CoachSheets = C;
})();
