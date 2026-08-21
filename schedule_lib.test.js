// Run: node schedule_lib.test.js
require('./schedule_lib.js');
const L = globalThis.ScheduleLib;
let fails = 0, count = 0;
const eq = (a, b, msg) => { count++; const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) { fails++; console.error('FAIL', msg, '\n  got     ', ja, '\n  expected', jb); } };
const ok = (c, msg) => { count++; if (!c) { fails++; console.error('FAIL', msg); } };
const TZ = 'America/New_York';
const team = { id: 1, slug: 'softball', name: 'SAA 10U Wolves', emoji: '🥎', tz: TZ, min_players: 8,
  game_duration_min: 90, practice_duration_min: 60, arrive_early_min: 30, default_location: 'Memorial Park' };

// --- names & titles
eq(L.displayName({ first_name: 'Kate', last_initial: null }), 'Kate', 'name plain');
eq(L.displayName({ first_name: 'Kate', last_initial: 'B' }), 'Kate B.', 'name initial');
eq(L.eventTitle({ kind: 'game', opponent: 'Tigers', home: true }), 'vs Tigers', 'home game title');
eq(L.eventTitle({ kind: 'game', opponent: 'Tigers', home: null }), 'vs Tigers', 'unknown home title');
eq(L.eventTitle({ kind: 'game', opponent: 'Tigers', home: false }), '@ Tigers', 'away game title');
eq(L.eventTitle({ kind: 'game', opponent: null }), 'vs TBD', 'no opponent');
eq(L.eventTitle({ kind: 'practice' }), 'Practice', 'practice title');
eq(L.eventTitle({ kind: 'other', title: 'Picture day' }), 'Picture day', 'other title');
eq(L.eventTitle({ kind: 'other', title: '' }), 'Event', 'other fallback');

// --- durations / ends / arrive-by
const g = { id: 1, kind: 'game', starts_at: '2026-05-02T14:00:00+00:00', status: 'scheduled' }; // 10:00 EDT
eq(L.durationMin(g, team), 90, 'game default duration');
eq(L.durationMin({ kind: 'practice' }, team), 60, 'practice default duration');
eq(L.durationMin({ kind: 'other' }, team), 60, 'other default duration');
eq(L.durationMin({ kind: 'game', duration_min: 120 }, team), 120, 'override duration');
eq(L.eventEnd(g, team), '2026-05-02T15:30:00.000Z', 'event end');
eq(L.arriveBy(g, team), '2026-05-02T13:30:00.000Z', 'arrive by');
eq(L.arriveBy({ kind: 'practice', starts_at: g.starts_at }, team), null, 'no arrive-by for practice');
eq(L.arriveBy({ ...g, time_tbd: true }, team), null, 'no arrive-by when TBD');
ok(L.isPast(g, team, new Date('2026-05-02T15:31:00Z')), 'past after end');
ok(!L.isPast(g, team, new Date('2026-05-02T15:00:00Z')), 'not past while in progress');
ok(L.isNow(g, team, new Date('2026-05-02T15:00:00Z')), 'isNow during');
ok(!L.isNow(g, team, new Date('2026-05-02T13:00:00Z')), 'not now before');

// --- nextEvent / splitSchedule
const evs = [
  { id: 1, kind: 'game', starts_at: '2026-04-01T14:00:00Z', status: 'scheduled' },
  { id: 2, kind: 'game', starts_at: '2026-04-10T14:00:00Z', status: 'cancelled' },
  { id: 3, kind: 'game', starts_at: '2026-04-12T14:00:00Z', status: 'scheduled' },
];
eq(L.nextEvent(evs, team, new Date('2026-04-05T00:00:00Z')).id, 3, 'next skips cancelled');
eq(L.nextEvent(evs, team, new Date('2026-04-12T15:00:00Z')).id, 3, 'next stays on in-progress');
eq(L.nextEvent(evs, team, new Date('2026-05-01T00:00:00Z')), null, 'next none');
const sp = L.splitSchedule(evs, team, new Date('2026-04-05T00:00:00Z'));
eq(sp.past.map(e => e.id), [1], 'past');
eq(sp.upcoming.map(e => e.id), [2, 3], 'upcoming keeps cancelled, sorted');
eq(L.splitSchedule(evs, team, new Date('2026-05-01T00:00:00Z')).past.map(e => e.id), [3, 2, 1], 'past newest first');

