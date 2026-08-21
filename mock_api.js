// Mock data layer — same surface as api.js, in-memory. Selected by ?mock=1 (parent) or ?mock=coach.
const L = globalThis.ScheduleLib;
const TZ = 'America/New_York';
const z = (y, m, d, hh, mm = 0) => L.zonedToUtc({ y, m, d, hh, mm }, TZ);
const today = new Date();
const Y = today.getFullYear(), M = today.getMonth() + 1, D = today.getDate();
const rel = (days, hh, mm = 0) => { const dt = new Date(Date.UTC(Y, M - 1, D + days)); return z(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate(), hh, mm); };
const nowIso = new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString();

const teams = [
  { id: 1, slug: 'softball', name: 'SAA 10U Wolves', emoji: '🥎', color: '#2d6a4f', tz: TZ, min_players: 8, default_location: 'Memorial Park, Field 3',
    game_duration_min: 90, practice_duration_min: 60, arrive_early_min: 30, default_volunteer_roles: ['Snacks', 'Scorebook'] },
  { id: 2, slug: 'soccer', name: 'Thunder U9', emoji: '⚽', color: '#1d4ed8', tz: TZ, min_players: 7, default_location: 'Riverside Fields',
    game_duration_min: 60, practice_duration_min: 60, arrive_early_min: 15, default_volunteer_roles: ['Snacks'] },
];
const names = ['Avery', 'Brooke', 'Charlie', 'Dana', 'Emery', 'Frankie', 'Grace', 'Harper', 'Indigo', 'Jordan', 'Kai', 'Lena', 'Morgan', 'Nora', 'Olive', 'Piper', 'Quinn'];
const players = names.map((n, i) => ({ id: i + 1, team_id: 1, first_name: n, last_initial: i % 5 === 0 ? 'B' : null, active: i !== 16 }));
players.push({ id: 21, team_id: 2, first_name: 'Avery', last_initial: null, active: true },   // Avery plays both teams
  ...['Ben', 'Cleo', 'Dev', 'Ella', 'Finn', 'Gus', 'Hana', 'Ivy'].map((n, i) => ({ id: 22 + i, team_id: 2, first_name: n, last_initial: null, active: true })));
const contacts = [{ player_id: 1, parent_name: 'Sam Avery', phone: '555-0101', email: 'sam@example.com', notes: '' },
  { player_id: 2, parent_name: 'Pat Brooke', phone: '555-0102', email: '', notes: 'Allergic to peanuts' }];

let nextId = 100;
const mk = (o) => ({ id: nextId++, title: '', opponent: null, time_tbd: false, duration_min: null, location: '', home: null, notes: '',
  status: 'scheduled', status_note: '', rescheduled_from: null, volunteer_roles: [], score_us: null, score_them: null,
  created_at: daysAgo(30), updated_at: daysAgo(30), ...o });
