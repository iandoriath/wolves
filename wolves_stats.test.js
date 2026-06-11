// Node test runner for wolves_stats.js. Run: node wolves_stats.test.js
const path = require('path');
require('./wolves_stats.js'); // attaches WolvesStats to globalThis
const WS = globalThis.WolvesStats;
const data = require('./wolves2026.json');

let pass = 0, fail = 0;
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; }
  else { fail++; console.error('FAIL: ' + msg + '\n  expected ' + e + '\n  actual   ' + a); }
}
function approx(actual, expected, msg) {
  if (Math.abs(actual - expected) < 0.0005) { pass++; }
  else { fail++; console.error('FAIL: ' + msg + '\n  expected ' + expected + '\n  actual   ' + actual); }
}

// --- Task 2: roster + season line ---
eq(WS.roster(data).length, 15, 'roster has 15 players');
eq(WS.roster(data)[0], 'Jocelyn', 'roster preserves first-game order (Jocelyn first)');
eq(WS.roster(data)[8], 'Zoe', 'roster order: Zoe is 9th');
const zoe = WS.seasonLine(data, 'Zoe');
// Note: "Playoffs Round 1 vs. Roofers" (2026-06-06) is fully scratched pending its
// scorecard, so it counts for no one — hence Zoe G=8 (not 9) and Elizabeth G=10 (not 11).
eq(zoe.g, 8, 'Zoe G=8 (non-scratched games)');
eq(zoe.line, {ab:15,h:8,_2b:3,_3b:0,hr:1,r:7,rbi:16,bb:5,k:3,hbp:1}, 'Zoe season line');
const eliz = WS.seasonLine(data, 'Elizabeth');
eq(eliz.g, 10, 'Elizabeth G=10');
eq(eliz.line.h, 12, 'Elizabeth H=12');

// --- Task 3: compute + fmt ---
const zc = WS.compute(WS.seasonLine(data, 'Zoe').line);
approx(zc.avg, 0.533, 'Zoe AVG .533');
approx(zc.obp, 0.667, 'Zoe OBP .667');
approx(zc.slg, 0.933, 'Zoe SLG .933');
approx(zc.ops, 1.600, 'Zoe OPS 1.600');
approx(WS.compute(WS.seasonLine(data, 'Claire').line).avg, 0.688, 'Claire AVG .688');
eq(zc.tb, 14, 'Zoe TB=14 (4 singles + 3 doubles*2 + 1 HR*4)');
eq(WS.compute({ab:0,h:0,_2b:0,_3b:0,hr:0,bb:0,hbp:0}).avg, 0, 'empty line AVG=0 (no divide-by-zero)');
eq(WS.fmt(0.533), '.533', 'fmt strips leading zero');
eq(WS.fmt(1.6), '1.600', 'fmt keeps leading digit when >= 1');
eq(WS.fmt(Infinity), '—', 'fmt non-finite shows em dash');

// --- Task 4: ordered games, game log, team line ---
const og = WS.orderedGames(data);
eq(og.length, 12, 'orderedGames returns all 12 games');
eq(og.every((g, i) => i === 0 || og[i-1].date <= g.date), true, 'orderedGames sorted by date asc');
eq(typeof og[0].id === 'string' && typeof og[0].label === 'string', true, 'ordered game has id+label');
const log = WS.gameLog(data, 'Zoe');
eq(log.length, 12, 'Zoe game log has one row per game (incl. scratched)');
eq(log.filter(r => !r.scratched).length, 8, 'Zoe played 8 of 12');
const champ = log.find(r => r.label.indexOf('Championship') >= 0);
eq(champ.line.h, 1, 'Zoe championship H=1');
eq(champ.scratched, false, 'Zoe played the championship');
approx(champ.derived.avg, 1.0, 'Zoe championship game AVG 1.000 (1-for-1)');
const team = WS.teamLine(data);
eq(team.hr >= 1, true, 'team HR includes Zoe + others');
approx(WS.compute(team).avg > 0, true, 'team AVG positive');

// --- Task 5: trend series ---
const cum = WS.trendSeries(data, 'Zoe', 'avg', 'cumulative');
eq(cum.length, 8, 'cumulative trend has one point per played game');
approx(cum[cum.length - 1].value, 0.533, 'final cumulative AVG equals season AVG');
eq(typeof cum[0].label, 'string', 'trend point carries a label');
eq(cum.every((p, i) => i === 0 || cum[i-1].date <= p.date), true, 'trend points in date order');
const per = WS.trendSeries(data, 'Zoe', 'ops', 'pergame');
eq(per.length, 8, 'pergame trend has one point per played game');
eq(per.every(p => typeof p.value === 'number'), true, 'pergame values are numbers');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
