const L = globalThis.ScheduleLib, Api = globalThis.Api;
const app = document.getElementById('app');
let teams = {}; // slug -> team data bundle
let ui = {}; // slug -> { editingEvent: null | number | 'new-game' | 'new-practice', pollForm: bool }

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function isoToLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localInputToIso(val) {
  return val ? new Date(val).toISOString() : null;
}

async function boot() {
  Api.init();
  if (!(await Api.session())) { renderLogin(); return; }
  await loadAll(); render();
}
async function loadAll() {
  for (const slug of ['softball', 'soccer']) {
    teams[slug] = await Api.loadTeamData(slug);
    if (!ui[slug]) ui[slug] = { editingEvent: null, pollForm: false };
  }
}
function renderLogin() {
  app.innerHTML = `<div class="card"><h2>Coach login</h2>
    <input id="pw" type="password" placeholder="Passcode" style="font-size:16px;padding:8px">
    <button class="btn" id="go">Unlock</button><p id="err" class="warn"></p></div>`;
  document.getElementById('go').onclick = async () => {
    const { error } = await Api.signIn(SITE_CONFIG.COACH_EMAIL, document.getElementById('pw').value);
    if (error) document.getElementById('err').textContent = 'Wrong passcode';
    else { await loadAll(); render(); }
  };
}

async function refresh() { await loadAll(); render(); }

// ---------- rendering ----------

function render() {
  document.title = 'Coach Dashboard';
  app.innerHTML = `<h1>Coach Dashboard</h1>
    <div class="team-grid">${['softball', 'soccer'].map(teamSection).join('')}</div>`;
  wireHandlers();
}

function teamSection(slug) {
  const data = teams[slug];
  const now = new Date();
  const { upcoming, past } = L.splitSchedule(data.events, now);
  return `<section class="card" data-team="${escapeHtml(slug)}">
    <h2>${data.team.emoji ? escapeHtml(data.team.emoji) + ' ' : ''}${escapeHtml(data.team.name)}</h2>
    ${announcementBlock(slug, data)}
    ${eventsBlock(slug, data, upcoming, past)}
    ${attendanceBlock(slug, data, upcoming)}
    ${pollsBlock(slug, data)}
    ${rosterBlock(slug, data)}
  </section>`;
}

function announcementBlock(slug, data) {
  return `<div class="block">
    <h3>Announcement</h3>
    <textarea data-announcement="${escapeHtml(slug)}" rows="3" style="width:100%;font:inherit">${escapeHtml(data.team.announcement || '')}</textarea>
    <button class="btn" data-action="save-announcement" data-slug="${escapeHtml(slug)}">Save</button>
  </div>`;
}

function eventTitle(e) {
  return e.kind === 'game' ? `Game vs ${escapeHtml(e.opponent || 'TBD')}` : 'Practice';
}

function eventForm(slug, e, presetKind) {
  const isNew = !e;
  const kind = e ? e.kind : presetKind;
  const v = e || { opponent: '', starts_at: '', location: '', notes: '', volunteer_roles: [] };
  return `<form class="block" data-action="event-form" data-slug="${escapeHtml(slug)}" data-id="${isNew ? '' : e.id}">
    <div><label>Kind
      <select name="kind">
        <option value="game" ${kind === 'game' ? 'selected' : ''}>Game</option>
        <option value="practice" ${kind === 'practice' ? 'selected' : ''}>Practice</option>
      </select>
    </label></div>
    <div><label>Opponent <input name="opponent" value="${escapeHtml(v.opponent || '')}"></label></div>
    <div><label>When <input type="datetime-local" name="starts_at" value="${isoToLocalInput(v.starts_at)}" required></label></div>
    <div><label>Location <input name="location" value="${escapeHtml(v.location || '')}"></label></div>
    <div><label>Notes <input name="notes" value="${escapeHtml(v.notes || '')}"></label></div>
    <div><label>Volunteer roles <input name="volunteer_roles" placeholder="comma separated" value="${escapeHtml((v.volunteer_roles || []).join(', '))}"></label></div>
    <button type="submit" class="btn">Save</button>
    <button type="button" class="btn" data-action="cancel-event-edit" data-slug="${escapeHtml(slug)}">Cancel</button>
  </form>`;
}