// --- summarizeRsvps with maybe
const players = [{ id: 1, first_name: 'A', active: true }, { id: 2, first_name: 'B', active: true },
  { id: 3, first_name: 'C', active: false }, { id: 4, first_name: 'D', active: true }];
const s = L.summarizeRsvps(players, [{ player_id: 1, status: 'going' }, { player_id: 4, status: 'maybe' }, { player_id: 3, status: 'going' }], 3);
eq(s.going.map(p => p.id), [1], 'going (inactive excluded)');
eq(s.maybe.map(p => p.id), [4], 'maybe');
eq(s.out.length, 0, 'out');
eq(s.silent.map(p => p.id), [2], 'silent');
eq(s.shortBy, 2, 'shortBy counts going only');

// --- time zone helpers
eq(L.utcToZoned('2026-05-02T14:00:00Z', TZ), { y: 2026, m: 5, d: 2, hh: 10, mm: 0, weekday: 6 }, 'utcToZoned EDT');
eq(L.utcToZoned('2026-01-10T14:00:00Z', TZ), { y: 2026, m: 1, d: 10, hh: 9, mm: 0, weekday: 6 }, 'utcToZoned EST');
eq(L.zonedToUtc({ y: 2026, m: 5, d: 2, hh: 10, mm: 0 }, TZ), '2026-05-02T14:00:00.000Z', 'zonedToUtc EDT');
eq(L.zonedToUtc({ y: 2026, m: 1, d: 10, hh: 9, mm: 0 }, TZ), '2026-01-10T14:00:00.000Z', 'zonedToUtc EST');
eq(L.zonedToUtc({ y: 2026, m: 11, d: 1, hh: 9, mm: 0 }, TZ), '2026-11-01T14:00:00.000Z', 'zonedToUtc on DST-end day (EST)');
eq(L.dateKey('2026-05-03T02:30:00Z', TZ), '2026-05-02', 'dateKey crosses midnight in tz');
eq(L.toLocalInput('2026-05-02T14:00:00Z', TZ), '2026-05-02T10:00', 'toLocalInput');
eq(L.fromLocalInput('2026-05-02T10:00', TZ), '2026-05-02T14:00:00.000Z', 'fromLocalInput');
eq(L.fromLocalInput('', TZ), null, 'fromLocalInput empty');

// --- formatting (en-US, team tz)
eq(L.fmtTime('2026-05-02T14:00:00Z', TZ), '10:00 AM', 'fmtTime');
eq(L.fmtDay('2026-05-02T14:00:00Z', TZ), 'Sat, May 2', 'fmtDay');
eq(L.fmtWhen('2026-05-02T14:00:00Z', TZ), 'Sat, May 2 · 10:00 AM', 'fmtWhen');
eq(L.fmtWhen('2026-05-02T14:00:00Z', TZ, { time_tbd: true }), 'Sat, May 2 · Time TBD', 'fmtWhen TBD');
const now = new Date('2026-05-01T12:00:00Z'); // Fri May 1, 8:00 EDT
eq(L.relativeDay('2026-05-01T22:00:00Z', TZ, now), 'Today', 'relativeDay today');
eq(L.relativeDay('2026-05-02T14:00:00Z', TZ, now), 'Tomorrow', 'relativeDay tomorrow');
eq(L.relativeDay('2026-05-05T14:00:00Z', TZ, now), 'Tuesday', 'relativeDay within week');
eq(L.relativeDay('2026-05-09T14:00:00Z', TZ, now), 'Sat, May 9', 'relativeDay beyond week');
eq(L.relativeDay('2027-05-09T14:00:00Z', TZ, now), 'Sun, May 9, 2027', 'relativeDay other year');
eq(L.relativeTime('2026-05-01T11:59:40Z', now, TZ), 'just now', 'relativeTime just now');
eq(L.relativeTime('2026-05-01T11:45:00Z', now, TZ), '15 min ago', 'relativeTime minutes');
eq(L.relativeTime('2026-05-01T09:00:00Z', now, TZ), '3 h ago', 'relativeTime hours');
eq(L.relativeTime('2026-04-29T12:00:00Z', now, TZ), '2 d ago', 'relativeTime days');
eq(L.relativeTime('2026-04-10T12:00:00Z', now, TZ), 'Apr 10', 'relativeTime older');

