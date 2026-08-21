import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.112.3/+esm';

let sb = null, currentKey = null;
const BUNDLE_SELECT = '*,players(*,player_contacts(*)),events(*,rsvps(*),volunteer_claims(*)),polls(*,poll_slots(*,poll_votes(*))),posts(*)';
const EVENTS_WINDOW_DAYS = 120;
const ms = (iso) => new Date(iso).getTime();

function init(codes = []) {
  const key = [...new Set(codes.filter(Boolean).map(c => String(c).toUpperCase()))].sort().join(',');
  if (sb && key === currentKey) return sb;
  currentKey = key;
  sb = createClient(SITE_CONFIG.SUPABASE_URL, SITE_CONFIG.SUPABASE_ANON_KEY,
    { global: { headers: key ? { 'x-team-codes': key } : {} } });
  return sb;
}
const one = async (q) => { const { data, error } = await q; if (error) throw error; return data; };

function flattenBundle(t) {
  const { players = [], events = [], polls = [], posts = [], ...team } = t;
  const contacts = [];
  const cleanPlayers = players.map(({ player_contacts, ...p }) => {
    const pc = Array.isArray(player_contacts) ? player_contacts : player_contacts ? [player_contacts] : [];
    contacts.push(...pc);
    return p;
  }).sort((a, b) => a.first_name.localeCompare(b.first_name) || (a.last_initial || '').localeCompare(b.last_initial || ''));
  const rsvps = events.flatMap(e => e.rsvps || []);
  const claims = events.flatMap(e => e.volunteer_claims || []);
  const cleanEvents = events.map(({ rsvps, volunteer_claims, ...e }) => e).sort((a, b) => ms(a.starts_at) - ms(b.starts_at) || a.id - b.id);
  const slots = polls.flatMap(p => p.poll_slots || []);
  const votes = slots.flatMap(s => s.poll_votes || []);
  const cleanSlots = slots.map(({ poll_votes, ...s }) => s).sort((a, b) => ms(a.starts_at) - ms(b.starts_at));
  const cleanPolls = polls.map(({ poll_slots, ...p }) => p).sort((a, b) => a.id - b.id);
  const cleanPosts = [...posts].sort((a, b) => ms(b.created_at) - ms(a.created_at));
  return { team, players: cleanPlayers, contacts, events: cleanEvents, rsvps, claims,
    polls: cleanPolls, slots: cleanSlots, votes, posts: cleanPosts, fetchedAt: new Date().toISOString() };
}

const listTeams = () => one(sb.from('teams').select('id,slug,name,emoji,color').order('id'));
async function loadTeam(slug) {
  const since = new Date(Date.now() - EVENTS_WINDOW_DAYS * 86400000).toISOString();
  const rows = await one(sb.from('teams').select(BUNDLE_SELECT).eq('slug', slug).gte('events.starts_at', since));
  if (!rows[0]) throw new Error(`no team ${slug}`);
  return flattenBundle(rows[0]);
}

// ---- parent writes (anon, gated by x-team-codes) ----
const upsertRsvp = ({ event_id, player_id, status, note = '' }) =>
  one(sb.from('rsvps').upsert({ event_id, player_id, status, note }).select());
const deleteRsvp = (event_id, player_id) => one(sb.from('rsvps').delete().eq('event_id', event_id).eq('player_id', player_id));
const upsertVote = (slot_id, player_id, choice) => one(sb.from('poll_votes').upsert({ slot_id, player_id, choice }).select());
const deleteVote = (slot_id, player_id) => one(sb.from('poll_votes').delete().eq('slot_id', slot_id).eq('player_id', player_id));
const claimRole = (event_id, role, player_id) => one(sb.from('volunteer_claims').upsert({ event_id, role, player_id }).select());
const unclaimRole = (event_id, role) => one(sb.from('volunteer_claims').delete().eq('event_id', event_id).eq('role', role));

// ---- auth ----
const signIn = (email, password) => sb.auth.signInWithPassword({ email, password });
const signOut = () => sb.auth.signOut();
const session = async () => (await sb.auth.getSession()).data.session;

// ---- coach writes ----
async function saveRow(table, row) {
  const { id, ...rest } = row;
  const q = id ? sb.from(table).update(rest).eq('id', id) : sb.from(table).insert(rest);
  return (await one(q.select()))[0];
}
const saveEvent = (row) => saveRow('events', row);
const insertEvents = (rows) => one(sb.from('events').insert(rows).select());
const deleteEvent = (id) => one(sb.from('events').delete().eq('id', id));
const clearEventRsvps = (event_id) => one(sb.from('rsvps').delete().eq('event_id', event_id));
const savePlayer = (row) => saveRow('players', row);
const saveContact = (row) => one(sb.from('player_contacts').upsert(row).select());
const saveTeam = (row) => saveRow('teams', row);
const savePost = (row) => saveRow('posts', row);
const deletePost = (id) => one(sb.from('posts').delete().eq('id', id));
async function savePoll(poll, slotStarts) {
  const saved = await saveRow('polls', poll);
  if (slotStarts.length) await one(sb.from('poll_slots').insert(slotStarts.map(starts_at => ({ poll_id: saved.id, starts_at }))));
  return saved;
}
const closePoll = (id) => saveRow('polls', { id, status: 'closed' });
const teamSecrets = () => one(sb.from('team_secrets').select('*'));
const setTeamCode = (team_id, code) => one(sb.from('team_secrets').update({ code }).eq('team_id', team_id).select());

globalThis.Api = { init, listTeams, loadTeam, upsertRsvp, deleteRsvp, upsertVote, deleteVote, claimRole, unclaimRole,
  signIn, signOut, session, saveEvent, insertEvents, deleteEvent, clearEventRsvps, savePlayer, saveContact, saveTeam,
  savePost, deletePost, savePoll, closePoll, teamSecrets, setTeamCode, _flattenBundle: flattenBundle };
