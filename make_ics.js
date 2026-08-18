// node make_ics.js — regenerates <slug>.ics for each team
require('./schedule_lib.js');
const L = globalThis.ScheduleLib;
const fs = require('fs');
const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY;
const get = async (path) => {
  const r = await fetch(`${base}/rest/v1/${path}`, { headers: { apikey: key } });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};
(async () => {
  const teams = await get('teams?select=*');
  for (const t of teams) {
    const events = await get(`events?team_id=eq.${t.id}&select=*`);
    fs.writeFileSync(`${t.slug}.ics`, L.buildIcs(t.name, events));
    console.log(t.slug, events.length, 'events');
  }
})();
