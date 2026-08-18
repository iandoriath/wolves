// Run: node schedule_lib.test.js
require('./schedule_lib.js');
const L = globalThis.ScheduleLib;
let fails = 0;
const eq = (a, b, msg) => { const ja = JSON.stringify(a), jb = JSON.stringify(b);
  if (ja !== jb) { fails++; console.error('FAIL', msg, ja, '!==', jb); } };

// displayName
eq(L.displayName({first_name:'Kate', last_initial:null}), 'Kate', 'name plain');
eq(L.displayName({first_name:'Kate', last_initial:'B'}), 'Kate B.', 'name initial');

// tallyPoll: best slot first (yes desc, then ifneeded desc)
const slots = [{id:1},{id:2}];
const votes = [
  {slot_id:1, player_id:10, choice:'yes'}, {slot_id:1, player_id:11, choice:'no'},
  {slot_id:2, player_id:10, choice:'yes'}, {slot_id:2, player_id:11, choice:'ifneeded'},
];
eq(L.tallyPoll(slots, votes),
   [{slot_id:2, yes:1, ifneeded:1, no:0}, {slot_id:1, yes:1, ifneeded:0, no:1}], 'tally');

// summarizeRsvps: silent = active players with no row; inactive excluded
const players = [{id:1, first_name:'A', active:true}, {id:2, first_name:'B', active:true},
                 {id:3, first_name:'C', active:false}];
const s = L.summarizeRsvps(players, [{player_id:1, status:'going'}], 3);
eq(s.going.map(p=>p.id), [1], 'going');
eq(s.out.length, 0, 'out');
eq(s.silent.map(p=>p.id), [2], 'silent');
eq(s.shortBy, 2, 'shortBy');

// nextEvent skips cancelled and past
const evs = [
  {id:1, starts_at:'2026-04-01T14:00:00Z', cancelled:false},
  {id:2, starts_at:'2026-04-10T14:00:00Z', cancelled:true},
  {id:3, starts_at:'2026-04-12T14:00:00Z', cancelled:false},
];
eq(L.nextEvent(evs, new Date('2026-04-05T00:00:00Z')).id, 3, 'nextEvent');
eq(L.nextEvent(evs, new Date('2026-05-01T00:00:00Z')), null, 'nextEvent none');

// splitSchedule
const sp = L.splitSchedule(evs, new Date('2026-04-05T00:00:00Z'));
eq(sp.past.map(e=>e.id), [1], 'past');
eq(sp.upcoming.map(e=>e.id), [2,3], 'upcoming keeps cancelled visible');

// buildIcs
const ics = L.buildIcs('Wolves', [
  {id:5, kind:'game', opponent:'Tigers', starts_at:'2026-04-25T13:00:00Z',
   location:'Field 3', notes:'wear white', cancelled:false},
  {id:6, kind:'practice', starts_at:'2026-04-27T22:00:00Z', location:'', notes:'', cancelled:true},
]);
if (!ics.includes('BEGIN:VCALENDAR')) { fails++; console.error('FAIL ics header'); }
if (!ics.includes('UID:evt-5@wolves.glorbnorb.com')) { fails++; console.error('FAIL ics uid'); }
if (!ics.includes('DTSTART:20260425T130000Z')) { fails++; console.error('FAIL ics dtstart'); }
if (!ics.includes('SUMMARY:Game vs Tigers')) { fails++; console.error('FAIL ics summary'); }
if (ics.includes('evt-6')) { fails++; console.error('FAIL ics cancelled included'); }

console.log(fails ? `${fails} FAILURES` : 'ALL PASS');
process.exit(fails ? 1 : 0);
