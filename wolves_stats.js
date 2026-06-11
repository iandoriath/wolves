// wolves_stats.js
// Pure computation for the Wolves 2026 public viewer. No DOM. v2 grid export only.
// Mirrors stats_entry.html derived-stat formulas exactly.
(function (global) {
  'use strict';
  const WS = { VERSION: '1.0' };

  const FIELDS = ['ab', 'h', '_2b', '_3b', 'hr', 'r', 'rbi', 'bb', 'k', 'hbp'];
  WS.FIELDS = FIELDS.slice();

  WS.emptyLine = function () {
    const o = {};
    FIELDS.forEach(f => o[f] = 0);
    return o;
  };

  // Roster = union of player-name keys across games, in first-game key order.
  WS.roster = function (data) {
    const seen = [];
    const set = new Set();
    Object.keys(data.games).forEach(id => {
      Object.keys(data.games[id].stats).forEach(name => {
        if (!set.has(name)) { set.add(name); seen.push(name); }
      });
    });
    return seen;
  };

  // Season line for one player: field-wise sum across non-scratched games.
  WS.seasonLine = function (data, name) {
    const line = WS.emptyLine();
    let g = 0;
    Object.keys(data.games).forEach(id => {
      const s = data.games[id].stats[name];
      if (!s || s.scratched) return;
      g++;
      FIELDS.forEach(f => line[f] += s[f] || 0);
    });
    return { line, g };
  };

  global.WolvesStats = WS;
})(typeof window !== 'undefined' ? window : globalThis);