const events = [
  mk({ team_id: 1, kind: 'game', opponent: 'Tigers', home: true, starts_at: rel(-14, 10), location: 'Memorial Park, Field 3', score_us: 7, score_them: 5, volunteer_roles: ['Snacks', 'Scorebook'] }),
  mk({ team_id: 1, kind: 'game', opponent: 'Bears', home: false, starts_at: rel(-7, 12), location: 'Lincoln Park', score_us: 3, score_them: 8, volunteer_roles: ['Snacks'] }),
  mk({ team_id: 1, kind: 'practice', starts_at: rel(-2, 17, 30), location: 'Memorial Park, Field 3' }),
  mk({ team_id: 1, kind: 'game', opponent: 'Lions', home: true, starts_at: rel(1, 10), location: 'Memorial Park, Field 3', volunteer_roles: ['Snacks', 'Scorebook'], notes: 'Wear white jerseys. Team photo after the game!', updated_at: daysAgo(0.2), status: 'tentative', status_note: 'Field check at 8 — decision by 8:30' }),
  mk({ team_id: 1, kind: 'practice', starts_at: rel(3, 17, 30), location: 'Memorial Park, Field 3' }),
  mk({ team_id: 1, kind: 'game', opponent: 'Hawks', home: false, starts_at: rel(5, 14), location: 'Riverside Fields, Field B', volunteer_roles: ['Snacks'], rescheduled_from: rel(4, 10), updated_at: daysAgo(0.5), notes: 'Moved because of the school fair.' }),
  mk({ team_id: 1, kind: 'practice', starts_at: rel(10, 17, 30), location: 'Memorial Park, Field 3', status: 'cancelled', status_note: 'Coach traveling', updated_at: daysAgo(0.1) }),
  mk({ team_id: 1, kind: 'other', title: 'Picture day', starts_at: rel(12, 9), time_tbd: true, location: 'Pavilion', notes: 'Order forms due the day before.' }),
  mk({ team_id: 1, kind: 'game', opponent: 'Eagles', home: true, starts_at: rel(15, 10), location: 'Memorial Park, Field 3', volunteer_roles: ['Snacks', 'Scorebook'] }),
  mk({ team_id: 1, kind: 'game', opponent: 'Sharks', home: true, starts_at: rel(22, 10), location: 'Memorial Park, Field 3', volunteer_roles: ['Snacks', 'Scorebook'] }),
  mk({ team_id: 1, kind: 'game', opponent: 'Playoffs R1', home: null, starts_at: rel(29, 12), time_tbd: true, location: 'TBD' }),
  mk({ team_id: 2, kind: 'practice', starts_at: rel(2, 17, 30), location: 'Riverside Fields' }),
  mk({ team_id: 2, kind: 'game', opponent: 'Comets', home: true, starts_at: rel(1, 11), location: 'Riverside Fields, Field A', volunteer_roles: ['Snacks'] }),   // overlaps the softball game day
  mk({ team_id: 2, kind: 'game', opponent: 'Rockets', home: false, starts_at: rel(8, 9), location: 'Hillside Park' }),
];
const rsvps = [];
const rsvpSeed = { 1: ['going', 'going', 'out', 'going', 'maybe', 'going', null, 'going', 'out', 'going', null, null, 'going', 'going', null, 'going'] };
events.filter(e => e.team_id === 1 && e.status !== 'cancelled').forEach((e, ei) => {
  players.filter(p => p.team_id === 1 && p.active).forEach((p, pi) => {
    const st = rsvpSeed[1][(pi + ei) % rsvpSeed[1].length];
    if (st && !(ei >= 3 && pi === 0)) rsvps.push({ event_id: e.id, player_id: p.id, status: st, note: pi === 4 ? 'Leaving early for a recital' : '', updated_at: daysAgo(1 + pi) });
  });
});
const claims = [{ event_id: events[3].id, role: 'Snacks', player_id: 2 }, { event_id: events[0].id, role: 'Snacks', player_id: 3 }, { event_id: events[0].id, role: 'Scorebook', player_id: 4 }];
const polls = [{ id: 1, team_id: 1, title: 'Extra practice next week?', status: 'open' }];
const slots = [{ id: 1, poll_id: 1, starts_at: rel(6, 17, 30) }, { id: 2, poll_id: 1, starts_at: rel(7, 17, 30) }, { id: 3, poll_id: 1, starts_at: rel(8, 18) }];
const votes = [{ slot_id: 1, player_id: 2, choice: 'yes' }, { slot_id: 2, player_id: 2, choice: 'ifneeded' }, { slot_id: 1, player_id: 3, choice: 'no' }, { slot_id: 3, player_id: 3, choice: 'yes' }];
const posts = [{ id: 1, team_id: 1, body: 'Welcome to the season! Games are Saturdays; practices Tuesdays 5:30. Bring water and a glove.', pinned: true, created_at: daysAgo(20) },
  { id: 2, team_id: 1, body: 'Picture day order forms are in the dugout folder — due the day before picture day.', pinned: false, created_at: daysAgo(0.3) },
  { id: 3, team_id: 2, body: 'Shin guards are required at every practice.', pinned: true, created_at: daysAgo(10) }];
const secrets = [{ team_id: 1, code: 'WOLF26' }, { team_id: 2, code: 'THUN26' }];

const delay = (v) => new Promise(r => setTimeout(() => r(v), 120));
const clone = (v) => JSON.parse(JSON.stringify(v));
const isCoach = () => globalThis.MOCK_MODE === 'coach';
const bundle = (t) => ({ team: clone(t),
  players: clone(players.filter(p => p.team_id === t.id)).sort((a, b) => a.first_name.localeCompare(b.first_name)),
  contacts: isCoach() ? clone(contacts.filter(c => players.some(p => p.id === c.player_id && p.team_id === t.id))) : [],
  events: clone(events.filter(e => e.team_id === t.id)),
  rsvps: clone(rsvps.filter(r => events.some(e => e.id === r.event_id && e.team_id === t.id))),
  claims: clone(claims.filter(c => events.some(e => e.id === c.event_id && e.team_id === t.id))),
  polls: clone(polls.filter(p => p.team_id === t.id)),
  slots: clone(slots.filter(s => polls.some(p => p.id === s.poll_id && p.team_id === t.id))),
  votes: clone(votes.filter(v => slots.some(s => s.id === v.slot_id && polls.some(p => p.id === s.poll_id && p.team_id === t.id)))),
  posts: clone(posts.filter(p => p.team_id === t.id)).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  fetchedAt: new Date().toISOString() });
