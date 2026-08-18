const L = globalThis.ScheduleLib, Api = globalThis.Api;
const slug = new URLSearchParams(location.search).get('team');
const app = document.getElementById('app');
let data, offline = false;
const kidKey = 'kid:' + slug;
const kid = () => Number(localStorage.getItem(kidKey)) || null;

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function readCacheDirect() {
  try { return JSON.parse(localStorage.getItem('cache:' + slug)); } catch { return null; }
}

async function boot() {
  try {
    Api.init();
    data = await Api.loadTeamData(slug);
  } catch {
    data = globalThis.Api ? Api.loadTeamDataCached(slug) : readCacheDirect();
    offline = true;
  }
  if (!data) { app.innerHTML = '<p class="warn">Can’t reach the schedule server. Try again later.</p>'; return; }
  render();
}

async function refresh() {
  try { data = await Api.loadTeamData(slug); offline = false; }
  catch { offline = true; }
  render();
}

function header() {
  return `<h1>${data.team.emoji ? escapeHtml(data.team.emoji) + ' ' : ''}${escapeHtml(data.team.name)}</h1>`;
}

function kidPicker() {
  const active = data.players.filter(p => p.active);
  const current = kid();
  const options = ['<option value="">— pick your player —</option>']
    .concat(active.map(p => `<option value="${p.id}"${p.id === current ? ' selected' : ''}>${escapeHtml(L.displayName(p))}</option>`));
  return `<div class="card"><label>Who's playing?
    <select id="kid-picker">${options.join('')}</select>
  </label></div>`;
}

function rsvpsFor(eventId) { return data.rsvps.filter(r => r.event_id === eventId); }
function votesFor(slotId) { return data.votes.filter(v => v.slot_id === slotId); }
function claimFor(eventId, role) { return data.claims.find(c => c.event_id === eventId && c.role === role); }

function eventCard(e, isNext) {
  const k = kid();
  const disabled = (!k || offline) ? 'disabled' : '';
  const hint = !k ? '<span class="muted">Pick your player to RSVP</span>' : (offline ? '<span class="muted">Offline — can’t save</span>' : '');
  const title = e.kind === 'game'
    ? `${escapeHtml(data.team.emoji || '🥎')} Game vs ${escapeHtml(e.opponent || 'TBD')}`
    : `${escapeHtml(data.team.emoji || '🥎')} Practice`;
  const cancelledBadge = e.cancelled ? ' <span class="badge-cancelled">CANCELLED</span>' : '';
  const myRsvp = k ? (rsvpsFor(e.id).find(r => r.player_id === k) || {}).status : null;
  const summary = L.summarizeRsvps(data.players, rsvpsFor(e.id), data.team.min_players);
  const shortByWarning = (summary.shortBy > 0 && !e.cancelled)
    ? `<span class="warn">⚠️ need ${summary.shortBy} more</span>` : '';

  const roles = (e.volunteer_roles || []).map(role => {
    const claim = claimFor(e.id, role);
    if (claim) {
      const player = data.players.find(p => p.id === claim.player_id);
      const name = player ? escapeHtml(L.displayName(player)) : 'someone';
      const mine = k && claim.player_id === k;
      return `<div>${escapeHtml(role)}: ${name}${mine ? ` <button class="btn" data-action="unclaim" data-event="${e.id}" data-role="${escapeHtml(role)}" ${disabled}>Unclaim</button>` : ''}</div>`;
    }
    return `<div>${escapeHtml(role)}: <button class="btn" data-action="claim" data-event="${e.id}" data-role="${escapeHtml(role)}" ${disabled}>Claim</button></div>`;
  }).join('');

  return `<div class="card${e.cancelled ? ' cancelled' : ''}">
    <h2>${title}${cancelledBadge}</h2>
    <div>${escapeHtml(L.fmtWhen(e.starts_at))}</div>
    ${e.location ? `<div>${escapeHtml(e.location)}</div>` : ''}
    ${e.notes ? `<div class="muted">${escapeHtml(e.notes)}</div>` : ''}
    <div>
      <button class="btn${myRsvp === 'going' ? ' active' : ''}" data-action="rsvp" data-event="${e.id}" data-status="going" ${disabled}>Going</button>
      <button class="btn${myRsvp === 'out' ? ' active' : ''}" data-action="rsvp" data-event="${e.id}" data-status="out" ${disabled}>Can't</button>
      ${hint}
    </div>
    <div class="muted">${summary.going.length} going · ${summary.out.length} out · ${summary.silent.length} no reply ${shortByWarning}</div>
    ${roles}
  </div>`;
}