// --- groupByWeek (weeks start Sunday, team tz). now = Fri May 1 2026
const wk = L.groupByWeek([
  { id: 1, starts_at: '2026-04-28T22:00:00Z' },   // Tue Apr 28 (this week: Apr 26–May 2)
  { id: 2, starts_at: '2026-05-02T14:00:00Z' },   // Sat May 2
  { id: 3, starts_at: '2026-05-05T22:00:00Z' },   // Tue May 5 (next week)
  { id: 4, starts_at: '2026-05-16T14:00:00Z' },   // Sat May 16
  { id: 5, starts_at: '2026-04-20T14:00:00Z' },   // earlier
], TZ, now);
eq(wk.map(w => [w.key, w.label, w.events.map(e => e.id)]), [
  ['2026-04-19', 'Earlier', [5]], ['2026-04-26', 'This week', [1, 2]],
  ['2026-05-03', 'Next week', [3]], ['2026-05-10', 'Week of May 10', [4]]], 'groupByWeek');

// --- monthGrid
const mg = L.monthGrid(2026, 5, [{ id: 1, starts_at: '2026-05-02T14:00:00Z' }, { id: 2, starts_at: '2026-05-03T02:30:00Z' }], TZ, now);
eq(mg.label, 'May 2026', 'month label');
eq(mg.weeks.length, 6, 'six rows');
eq(mg.weeks[0].map(c => c.d), [26, 27, 28, 29, 30, 1, 2], 'first row starts Sunday Apr 26');
eq(mg.weeks[0][5].inMonth, true, 'May 1 in month');
eq(mg.weeks[0][0].inMonth, false, 'Apr 26 not in month');
eq(mg.weeks[0][5].isToday, true, 'today flagged');
eq(mg.weeks[0][6].events.map(e => e.id), [1, 2], 'both events land on May 2 in tz, sorted');

// --- needsAnswer
const bundleA = { team: { id: 1, slug: 'softball', tz: TZ, game_duration_min: 90, practice_duration_min: 60 },
  players: [{ id: 10, first_name: 'Kate', active: true }, { id: 11, first_name: 'Sam', active: true }, { id: 12, first_name: 'Zed', active: false }],
  events: [{ id: 1, kind: 'game', starts_at: '2026-05-02T14:00:00Z', status: 'scheduled' },
           { id: 2, kind: 'game', starts_at: '2026-05-09T14:00:00Z', status: 'cancelled' },
           { id: 3, kind: 'practice', starts_at: '2026-04-20T14:00:00Z', status: 'scheduled' }],
  rsvps: [{ event_id: 1, player_id: 10, status: 'going' }],
  polls: [{ id: 7, status: 'open' }, { id: 8, status: 'closed' }],
  slots: [{ id: 70, poll_id: 7 }, { id: 71, poll_id: 7 }, { id: 80, poll_id: 8 }],
  votes: [{ slot_id: 70, player_id: 10, choice: 'yes' }], claims: [], posts: [] };
const na = L.needsAnswer([bundleA], [10, 11, 12, 99], now);
eq(na.map(i => [i.kind, i.event?.id ?? i.poll.id, i.player.id]), [['rsvp', 1, 11], ['poll', 7, 11]], 'needsAnswer: unanswered upcoming, not cancelled/past/inactive; open poll only');
eq(L.needsAnswer([bundleA], [], now), [], 'needsAnswer empty household');

// --- overlaps
const soccerTeam = { id: 2, slug: 'soccer', tz: TZ, game_duration_min: 60, practice_duration_min: 60 };
const ov = L.findOverlaps([
  { event: { id: 1, kind: 'game', starts_at: '2026-05-02T14:00:00Z', status: 'scheduled' }, team },
  { event: { id: 2, kind: 'game', starts_at: '2026-05-02T15:00:00Z', status: 'scheduled' }, team: soccerTeam },
  { event: { id: 3, kind: 'game', starts_at: '2026-05-02T16:00:00Z', status: 'scheduled' }, team: soccerTeam },
  { event: { id: 4, kind: 'game', starts_at: '2026-05-02T14:30:00Z', status: 'cancelled' }, team: soccerTeam },
]);
eq([...ov.keys()], [1, 2], 'overlap pairs (1↔2); 3 starts when 2 ends; cancelled ignored');
eq(ov.get(1).map(x => x.event.id), [2], 'overlap partner');

