(function () {
  const displayName = (p) => p.last_initial ? `${p.first_name} ${p.last_initial}.` : p.first_name;

  function tallyPoll(slots, votes) {
    const t = slots.map(s => {
      const v = votes.filter(x => x.slot_id === s.id);
      return { slot_id: s.id,
        yes: v.filter(x => x.choice === 'yes').length,
        ifneeded: v.filter(x => x.choice === 'ifneeded').length,
        no: v.filter(x => x.choice === 'no').length };
    });
    return t.sort((a, b) => b.yes - a.yes || b.ifneeded - a.ifneeded);
  }

  function summarizeRsvps(players, rsvps, minPlayers) {
    const active = players.filter(p => p.active);
    const by = new Map(rsvps.map(r => [r.player_id, r.status]));
    const going = active.filter(p => by.get(p.id) === 'going');
    const out = active.filter(p => by.get(p.id) === 'out');
    const silent = active.filter(p => !by.has(p.id));
    return { going, out, silent, shortBy: Math.max(0, minPlayers - going.length) };
  }

  const live = (evs) => evs.filter(e => !e.cancelled);
  const byStart = (a, b) => a.starts_at.localeCompare(b.starts_at);

  function nextEvent(events, now) {
    const iso = now.toISOString();
    return live(events).filter(e => e.starts_at >= iso).sort(byStart)[0] || null;
  }

  function splitSchedule(events, now) {
    const iso = now.toISOString();
    const sorted = [...events].sort(byStart);
    return { upcoming: sorted.filter(e => e.starts_at >= iso),
             past: sorted.filter(e => e.starts_at < iso) };
  }

  const icsStamp = (s) => s.replace(/[-:]/g, '').replace(/\.\d+/, '').replace(/Z?$/, 'Z');
  const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/,/g, '\\,')
    .replace(/;/g, '\\;').replace(/\n/g, '\\n');

  function buildIcs(teamName, events) {
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0',
      `PRODID:-//wolves.glorbnorb.com//${esc(teamName)}//EN`,
      `X-WR-CALNAME:${esc(teamName)}`];
    for (const e of live(events)) {
      const summary = e.kind === 'game' ? `Game vs ${e.opponent || 'TBD'}` : 'Practice';
      const start = new Date(e.starts_at);
      const end = new Date(start.getTime() + 90 * 60000); // default 90 min
      lines.push('BEGIN:VEVENT',
        `UID:evt-${e.id}@wolves.glorbnorb.com`,
        `DTSTAMP:${icsStamp(e.starts_at)}`,
        `DTSTART:${icsStamp(e.starts_at)}`,
        `DTEND:${icsStamp(end.toISOString())}`,
        `SUMMARY:${esc(summary)}`,
        `LOCATION:${esc(e.location)}`,
        `DESCRIPTION:${esc(e.notes)}`,
        'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
  }

  function fmtWhen(iso) {
    const d = new Date(iso);
    const day = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
    const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    return `${day} · ${time}`;
  }

  globalThis.ScheduleLib = { displayName, tallyPoll, summarizeRsvps, nextEvent, splitSchedule, buildIcs, fmtWhen };
})();