function eventRow(slug, e) {
  if (ui[slug].editingEvent === e.id) return `<tr><td colspan="5">${eventForm(slug, e)}</td></tr>`;
  return `<tr class="${e.cancelled ? 'cancelled' : ''}">
    <td>${escapeHtml(L.fmtWhen(e.starts_at))}</td>
    <td>${escapeHtml(e.kind)}</td>
    <td>${eventTitle(e)}${e.cancelled ? ' <span class="badge-cancelled">CANCELLED</span>' : ''}</td>
    <td>${escapeHtml(e.location || '')}</td>
    <td>
      <button class="btn" data-action="edit-event" data-slug="${escapeHtml(slug)}" data-id="${e.id}">Edit</button>
      <button class="btn" data-action="toggle-cancel" data-slug="${escapeHtml(slug)}" data-id="${e.id}">${e.cancelled ? 'Restore' : 'Cancel'}</button>
    </td>
  </tr>`;
}

function eventsBlock(slug, data, upcoming, past) {
  const editing = ui[slug].editingEvent;
  const addControls = editing === 'new-game' || editing === 'new-practice'
    ? eventForm(slug, null, editing === 'new-game' ? 'game' : 'practice')
    : `<button class="btn" data-action="new-event" data-slug="${escapeHtml(slug)}" data-kind="game">＋ Add game</button>
       <button class="btn" data-action="new-event" data-slug="${escapeHtml(slug)}" data-kind="practice">＋ Add practice</button>`;
  const upcomingRows = upcoming.map((e) => eventRow(slug, e)).join('');
  const pastRows = past.map((e) => eventRow(slug, e)).join('');
  return `<div class="block">
    <h3>Events</h3>
    ${addControls}
    <table><tbody>${upcomingRows}</tbody></table>
    ${past.length ? `<details><summary class="muted">${past.length} past events</summary><table><tbody>${pastRows}</tbody></table></details>` : ''}
  </div>`;
}

function attendanceBlock(slug, data, upcoming) {
  const live = upcoming.filter((e) => !e.cancelled);
  if (!live.length) return '';
  const names = (list) => list.map((p) => escapeHtml(L.displayName(p))).join(', ') || '—';
  const items = live.map((e) => {
    const rsvps = data.rsvps.filter((r) => r.event_id === e.id);
    const s = L.summarizeRsvps(data.players, rsvps, data.team.min_players);
    return `<div class="block">
      <strong>${escapeHtml(L.fmtWhen(e.starts_at))} — ${eventTitle(e)}</strong>
      <div class="grid" style="grid-template-columns:1fr 1fr 1fr;margin-top:4px">
        <div><div class="muted">Going</div>${names(s.going)}</div>
        <div><div class="muted">Can't</div>${names(s.out)}</div>
        <div><div class="muted">No answer</div>${names(s.silent)}</div>
      </div>
    </div>`;
  }).join('');
  return `<div class="block"><h3>Attendance</h3>${items}</div>`;
}

function pollCard(slug, data, p) {
  const slots = data.slots.filter((s) => s.poll_id === p.id);
  const votes = data.votes.filter((v) => slots.some((s) => s.id === v.slot_id));
  const tallies = L.tallyPoll(slots, votes);
  const rows = tallies.map((t) => {
    const slot = slots.find((s) => s.id === t.slot_id);
    if (!slot) return '';
    return `<tr>
      <td>${escapeHtml(L.fmtWhen(slot.starts_at))}</td>
      <td class="muted">✅ ${t.yes} · 🤷 ${t.ifneeded} · ❌ ${t.no}</td>
      <td><button class="btn" data-action="convert-slot" data-slug="${escapeHtml(slug)}" data-poll="${p.id}" data-slot="${slot.id}">Make this the practice ✓</button></td>
    </tr>`;
  }).join('');
  return `<div class="block">
    <h4>${escapeHtml(p.title)}</h4>
    <table><tbody>${rows}</tbody></table>
    <button class="btn" data-action="dismiss-poll" data-slug="${escapeHtml(slug)}" data-poll="${p.id}">Dismiss</button>
  </div>`;
}