// --- changedSince
const cs = L.changedSince({ team, events: [
  { id: 1, kind: 'game', starts_at: '2026-05-02T14:00:00Z', status: 'scheduled', created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-30T00:00:00Z' },
  { id: 2, kind: 'game', starts_at: '2026-05-09T14:00:00Z', status: 'scheduled', created_at: '2026-04-30T12:00:00Z', updated_at: '2026-04-30T12:00:00Z' },
  { id: 3, kind: 'game', starts_at: '2026-05-16T14:00:00Z', status: 'scheduled', created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-01T00:00:00Z' },
  { id: 4, kind: 'game', starts_at: '2026-04-02T14:00:00Z', status: 'cancelled', created_at: '2026-04-01T00:00:00Z', updated_at: '2026-04-30T00:00:00Z' }],
  posts: [{ id: 1, created_at: '2026-04-30T01:00:00Z' }, { id: 2, created_at: '2026-04-01T00:00:00Z' }] }, '2026-04-29T00:00:00Z', now);
eq(cs.events.map(x => [x.event.id, x.isNew]), [[1, false], [2, true]], 'changedSince events (upcoming only)');
eq(cs.posts.map(p => p.id), [1], 'changedSince posts');
eq(L.changedSince({ team, events: [], posts: [] }, null, now), { events: [], posts: [] }, 'changedSince no stamp');

// --- volunteerConflicts
eq(L.volunteerConflicts({ id: 1 }, [{ event_id: 1, role: 'Snacks', player_id: 5 }, { event_id: 1, role: 'Scorebook', player_id: 6 }],
  [{ event_id: 1, player_id: 5, status: 'out' }, { event_id: 1, player_id: 6, status: 'going' }]).map(c => c.role), ['Snacks'], 'volunteer conflict');

// --- results
eq(L.resultLabel({ kind: 'game', score_us: 7, score_them: 5 }), 'W 7–5', 'win');
eq(L.resultLabel({ kind: 'game', score_us: 3, score_them: 8 }), 'L 3–8', 'loss');
eq(L.resultLabel({ kind: 'game', score_us: 4, score_them: 4 }), 'T 4–4', 'tie');
eq(L.resultLabel({ kind: 'game', score_us: 4, score_them: null }), null, 'no result');
eq(L.resultLabel({ kind: 'practice', score_us: 4, score_them: 1 }), null, 'practice has no result');
eq(L.record([{ kind: 'game', score_us: 7, score_them: 5 }, { kind: 'game', score_us: 1, score_them: 2 }, { kind: 'game', score_us: 2, score_them: 2 }, { kind: 'game' }]), { w: 1, l: 1, t: 1 }, 'record');

// --- pending coalescing
const q0 = [];
const q1 = L.coalescePending(q0, { kind: 'rsvp', event_id: 1, player_id: 10, status: 'going' });
const q2 = L.coalescePending(q1, { kind: 'vote', slot_id: 70, player_id: 10, choice: 'yes' });
const q3 = L.coalescePending(q2, { kind: 'rsvp', event_id: 1, player_id: 10, status: 'out' });
eq(q3.map(o => [o.kind, o.status || o.choice]), [['vote', 'yes'], ['rsvp', 'out']], 'coalesce keeps latest op per key, preserves order of others');
eq(L.opKey({ kind: 'claim', event_id: 1, role: 'Snacks' }), 'claim:1:Snacks', 'claim key');
eq(L.opKey({ kind: 'unclaim', event_id: 1, role: 'Snacks' }), 'claim:1:Snacks', 'unclaim shares claim key');

console.log(fails ? `${fails}/${count} FAILURES` : `ALL PASS (${count})`);
process.exit(fails ? 1 : 0);
