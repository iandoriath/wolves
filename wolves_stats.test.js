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
eq(zoe.g, 9, 'Zoe G=9 (non-scratched games)');
eq(zoe.line, {ab:15,h:8,_2b:3,_3b:0,hr:1,r:7,rbi:16,bb:5,k:3,hbp:1}, 'Zoe season line');
const eliz = WS.seasonLine(data, 'Elizabeth');
eq(eliz.g, 11, 'Elizabeth G=11');
eq(eliz.line.h, 12, 'Elizabeth H=12');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