function pollFormHtml(slug) {
  return `<form class="block" data-action="poll-form" data-slug="${escapeHtml(slug)}">
    <div><input name="title" placeholder="Poll title" required style="width:100%"></div>
    <div data-slots>
      <div><input type="datetime-local" required></div>
      <div><input type="datetime-local" required></div>
    </div>
    <button type="button" class="btn" data-action="add-poll-slot" data-slug="${escapeHtml(slug)}">＋ slot</button>
    <button type="button" class="btn" data-action="remove-poll-slot" data-slug="${escapeHtml(slug)}">－ slot</button>
    <button type="submit" class="btn">Save poll</button>
    <button type="button" class="btn" data-action="cancel-poll-form" data-slug="${escapeHtml(slug)}">Cancel</button>
  </form>`;
}

function pollsBlock(slug, data) {
  const open = data.polls.filter((p) => p.status === 'open');
  const cards = open.map((p) => pollCard(slug, data, p)).join('');
  const formOrButton = ui[slug].pollForm
    ? pollFormHtml(slug)
    : `<button class="btn" data-action="new-poll" data-slug="${escapeHtml(slug)}">＋ New poll</button>`;
  return `<div class="block"><h3>Polls</h3>${cards}${formOrButton}</div>`;
}

function rosterBlock(slug, data) {
  const rows = data.players.map((p) => `<tr data-id="${p.id}">
    <td><input value="${escapeHtml(p.first_name || '')}" data-field="first_name" style="width:110px"></td>
    <td><input value="${escapeHtml(p.last_initial || '')}" data-field="last_initial" style="width:44px" maxlength="1"></td>
    <td><input type="checkbox" data-field="active" ${p.active ? 'checked' : ''}></td>
    <td><button class="btn" data-action="save-player" data-slug="${escapeHtml(slug)}">Save</button></td>
  </tr>`).join('');
  return `<div class="block">
    <h3>Roster</h3>
    <table>
      <thead><tr><th>First</th><th>Init</th><th>Active</th><th></th></tr></thead>
      <tbody>
        ${rows}
        <tr data-id="">
          <td><input data-field="first_name" placeholder="First" style="width:110px"></td>
          <td><input data-field="last_initial" placeholder="I" maxlength="1" style="width:44px"></td>
          <td><input type="checkbox" data-field="active" checked></td>
          <td><button class="btn" data-action="save-player" data-slug="${escapeHtml(slug)}">＋ Add player</button></td>
        </tr>
      </tbody>
    </table>
  </div>`;
}

// ---------- event wiring ----------

function wireHandlers() {
  app.querySelectorAll('form[data-action="event-form"]').forEach((form) => {
    form.addEventListener('submit', onEventFormSubmit);
  });
  app.querySelectorAll('form[data-action="poll-form"]').forEach((form) => {
    form.addEventListener('submit', onPollFormSubmit);
  });
  app.querySelectorAll('[data-action]').forEach((el) => {
    if (el.tagName === 'FORM') return;
    el.addEventListener('click', onClick);
  });
}

async function onEventFormSubmit(ev) {
  ev.preventDefault();
  const form = ev.target;
  const slug = form.dataset.slug;
  const idAttr = form.dataset.id;
  const fd = new FormData(form);
  const id = idAttr ? Number(idAttr) : undefined;
  const existing = id ? teams[slug].events.find((e) => e.id === id) : null;
  const row = {
    team_id: teams[slug].team.id,
    kind: fd.get('kind'),
    opponent: fd.get('opponent') || null,
    starts_at: localInputToIso(fd.get('starts_at')),
    location: fd.get('location') || '',
    notes: fd.get('notes') || '',
    cancelled: existing ? existing.cancelled : false,
    volunteer_roles: String(fd.get('volunteer_roles') || '').split(',').map((s) => s.trim()).filter(Boolean),
  };
  if (id) row.id = id;
  try {
    await Api.saveEvent(row);
    ui[slug].editingEvent = null;
    await loadAll(); render();
  } catch (e) { alert('Save failed: ' + e.message); }
}

