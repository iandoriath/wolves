// node make_ics.js — regenerates <slug>.ics for each team (run by .github/workflows/ics.yml)
require('./schedule_lib.js');
const L = globalThis.ScheduleLib;
const fs = require('fs');
const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
const ORIGIN = 'https://wolves.glorbnorb.com';
const get = async (path) => {
  const r = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};
(async () => {
  const now = new Date();
  const since = new Date(now.getTime() - 60 * 86400000).toISOString();
  const teams = await get('teams?select=*');
  for (const t of teams) {
    const events = await get(`events?team_id=eq.${t.id}&starts_at=gte.${encodeURIComponent(since)}&select=*`);
    fs.writeFileSync(`${t.slug}.ics`, L.buildIcs(t, events, ORIGIN, now));
    console.log(t.slug, events.length, 'events');
  }
})().catch((e) => { console.error(e); process.exit(1); });