const upsertBy = (arr, keyFn, row) => { const i = arr.findIndex(x => keyFn(x) === keyFn(row)); if (i >= 0) arr[i] = { ...arr[i], ...row }; else arr.push(row); return clone(row); };
const removeBy = (arr, pred) => { for (let i = arr.length - 1; i >= 0; i--) if (pred(arr[i])) arr.splice(i, 1); };

globalThis.Api = {
  init() {},
  listTeams: () => delay(clone(teams.map(({ id, slug, name, emoji, color }) => ({ id, slug, name, emoji, color })))),
  loadTeam: (slug) => { const t = teams.find(x => x.slug === slug); if (!t) return Promise.reject(new Error('no team ' + slug)); return delay(bundle(t)); },
  upsertRsvp: ({ event_id, player_id, status, note = '' }) => delay(upsertBy(rsvps, r => `${r.event_id}:${r.player_id}`, { event_id, player_id, status, note, updated_at: nowIso })),
  deleteRsvp: (event_id, player_id) => delay(removeBy(rsvps, r => r.event_id === event_id && r.player_id === player_id)),
  upsertVote: (slot_id, player_id, choice) => delay(upsertBy(votes, v => `${v.slot_id}:${v.player_id}`, { slot_id, player_id, choice })),
  deleteVote: (slot_id, player_id) => delay(removeBy(votes, v => v.slot_id === slot_id && v.player_id === player_id)),
  claimRole: (event_id, role, player_id) => delay(upsertBy(claims, c => `${c.event_id}:${c.role}`, { event_id, role, player_id })),
  unclaimRole: (event_id, role) => delay(removeBy(claims, c => c.event_id === event_id && c.role === role)),
  signIn: (email, password) => { globalThis.MOCK_MODE = password === 'coach' ? 'coach' : globalThis.MOCK_MODE; return delay(password === 'coach' ? { data: {}, error: null } : { data: {}, error: { message: 'bad' } }); },
  signOut: () => { globalThis.MOCK_MODE = '1'; return delay(); },
  session: () => delay(isCoach() ? { user: { email: 'coach@example.com' } } : null),
  saveEvent: (row) => { if (row.id) { const e = events.find(x => x.id === row.id); Object.assign(e, row, { updated_at: nowIso }); return delay(clone(e)); } const e = mk({ ...row, created_at: nowIso, updated_at: nowIso }); events.push(e); return delay(clone(e)); },
  insertEvents: (rows) => delay(rows.map(r => { const e = mk({ ...r, created_at: nowIso, updated_at: nowIso }); events.push(e); return clone(e); })),
  deleteEvent: (id) => delay(removeBy(events, e => e.id === id)),
  clearEventRsvps: (event_id) => delay(removeBy(rsvps, r => r.event_id === event_id)),
  savePlayer: (row) => { if (row.id) { const p = players.find(x => x.id === row.id); Object.assign(p, row); return delay(clone(p)); } const p = { id: nextId++, last_initial: null, active: true, ...row }; players.push(p); return delay(clone(p)); },
  saveContact: (row) => delay([upsertBy(contacts, c => c.player_id, { parent_name: '', phone: '', email: '', notes: '', ...row })]),
  saveTeam: (row) => { const t = teams.find(x => x.id === row.id); Object.assign(t, row); return delay(clone(t)); },
  savePost: (row) => { if (row.id) { const p = posts.find(x => x.id === row.id); Object.assign(p, row); return delay(clone(p)); } const p = { id: nextId++, pinned: false, created_at: nowIso, ...row }; posts.push(p); return delay(clone(p)); },
  deletePost: (id) => delay(removeBy(posts, p => p.id === id)),
  savePoll: (poll, slotStarts) => { const p = poll.id ? Object.assign(polls.find(x => x.id === poll.id), poll) : (polls.push({ id: nextId++, status: 'open', ...poll }), polls[polls.length - 1]); slotStarts.forEach(starts_at => slots.push({ id: nextId++, poll_id: p.id, starts_at })); return delay(clone(p)); },
  closePoll: (id) => { const p = polls.find(x => x.id === id); p.status = 'closed'; return delay(clone(p)); },
  teamSecrets: () => delay(clone(secrets)),
  setTeamCode: (team_id, code) => { const s = secrets.find(x => x.team_id === team_id); s.code = code; return delay([clone(s)]); },
};
