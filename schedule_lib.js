(function () {
  const L = {};
  const T = (iso) => new Date(iso).getTime();
  L.T = T;
  const addMin = (iso, m) => new Date(T(iso) + m * 60000).toISOString();
  const byStart = (a, b) => T(a.starts_at) - T(b.starts_at) || (a.id || 0) - (b.id || 0);
  L.byStart = byStart;

  // ---------- names & titles ----------
  L.displayName = (p) => p.last_initial ? `${p.first_name} ${p.last_initial}.` : p.first_name;
  L.eventTitle = (e) => {
    if (e.kind === 'game') return `${e.home === false ? '@' : 'vs'} ${e.opponent || 'TBD'}`;
    if (e.kind === 'practice') return 'Practice';
    return e.title || 'Event';
  };

  // ---------- durations ----------
  L.durationMin = (e, team) => {
    if (e.duration_min != null) return e.duration_min;
    if (e.kind === 'game') return team?.game_duration_min ?? 90;
    if (e.kind === 'practice') return team?.practice_duration_min ?? 60;
    return 60;
  };
  L.eventEnd = (e, team) => addMin(e.starts_at, L.durationMin(e, team));
  L.arriveBy = (e, team) => (e.kind === 'game' && !e.time_tbd && (team?.arrive_early_min ?? 0) > 0)
    ? addMin(e.starts_at, -team.arrive_early_min) : null;
  L.isPast = (e, team, now) => T(L.eventEnd(e, team)) <= now.getTime();
  L.isNow = (e, team, now) => T(e.starts_at) <= now.getTime() && !L.isPast(e, team, now);
  L.nextEvent = (events, team, now) =>
    events.filter(e => e.status !== 'cancelled' && !L.isPast(e, team, now)).sort(byStart)[0] || null;
  L.splitSchedule = (events, team, now) => {
    const sorted = [...events].sort(byStart);
    return { upcoming: sorted.filter(e => !L.isPast(e, team, now)),
             past: sorted.filter(e => L.isPast(e, team, now)).reverse() };
  };

  // ---------- rsvps ----------
  L.summarizeRsvps = (players, rsvps, minPlayers) => {
    const active = players.filter(p => p.active);
    const by = new Map(rsvps.map(r => [r.player_id, r.status]));
    const pick = (st) => active.filter(p => by.get(p.id) === st);
    const going = pick('going');
    return { going, maybe: pick('maybe'), out: pick('out'),
      silent: active.filter(p => !by.has(p.id)),
      shortBy: Math.max(0, (minPlayers || 0) - going.length) };
  };

  // ---------- time zones ----------
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dtfCache = new Map();
  const dtf = (tz) => {
    if (!dtfCache.has(tz)) dtfCache.set(tz, new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short' }));
    return dtfCache.get(tz);
  };
  L.utcToZoned = (iso, tz) => {
    const p = Object.fromEntries(dtf(tz).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
    return { y: +p.year, m: +p.month, d: +p.day, hh: (+p.hour) % 24, mm: +p.minute, weekday: WD.indexOf(p.weekday) };
  };
  const offsetAt = (utcMs, tz) => {          // ms to add to UTC to get wall-clock-as-UTC
    const z = L.utcToZoned(new Date(utcMs).toISOString(), tz);
    return Date.UTC(z.y, z.m - 1, z.d, z.hh, z.mm) - Math.floor(utcMs / 60000) * 60000;
  };
  L.zonedToUtc = ({ y, m, d, hh = 0, mm = 0 }, tz) => {
    const wall = Date.UTC(y, m - 1, d, hh, mm);
    let guess = wall - offsetAt(wall, tz);
    guess = wall - offsetAt(guess, tz);
    return new Date(guess).toISOString();
  };
  const pad = (n) => String(n).padStart(2, '0');
  L.dateKey = (iso, tz) => { const z = L.utcToZoned(iso, tz); return `${z.y}-${pad(z.m)}-${pad(z.d)}`; };
  L.toLocalInput = (iso, tz) => { if (!iso) return ''; const z = L.utcToZoned(iso, tz); return `${z.y}-${pad(z.m)}-${pad(z.d)}T${pad(z.hh)}:${pad(z.mm)}`; };
  L.fromLocalInput = (str, tz) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(str || '');
    if (!m) return null;
    return L.zonedToUtc({ y: +m[1], m: +m[2], d: +m[3], hh: +(m[4] || 0), mm: +(m[5] || 0) }, tz);
  };

  // ---------- formatting ----------
  const fmt = (iso, tz, opts) => new Date(iso).toLocaleString('en-US', { timeZone: tz, ...opts });
  L.fmtTime = (iso, tz) => fmt(iso, tz, { hour: 'numeric', minute: '2-digit' });
  L.fmtDay = (iso, tz) => fmt(iso, tz, { weekday: 'short', month: 'short', day: 'numeric' });
  L.fmtDayYear = (iso, tz) => fmt(iso, tz, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  L.fmtMonthDay = (iso, tz) => fmt(iso, tz, { month: 'short', day: 'numeric' });
  L.fmtWhen = (iso, tz, e) => `${L.fmtDay(iso, tz)} · ${e?.time_tbd ? 'Time TBD' : L.fmtTime(iso, tz)}`;
  const keyMs = (k) => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  L.dayDiff = (iso, tz, now) => Math.round((keyMs(L.dateKey(iso, tz)) - keyMs(L.dateKey(now.toISOString(), tz))) / 86400000);
  L.relativeDay = (iso, tz, now) => {
    const diff = L.dayDiff(iso, tz, now);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff > 1 && diff <= 6) return fmt(iso, tz, { weekday: 'long' });
    return L.utcToZoned(iso, tz).y === L.utcToZoned(now.toISOString(), tz).y ? L.fmtDay(iso, tz) : L.fmtDayYear(iso, tz);
  };
  L.relativeTime = (iso, now, tz) => {
    const s = Math.round((now.getTime() - T(iso)) / 1000);
    if (s < 60) return 'just now';
    const m = Math.round(s / 60); if (m < 60) return `${m} min ago`;
    const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
    const d = Math.round(h / 24); if (d < 7) return `${d} d ago`;
    return L.fmtMonthDay(iso, tz);
  };

  globalThis.ScheduleLib = L;
})();