function pollCard(p) {
  const k = kid();
  const disabled = (!k || offline) ? 'disabled' : '';
  const hint = !k ? '<span class="muted">Pick your player to vote</span>' : (offline ? '<span class="muted">Offline — can’t save</span>' : '');
  const slots = data.slots.filter(s => s.poll_id === p.id);
  const tallies = new Map(L.tallyPoll(slots, data.votes.filter(v => slots.some(s => s.id === v.slot_id))).map(t => [t.slot_id, t]));
  const rows = slots.map(s => {
    const myVote = k ? (votesFor(s.id).find(v => v.player_id === k) || {}).choice : null;
    const t = tallies.get(s.id) || { yes: 0, ifneeded: 0, no: 0 };
    return `<tr>
      <td>${escapeHtml(L.fmtWhen(s.starts_at))}</td>
      <td>
        <button class="btn${myVote === 'yes' ? ' active' : ''}" data-action="vote" data-slot="${s.id}" data-choice="yes" ${disabled}>✅</button>
        <button class="btn${myVote === 'ifneeded' ? ' active' : ''}" data-action="vote" data-slot="${s.id}" data-choice="ifneeded" ${disabled}>🤷</button>
        <button class="btn${myVote === 'no' ? ' active' : ''}" data-action="vote" data-slot="${s.id}" data-choice="no" ${disabled}>❌</button>
      </td>
      <td class="muted">${t.yes} / ${t.ifneeded} / ${t.no}</td>
    </tr>`;
  }).join('');
  return `<div class="card">
    <h2>${escapeHtml(p.title)}</h2>
    ${hint}
    <table>${rows}</table>
  </div>`;
}

function render() {
  document.title = data.team.name;
  const now = new Date();
  const { upcoming, past } = L.splitSchedule(data.events, now);
  const next = L.nextEvent(data.events, now);
  app.innerHTML = [
    header(), offline ? '<p class="banner">Showing cached schedule — voting disabled until you’re back online.</p>' : '',
    kidPicker(),
    data.team.announcement ? `<div class="banner">${escapeHtml(data.team.announcement)}</div>` : '',
    next ? eventCard(next, true) : '<p class="muted">No upcoming events.</p>',
    ...data.polls.filter(p => p.status === 'open').map(pollCard),
    '<h2>Schedule</h2>', ...upcoming.filter(e => e !== next).map(e => eventCard(e, false)),
    past.length ? `<details><summary class="muted">${past.length} past events</summary>${past.map(e => eventCard(e, false)).join('')}</details>` : '',
    `<p class="muted">📅 <a href="${escapeHtml(slug)}.ics">Subscribe in your calendar app</a></p>`,
  ].join('');
  wireHandlers();
}

function wireHandlers() {
  const picker = document.getElementById('kid-picker');
  if (picker) {
    picker.addEventListener('change', () => {
      if (picker.value) localStorage.setItem(kidKey, picker.value);
      else localStorage.removeItem(kidKey);
      render();
    });
  }

  app.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const k = kid();
      if (!k) return;
      const action = btn.dataset.action;
      try {
        if (action === 'rsvp') {
          await Api.upsertRsvp(Number(btn.dataset.event), k, btn.dataset.status);
        } else if (action === 'vote') {
          await Api.upsertVote(Number(btn.dataset.slot), k, btn.dataset.choice);
        } else if (action === 'claim') {
          await Api.claimRole(Number(btn.dataset.event), btn.dataset.role, k);
        } else if (action === 'unclaim') {
          await Api.unclaimRole(Number(btn.dataset.event), btn.dataset.role);
        }
        await refresh();
      } catch {
        alert('Couldn’t save — try again');
      }
    });
  });
}

boot();
