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

  // ---------- grouping ----------
  const sundayKey = (iso, tz) => {            // key of the Sunday starting the week containing iso (in tz)
    const z = L.utcToZoned(iso, tz);
    return new Date(Date.UTC(z.y, z.m - 1, z.d - z.weekday)).toISOString().slice(0, 10);
  };
  const keyLabel = (key) => new Date(key + 'T00:00:00Z').toLocaleString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  L.groupByWeek = (events, tz, now) => {
    const thisWeek = sundayKey(now.toISOString(), tz);
    const nextWeek = new Date(keyMs(thisWeek) + 7 * 86400000).toISOString().slice(0, 10);
    const groups = new Map();
    for (const e of [...events].sort(byStart)) {
      const k = sundayKey(e.starts_at, tz);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(e);
    }
    return [...groups.keys()].sort().map(k => ({ key: k, events: groups.get(k),
      label: k === thisWeek ? 'This week' : k === nextWeek ? 'Next week' : k < thisWeek ? 'Earlier' : `Week of ${keyLabel(k)}` }));
  };
  L.monthGrid = (year, month, events, tz, now) => {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const todayKey = L.dateKey(now.toISOString(), tz);
    const byKey = new Map();
    for (const e of events) { const k = L.dateKey(e.starts_at, tz); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(e); }
    const weeks = [];
    let day = 1 - first.getUTCDay();
    for (let w = 0; w < 6; w++) {
      const row = [];
      for (let i = 0; i < 7; i++, day++) {
        const dt = new Date(Date.UTC(year, month - 1, day));
        const key = dt.toISOString().slice(0, 10);
        row.push({ key, d: dt.getUTCDate(), inMonth: dt.getUTCMonth() === month - 1, isToday: key === todayKey,
          events: (byKey.get(key) || []).sort(byStart) });
      }
      weeks.push(row);
    }
    return { label: first.toLocaleString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' }), weeks };
  };

  // ---------- needs answer ----------
  L.needsAnswer = (bundles, household, now) => {
    const rsvpItems = [], pollItems = [];
    for (const b of bundles) {
      const kids = b.players.filter(p => p.active && household.includes(p.id));
      if (!kids.length) continue;
      const { upcoming } = L.splitSchedule(b.events, b.team, now);
      for (const e of upcoming) {
        if (e.status === 'cancelled') continue;
        for (const p of kids) if (!b.rsvps.some(r => r.event_id === e.id && r.player_id === p.id))
          rsvpItems.push({ kind: 'rsvp', team: b.team, event: e, player: p });
      }
      for (const poll of b.polls.filter(p => p.status === 'open')) {
        const slotIds = b.slots.filter(s => s.poll_id === poll.id).map(s => s.id);
        for (const p of kids) if (!b.votes.some(v => slotIds.includes(v.slot_id) && v.player_id === p.id))
          pollItems.push({ kind: 'poll', team: b.team, poll, player: p });
      }
    }
    rsvpItems.sort((a, b) => byStart(a.event, b.event));
    return [...rsvpItems, ...pollItems];
  };

  // ---------- overlaps ----------
  L.overlaps = (a, teamA, b, teamB) => a.id !== b.id
    && T(a.starts_at) < T(L.eventEnd(b, teamB)) && T(b.starts_at) < T(L.eventEnd(a, teamA));
  L.findOverlaps = (items) => {
    const m = new Map();
    const live = items.filter(x => x.event.status !== 'cancelled');
    for (const x of live) for (const y of live) {
      if (L.overlaps(x.event, x.team, y.event, y.team)) { if (!m.has(x.event.id)) m.set(x.event.id, []); m.get(x.event.id).push(y); }
    }
    return m;
  };

  // ---------- changes since last visit ----------
  L.changedSince = (b, lastSeenIso, now) => {
    if (!lastSeenIso) return { events: [], posts: [] };
    const since = T(lastSeenIso);
    const { upcoming } = L.splitSchedule(b.events, b.team, now);
    return {
      events: upcoming.filter(e => T(e.updated_at) > since).map(e => ({ event: e, isNew: T(e.created_at) > since })),
      posts: (b.posts || []).filter(p => T(p.created_at) > since),
    };
  };
  L.volunteerConflicts = (event, claims, rsvps) => claims.filter(c => c.event_id === event.id
    && rsvps.some(r => r.event_id === event.id && r.player_id === c.player_id && r.status === 'out'));

  // ---------- results ----------
  L.resultLabel = (e) => {
    if (e.kind !== 'game' || e.score_us == null || e.score_them == null) return null;
    const r = e.score_us > e.score_them ? 'W' : e.score_us < e.score_them ? 'L' : 'T';
    return `${r} ${e.score_us}–${e.score_them}`;
  };
  L.record = (events) => events.reduce((acc, e) => { const l = L.resultLabel(e); if (l) acc[l[0].toLowerCase()]++; return acc; }, { w: 0, l: 0, t: 0 });

  // ---------- pending write queue ----------
  L.opKey = (op) => op.kind === 'rsvp' ? `rsvp:${op.event_id}:${op.player_id}`
    : op.kind === 'vote' ? `vote:${op.slot_id}:${op.player_id}`
    : `claim:${op.event_id}:${op.role}`;           // claim + unclaim share a key
  L.coalescePending = (queue, op) => [...queue.filter(o => L.opKey(o) !== L.opKey(op)), op];

  // ---------- weekly repeat ----------
  L.addDaysLocal = (iso, tz, days) => {
    const z = L.utcToZoned(iso, tz);
    const dt = new Date(Date.UTC(z.y, z.m - 1, z.d + days));
    return L.zonedToUtc({ y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate(), hh: z.hh, mm: z.mm }, tz);
  };
  L.expandWeekly = (firstIso, tz, { count, until, everyWeeks = 1 } = {}) => {
    const out = [];
    const max = Math.min(count || 60, 60);
    let cur = firstIso;
    while (out.length < max) {
      if (until && T(cur) > T(until)) break;
      out.push(new Date(cur).toISOString());
      cur = L.addDaysLocal(cur, tz, 7 * everyWeeks);
    }
    return out;
  };

  // ---------- links ----------
  L.eventLink = (origin, slug, id) => `${origin}/?team=${encodeURIComponent(slug)}&event=${id}`;
  L.teamLink = (origin, slug, code) => `${origin}/?team=${encodeURIComponent(slug)}&c=${encodeURIComponent(code)}`;
  L.coParentLink = (origin, kids, pairs) => `${origin}/?kids=${kids.join(',')}`
    + (pairs.length ? `&c=${pairs.map(p => `${encodeURIComponent(p.slug)}:${encodeURIComponent(p.code)}`).join(',')}` : '');
  L.parseCodeParam = (str) => {
    const s = String(str || '').trim();
    if (!s) return { single: null, pairs: [] };
    if (!s.includes(':')) return { single: s.toUpperCase(), pairs: [] };
    return { single: null, pairs: s.split(',').map(x => x.split(':')).filter(x => x.length === 2 && x[0] && x[1])
      .map(([slug, code]) => ({ slug: slug.trim(), code: code.trim().toUpperCase() })) };
  };
  L.mapsUrl = (location, isIOS) => isIOS
    ? `https://maps.apple.com/?q=${encodeURIComponent(location)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location)}`;
  const icsStamp = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  L.icsStamp = icsStamp;
  L.googleCalUrl = (e, team) => {
    const q = new URLSearchParams({ action: 'TEMPLATE', text: `${team.emoji} ${team.name} ${L.eventTitle(e)}`.trim(),
      dates: `${icsStamp(e.starts_at)}/${icsStamp(L.eventEnd(e, team))}`, location: e.location || '', details: e.notes || '' });
    return `https://calendar.google.com/calendar/render?${q.toString().replace(/\+/g, '%20')}`;
  };

  // ---------- composers (plain text for share sheet / sms) ----------
  L.eventLine = (team, e) => {
    const tz = team.tz;
    const when = `${L.fmtDay(e.starts_at, tz)} ${e.time_tbd ? '(time TBD)' : 'at ' + L.fmtTime(e.starts_at, tz)}`;
    return `${team.emoji} ${team.name} — ${L.eventTitle(e)}, ${when}${e.location ? ' @ ' + e.location : ''}`;
  };
  L.composeNudge = ({ team, event, silentNames = [], openRoles = [], link }) => {
    const ab = L.arriveBy(event, team);
    return [L.eventLine(team, event),
      ab ? `Arrive by ${L.fmtTime(ab, team.tz)}.` : null,
      silentNames.length ? `Still need an RSVP from: ${silentNames.join(', ')}.` : null,
      openRoles.length ? `Volunteer spots open: ${openRoles.join(', ')}.` : null,
      `RSVP here: ${link}`].filter(Boolean).join('\n');
  };
  L.composeCancel = ({ team, event, note, link }) => `CANCELLED: ${L.eventLine(team, event)}${note ? '\n' + note : ''}\n${link}`;
  L.composeTentative = ({ team, event, note, link }) =>
    `Heads up — ${L.eventLine(team, event)} is weather-pending.${note ? ' ' + note : ''}\nCheck here for updates: ${link}`;
  L.composeReschedule = ({ team, event, oldStart, link }) => {
    const tz = team.tz;
    return `MOVED: ${L.eventTitle(event)} was ${L.fmtDay(oldStart, tz)} ${L.fmtTime(oldStart, tz)} → now ${L.fmtDay(event.starts_at, tz)} ${L.fmtTime(event.starts_at, tz)}${event.location ? ' @ ' + event.location : ''}.\nPlease RSVP again: ${link}`;
  };
  L.composeAnnouncement = ({ team, body, link }) => `${team.emoji} ${team.name}: ${body}\n${link}`;
  L.composeEventShare = ({ team, event, link }) => `${L.eventLine(team, event)}${event.notes ? '\n' + event.notes : ''}\n${link}`;

  // ---------- roster paste ----------
  L.parseRosterPaste = (text) => String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(line => {
    const [first, ...rest] = line.split(/\s+/);
    const initial = rest.length ? rest[0].replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase() : '';
    return { first_name: first.replace(/[.,]+$/, ''), last_initial: initial || null };
  });

  globalThis.ScheduleLib = L;
})();
