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

  // Derived stats from a counting line. Mirrors stats_entry.html compute().
  WS.compute = function (s) {
    const ab = s.ab || 0, h = s.h || 0, _2b = s._2b || 0, _3b = s._3b || 0, hr = s.hr || 0;
    const bb = s.bb || 0, hbp = s.hbp || 0;
    const _1b = h - _2b - _3b - hr;
    const tb = _1b + 2 * _2b + 3 * _3b + 4 * hr;
    const pa = ab + bb + hbp;
    const avg = ab > 0 ? h / ab : 0;
    const obp = pa > 0 ? (h + bb + hbp) / pa : 0;
    const slg = ab > 0 ? tb / ab : 0;
    const ops = obp + slg;
    const iso = slg - avg;
    return { _1b, tb, pa, avg, obp, slg, ops, iso };
  };

  // Number formatting mirrors stats_entry.html fmt(): 3 decimals, strip leading zero in (-1,1).
  WS.fmt = function (x) {
    if (!isFinite(x)) return '—';
    const s = x.toFixed(3);
    return x >= 1 || x <= -1 ? s : s.replace(/^(-?)0/, '$1');
  };

  // All games as an array, sorted by date ascending (stable; empty dates sort first
  // and keep insertion order). Each: { id, label, date, stats }.
  WS.orderedGames = function (data) {
    const arr = Object.keys(data.games).map((id, i) => {
      const g = data.games[id];
      return { id, label: g.label || '', date: g.date || '', stats: g.stats, _i: i };
    });
    arr.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a._i - b._i));
    return arr.map(({ _i, ...rest }) => rest);
  };

  // Per-player game log: one row per game in date order (including scratched games).
  WS.gameLog = function (data, name) {
    return WS.orderedGames(data).map(g => {
      const s = g.stats[name];
      const scratched = !s || !!s.scratched;
      const line = WS.emptyLine();
      if (s) FIELDS.forEach(f => line[f] = s[f] || 0);
      return { id: g.id, label: g.label, date: g.date, scratched, line, derived: WS.compute(line) };
    });
  };

  // Team line: field-wise sum across every non-scratched player-game.
  WS.teamLine = function (data) {
    const line = WS.emptyLine();
    Object.keys(data.games).forEach(id => {
      const stats = data.games[id].stats;
      Object.keys(stats).forEach(name => {
        const s = stats[name];
        if (!s || s.scratched) return;
        FIELDS.forEach(f => line[f] += s[f] || 0);
      });
    });
    return line;
  };

  // Trend series over a player's non-scratched games in date order.
  // metric: 'avg'|'obp'|'slg'|'ops'. mode: 'cumulative'|'pergame'. Returns [{label,date,value}].
  WS.trendSeries = function (data, name, metric, mode) {
    const played = WS.gameLog(data, name).filter(r => !r.scratched);
    const acc = WS.emptyLine();
    return played.map(r => {
      let derived;
      if (mode === 'cumulative') {
        FIELDS.forEach(f => acc[f] += r.line[f]);
        derived = WS.compute(acc);
      } else {
        derived = r.derived;
      }
      return { label: r.label, date: r.date, value: derived[metric] };
    });
  };

  global.WolvesStats = WS;
})(typeof window !== 'undefined' ? window : globalThis);