async function onPollFormSubmit(ev) {
  ev.preventDefault();
  const form = ev.target;
  const slug = form.dataset.slug;
  const title = new FormData(form).get('title');
  const slotInputs = form.querySelectorAll('[data-slots] input[type="datetime-local"]');
  const slotRows = Array.from(slotInputs).map((inp) => ({ starts_at: localInputToIso(inp.value) })).filter((s) => s.starts_at);
  if (slotRows.length < 2) { alert('Add at least 2 time slots'); return; }
  try {
    await Api.savePoll({ team_id: teams[slug].team.id, title, status: 'open' }, slotRows);
    ui[slug].pollForm = false;
    await loadAll(); render();
  } catch (e) { alert('Save failed: ' + e.message); }
}

async function onClick(ev) {
  const btn = ev.currentTarget;
  const action = btn.dataset.action;
  const slug = btn.dataset.slug;

  if (action === 'new-event') { ui[slug].editingEvent = 'new-' + btn.dataset.kind; render(); return; }
  if (action === 'edit-event') { ui[slug].editingEvent = Number(btn.dataset.id); render(); return; }
  if (action === 'cancel-event-edit') { ui[slug].editingEvent = null; render(); return; }
  if (action === 'new-poll') { ui[slug].pollForm = true; render(); return; }
  if (action === 'cancel-poll-form') { ui[slug].pollForm = false; render(); return; }

  if (action === 'add-poll-slot') {
    const slots = btn.closest('form').querySelector('[data-slots]');
    if (slots.children.length >= 6) return;
    const div = document.createElement('div');
    div.innerHTML = '<input type="datetime-local" required>';
    slots.appendChild(div);
    return;
  }
  if (action === 'remove-poll-slot') {
    const slots = btn.closest('form').querySelector('[data-slots]');
    if (slots.children.length <= 2) return;
    slots.lastElementChild.remove();
    return;
  }

  if (action === 'save-announcement') {
    const ta = app.querySelector(`textarea[data-announcement="${slug}"]`);
    try {
      await Api.saveTeam({ id: teams[slug].team.id, announcement: ta.value });
      await refresh();
    } catch (e) { alert('Save failed: ' + e.message); }
    return;
  }

  if (action === 'toggle-cancel') {
    const id = Number(btn.dataset.id);
    const e = teams[slug].events.find((x) => x.id === id);
    try {
      await Api.saveEvent({ id, team_id: teams[slug].team.id, cancelled: !e.cancelled });
      await refresh();
    } catch (err) { alert('Save failed: ' + err.message); }
    return;
  }

  if (action === 'convert-slot') {
    const loc = prompt('Location for the practice?');
    if (loc === null) return;
    try {
      await Api.convertSlotToPractice(Number(btn.dataset.poll), Number(btn.dataset.slot), loc);
      await refresh();
    } catch (e) { alert('Save failed: ' + e.message); }
    return;
  }

  if (action === 'dismiss-poll') {
    try {
      await Api.closePoll(Number(btn.dataset.poll));
      await refresh();
    } catch (e) { alert('Save failed: ' + e.message); }
    return;
  }

  if (action === 'save-player') {
    const tr = btn.closest('tr');
    const idAttr = tr.dataset.id;
    const first_name = tr.querySelector('[data-field="first_name"]').value.trim();
    const last_initial = tr.querySelector('[data-field="last_initial"]').value.trim();
    const active = tr.querySelector('[data-field="active"]').checked;
    if (!first_name) { alert('First name is required'); return; }
    const row = { team_id: teams[slug].team.id, first_name, last_initial, active };
    if (idAttr) row.id = Number(idAttr);
    try {
      await Api.savePlayer(row);
      await refresh();
    } catch (e) { alert('Save failed: ' + e.message); }
    return;
  }
}

boot();
