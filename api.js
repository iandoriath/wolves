import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let sb;
function init() {
  sb = createClient(SITE_CONFIG.SUPABASE_URL, SITE_CONFIG.SUPABASE_ANON_KEY);
}

const one = async (q) => { const { data, error } = await q; if (error) throw error; return data; };

async function loadTeamData(slug) {
  const team = (await one(sb.from('teams').select('*').eq('slug', slug)))[0];
  if (!team) throw new Error(`no team ${slug}`);
  const [players, events, polls] = await Promise.all([
    one(sb.from('players').select('*').eq('team_id', team.id).order('first_name')),
    one(sb.from('events').select('*').eq('team_id', team.id).order('starts_at')),
    one(sb.from('polls').select('*').eq('team_id', team.id)),
  ]);
  const pollIds = polls.map(p => p.id);
  const eventIds = events.map(e => e.id);
  const slots = pollIds.length ? await one(sb.from('poll_slots').select('*').in('poll_id', pollIds).order('starts_at')) : [];
  const slotIds = slots.map(s => s.id);
  const [votes, rsvps, claims] = await Promise.all([
    slotIds.length ? one(sb.from('poll_votes').select('*').in('slot_id', slotIds)) : [],
    eventIds.length ? one(sb.from('rsvps').select('*').in('event_id', eventIds)) : [],
    eventIds.length ? one(sb.from('volunteer_claims').select('*').in('event_id', eventIds)) : [],
  ]);
  const data = { team, players, events, polls, slots, votes, rsvps, claims };
  try { localStorage.setItem('cache:' + slug, JSON.stringify(data)); } catch {}
  return data;
}

const loadTeamDataCached = (slug) => {
  try { return JSON.parse(localStorage.getItem('cache:' + slug)); } catch { return null; }
};

const upsertRsvp = (event_id, player_id, status) =>
  one(sb.from('rsvps').upsert({ event_id, player_id, status, updated_at: new Date().toISOString() }));
const upsertVote = (slot_id, player_id, choice) =>
  one(sb.from('poll_votes').upsert({ slot_id, player_id, choice }));
const claimRole = (event_id, role, player_id) =>
  one(sb.from('volunteer_claims').upsert({ event_id, role, player_id }));
const unclaimRole = (event_id, role) =>
  one(sb.from('volunteer_claims').delete().eq('event_id', event_id).eq('role', role));

const signIn = (email, password) => sb.auth.signInWithPassword({ email, password });
const signOut = () => sb.auth.signOut();
const session = async () => (await sb.auth.getSession()).data.session;

const saveRow = (table, row) => row.id
  ? one(sb.from(table).update(row).eq('id', row.id).select())
  : one(sb.from(table).insert(row).select());
const saveEvent = (row) => saveRow('events', row);
const savePlayer = (row) => saveRow('players', row);
const saveTeam = (row) => saveRow('teams', row);

async function savePoll(poll, slotRows) {
  const [saved] = await saveRow('polls', poll);
  for (const s of slotRows) await one(sb.from('poll_slots').insert({ poll_id: saved.id, starts_at: s.starts_at }));
  return saved;
}
const closePoll = (poll_id) => one(sb.from('polls').update({ status: 'closed' }).eq('id', poll_id).select());

async function convertSlotToPractice(poll_id, slot_id, location) {
  const [slot] = await one(sb.from('poll_slots').select('*, polls(team_id)').eq('id', slot_id));
  await saveEvent({ team_id: slot.polls.team_id, kind: 'practice', starts_at: slot.starts_at, location: location || '' });
  await closePoll(poll_id);
}

globalThis.Api = { init, loadTeamData, loadTeamDataCached, upsertRsvp, upsertVote,
  claimRole, unclaimRole, signIn, signOut, session,
  saveEvent, savePlayer, saveTeam, savePoll, closePoll, convertSlotToPractice };
