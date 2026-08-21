# Team app v2 — design spec

Date: 2026-08-20 · Status: approved (user approved design + all four optional extras)

## 1. Goal

Turn the current schedule site into a TeamSnap/GameChanger-style team app for the coach's
youth softball and soccer teams — schedule, RSVPs, announcements, polls, volunteers — with
none of the ads or extraneous features, a modern mobile-first UI, and no new infrastructure:
still a static site on GitHub Pages + Supabase free tier, still vanilla JS with no build step.

Primary users: parents on phones (many iPhones) who need to RSVP their kid(s) in seconds and
never miss a game; the coach (one person, two teams) doing everything from a phone at the
field, plus occasional admin on a laptop.

## 2. Decisions already made (do not relitigate)

| Topic | Decision | Why |
|---|---|---|
| Parent identity | **No accounts.** Device-local "household" (array of player ids across teams) + per-team **invite code** carried in the invite link and checked by RLS. | Supabase free mailer is rate-limited (no SMTP setup for the coach); login friction kills parent adoption; code gates kids' names/RSVPs without typing. |
| Notifications | **None app-sent in v1.** Calendar subscription done right (alarms, cancellations), share-sheet message composers for the coach's existing group text, in-page "Needs your answer". Web Push is documented as phase 2 only. | No free, setup-free channel reaches iPhones from a static site. |
| Stack | Vanilla JS, no framework, no bundler, no package.json. Native `<dialog>` sheets, event delegation. Pin CDN versions. Minimal network-first service worker for offline shell. | Matches repo; panel unanimous; keeps it fast and maintainable by the coach. |
| Extras (user opted in) | Game results (W/L), **Maybe** RSVP status, coach-private parent contact fields, month calendar grid. | User explicitly requested all four. |
| Excluded | Accounts, app-sent email/SMS/push, chat/comments, stats/lineups, photos, payments/forms, venues table, bulk paste parser, Realtime/Edge Functions. | Out of scope for v1; see §12. |

## 3. Architecture

```
GitHub Pages (static)                 Supabase free tier
┌──────────────────────────┐          ┌──────────────────────────────┐
│ index.html  (parent app, │  REST    │ Postgres + RLS               │
│   coach mode when signed │ ───────► │  teams, players, events,     │
│   in)                    │          │  rsvps, volunteer_claims,    │
│ coach.html  (admin)      │  Auth    │  polls, poll_slots,          │
│ team.html   (redirect)   │ ───────► │  poll_votes, posts,          │
│ sw.js, manifest, icons   │          │  player_contacts,            │
│ <slug>.ics (generated)   │          │  team_secrets, coaches       │
└──────────────────────────┘          └──────────────────────────────┘
        ▲ commits
GitHub Action (every 15 min): node make_ics.js → <slug>.ics; weekly heartbeat commit
```

Files (flat, as today):

| File | Role |
|---|---|
| `index.html` | The app shell for parents (and coach mode). Query params: `team`, `c`, `event`, `kids`. |
| `coach.html` | Admin: sign-in, cross-team summary, roster + contacts, team settings, posts, bulk add. |
| `team.html` | Redirect shim → `index.html?team=…` (old shared links keep working). |
| `config.js` | `SITE_CONFIG` (Supabase URL/anon key, site origin, `COACH_EMAIL` used only by the passcode sign-in form). Authorization is decided by the `coaches` table, not this file. |
| `schedule_lib.js` | Pure logic, loaded as a global script in the browser and `require`d in Node tests. |
| `schedule_lib.test.js` | Node tests (`node schedule_lib.test.js`). |
| `api.js` | Supabase client: bundle load via PostgREST embedding, writes, auth. Exposes `globalThis.Api`. |
| `mock_api.js` | Same interface as `api.js` backed by in-memory fixtures (17 softball players, a generated season). Selected by `?mock=1`. Used for UI development, screenshots, and demos without touching the DB. |
| `store.js` | Client state: household, invite codes, per-team cache, lastSeen, pending write queue + optimistic apply, refresh on focus/online. Exposes `globalThis.Store`. |
| `ui.js` | Shared renderers: icons, sheet, toast, event card/hero, RSVP control, headcount, month grid, composer share. Exposes `globalThis.UI`. |
| `home_page.js` | Controller for `index.html`. |
| `coach_page.js` | Controller for `coach.html`. |
| `site.css` | Design system (tokens, components, dark mode). |
| `sw.js`, `manifest.webmanifest`, `icons/*` | PWA. |
| `robots.txt` | `Disallow: /` (+ `<meta name="robots" content="noindex,nofollow">` on every page). |
| `schema.sql` | Full fresh schema (for a new project). |
| `migrations/0002_team_app.sql` | Incremental migration for the already-deployed DB (the coach pastes it into the SQL editor once). |
| `migrations/README.md` | How to apply + a curl smoke test for the RLS code gate. |
| `make_ics.js`, `.github/workflows/ics.yml` | Feed generator + schedule. |

Deleted: `ads.txt` (AdSense leftover from the retired stats viewer), `migration_scope_coach.sql` (superseded; kept in git history).

## 4. Data model

### 4.1 Tables (final shape — see `schema.sql`)

```
teams(id, slug unique, name, emoji, color text default '#2d6a4f', tz text default 'America/New_York',
      min_players int default 0, default_location text default '', game_duration_min int default 90,
      practice_duration_min int default 60, arrive_early_min int default 30,
      default_volunteer_roles text[] default '{}')
  -- 'announcement' column is dropped; announcements live in posts.

players(id, team_id, first_name, last_initial, active bool)

player_contacts(player_id pk → players on delete cascade, parent_name text default '', phone text default '',
      email text default '', notes text default '')            -- coach-only (RLS)

events(id, team_id, kind check in ('game','practice','other'), title text default '' (used for 'other'),
      opponent text, starts_at timestamptz, time_tbd bool default false, duration_min int null (null → team default by kind; 'other' → 60),
      location text default '', home bool null, notes text default '',
      status text default 'scheduled' check in ('scheduled','tentative','cancelled'), status_note text default '',
      rescheduled_from timestamptz null, volunteer_roles text[] default '{}',
      score_us int null, score_them int null,
      created_at timestamptz default now(), updated_at timestamptz default now())   -- updated_at set by trigger

rsvps(event_id, player_id, status check in ('going','maybe','out'), note text default '' (≤80 chars, check),
      updated_at timestamptz default now() (trigger), pk(event_id, player_id))

volunteer_claims(event_id, role, player_id, pk(event_id, role))          -- unchanged
polls(id, team_id, title, status open|closed)                            -- unchanged
poll_slots(id, poll_id, starts_at)                                       -- unchanged
poll_votes(slot_id, player_id, choice yes|no|ifneeded)                   -- unchanged

posts(id, team_id, body text, pinned bool default false, created_at timestamptz default now())

team_secrets(team_id pk → teams, code text unique)   -- invite codes; never readable by anon
coaches(email text pk)                               -- who may administer
```

Display rules derived from this shape:
- Event title: game → `vs Opponent` (home = true/null) or `@ Opponent` (home = false); practice → `Practice`; other → `title` or `Event`.
- Arrive-by (games only): `starts_at − team.arrive_early_min`.
- Ends: `starts_at + (duration_min ?? team default for kind)`.
- Result pill on past games when both scores non-null: `W 7–5`, `L 3–8`, `T 4–4`; team record `W–L–T` in the team header for the loaded window.
- Event is "now" from `starts_at` until `ends`; the hero stays on it.

### 4.2 Security (RLS)

Helpers (SECURITY DEFINER, `stable`):
- `is_coach()` → `exists(select 1 from coaches where lower(email) = lower(auth.jwt()->>'email'))`.
- `request_team_codes()` → parses request header `x-team-codes` (comma-separated) from `current_setting('request.headers', true)::json`; returns `text[]` (empty when absent).
- `team_code_ok(team_id)` → `is_coach() or exists(select 1 from team_secrets where team_id = $1 and code = any(request_team_codes()))`.
- `event_team(event_id)`, `slot_team(slot_id)` → team id lookups used by policies.

Policies:

| Table | anon / any | coach (`is_coach()`) |
|---|---|---|
| teams, events, polls, poll_slots | select | all |
| players | select where `team_code_ok(team_id)` | all |
| posts | select where `team_code_ok(team_id)` | all |
| rsvps | select/insert/update/delete where `team_code_ok(event_team(event_id))` | all |
| volunteer_claims | same as rsvps | all |
| poll_votes | select/insert/update/delete where `team_code_ok(slot_team(slot_id))` | all |
| player_contacts | none | all |
| team_secrets | none (read only via `team_code_ok`) | select, update (regenerate code) |
| coaches | none | select |

Triggers: `set_updated_at()` before update on `events` and before insert/update on `rsvps` (server-set; ignores client timestamps).

Client sends the header via `createClient(url, key, { global: { headers: { 'x-team-codes': codes.join(',') } } })`; the client is (re)created whenever stored codes change.

**Fallback if the header is not forwarded** (the smoke test in `migrations/README.md` proves it one way or the other): a per-request "set my codes" RPC cannot work because PostgREST settings are transaction-scoped, so the documented fallback is Supabase **anonymous sign-in** (dashboard toggle) + a `claim_team(code)` RPC writing `memberships(user_id, team_id)`, with `team_code_ok` checking membership by `auth.uid()`. Not built unless the smoke test fails.

### 4.3 Migration `0002_team_app.sql` (DB is empty of events; players exist)

Idempotent where practical (`if not exists`, `drop policy if exists`). Steps:
1. `coaches` table; insert `idelorey@gmail.com`. `is_coach()`.
2. `team_secrets`; insert a random 8-char code per team from pgcrypto's CSPRNG (`upper(encode(gen_random_bytes(4), 'hex'))`). `request_team_codes()`, `team_code_ok()`, `event_team()`, `slot_team()`.
3. `teams`: add columns; drop `announcement` after moving any non-empty value into `posts` (pinned).
4. `events`: add columns; `status` from `cancelled`; drop `cancelled`.
5. `rsvps`: widen status check to include `maybe`; add `note`; trigger.
6. `posts`, `player_contacts`.
7. Drop all old policies; create the policies in §4.2.
8. Grant nothing new (anon/authenticated roles already have table privileges through Supabase defaults).

`migrations/README.md` includes: paste instructions; a post-migration checklist query (`select slug, code from teams join team_secrets …`); and a smoke test:
```
curl -H "apikey: $ANON" "$URL/rest/v1/players?select=id&limit=1"                       # expect []
curl -H "apikey: $ANON" -H "x-team-codes: <CODE>" "$URL/rest/v1/players?select=id&limit=1"  # expect a row
```

## 5. Client state (`store.js`)

localStorage keys (all prefixed `wolves:`):
- `household` → `[player_id, …]` (any team). Legacy `kid:<slug>` values are migrated into it on first load, then removed.
- `codes` → `{ slug: code }`.
- `cache:<slug>` → last good team bundle + fetchedAt.
- `lastSeen:<slug>` → ISO timestamp written on each successful render; drives "since your last visit" and the posts "New" dot.
- `pending` → queued writes `[ { id, kind: 'rsvp'|'vote'|'claim'|'unclaim', payload, ts } ]`.
- `view` → `'list' | 'month'`.
- `installHintDismissed`, `browsing` (skipped onboarding).

Bundle load: one request per team:
`teams?select=*,players(*,player_contacts(*)),events(*,rsvps(*),volunteer_claims(*)),polls(*,poll_slots(*,poll_votes(*))),posts(*)&slug=eq.<slug>&events.starts_at=gte.<now−120d>&events.order=starts_at&posts.order=created_at.desc`
RLS filters embedded rows per table, so anon without a code gets `players: []`, `posts: []`, etc.

Flow: render from cache immediately (if any) → fetch → re-render → `lastSeen` stamp. Refetch on `visibilitychange` (visible), `online`, and a manual pull (button). Show "Updated N min ago" / "Offline — showing saved schedule" in the header.

Writes are optimistic: apply to the in-memory bundle and re-render the affected card, enqueue, flush sequentially. Per `(kind, event/slot, player)` key only the latest queued op is kept (double-tap safe, last tap wins). On definite server error → revert + toast "Couldn't save — try again". On network error → keep queued, toast "Saved when you're back online", retry on `online`/`visibilitychange`. Every RSVP change shows a toast with **Undo** (5 s) that restores the previous status (or clears it).

Coach mode: `Api.session()` present ⇒ `Store.isCoach = true` (RLS bypasses codes; UI shows coach affordances). The coach's own household works identically.

## 6. Pure logic (`schedule_lib.js`, tested)

Existing helpers kept/adapted; new ones (all take `tz` where dates are involved; all pure):

- `displayName(p)`; `eventTitle(e)`; `eventEnd(e, team)`; `arriveBy(e, team)`; `isNow(e, team, now)`; `isPast(e, team, now)`.
- `nextEvent(events, team, now)` — first non-cancelled event whose end is after now.
- `splitSchedule(events, team, now)` → `{ upcoming, past }` (upcoming includes "now" and cancelled-but-future events).
- `groupByWeek(events, tz, now)` → `[{ label: 'This week'|'Next week'|'Week of May 10', events }]` (weeks start Sunday, matching the month grid and US calendars).
- `monthGrid(year, month, events, tz)` → 6×7 cells `{ date, inMonth, isToday, events }`.
- `summarizeRsvps(players, rsvps, minPlayers)` → `{ going, maybe, out, silent, shortBy }` (shortBy from going only).
- `needsAnswer(bundles, household, now)` → `[{ team, event | slot, player }]` items lacking an rsvp/vote.
- `overlaps(a, teamA, b, teamB)` → boolean; `findOverlaps(items)` for the merged view.
- `changedSince(bundle, lastSeenIso)` → `{ events: [...updated since], posts: [...new since] }`.
- `volunteerConflicts(event, claims, rsvps)` → claims whose player is `out`.
- `record(events)` → `{ w, l, t }`; `resultLabel(e)` → `'W 7–5'` etc.
- Dates: `fmtDay(iso, tz)`, `fmtTime(iso, tz)`, `relativeDay(iso, tz, now)` → `Today` / `Tomorrow` / weekday name when within the next 6 days / `Sat, May 2` otherwise / `Sat, May 2, 2027` in another year, `fmtWhen(iso, tz)`; `zonedToUtc({y,m,d,hh,mm}, tz)` and `utcToZoned(iso, tz)`; `expandWeekly(firstLocal, tz, { count | until, everyWeeks })` → ISO list at the same wall-clock time (DST-safe; tested across 2026-11-01 in America/New_York).
- Composers (return plain text with the deep link): `composeNudge`, `composeCancel`, `composeTentative`, `composeReschedule`, `composeAnnouncement`, `composeEventShare`, `coParentLink(origin, kids, codes)`, `eventLink(origin, slug, id)`, `mapsUrl(location, isIOS)`.
- `buildIcs(team, events, origin, now)` — see §9.
- Parsers: `parseRosterPaste(text)` → `[{ first_name, last_initial }]` ("Kate B", "Kate B.", "Kate", one per line, comma-separated tolerated).

## 7. Parent UI (`index.html`)

Single column, max-width 600px, system font, 17px body, 44–48px targets, dark mode via `prefers-color-scheme`, reduced-motion respected. Team accent color used only for state (selected chip, my RSVP) and the team header band; status colors: going = green, maybe = amber, can't = rose/neutral, no answer = outlined amber, cancelled = red strike, tentative = amber banner, changed = amber badge. Inline SVG icons; no icon/web fonts. No `alert()`/`prompt()`/`confirm()`; sheets and toasts only.

### 7.1 URL handling
- `?c=CODE&team=slug` → store code for team; keep params in URL (so bookmarks retain them).
- `?kids=12,34&c=softball:CODE1,soccer:CODE2` → add kids to household (codes stored per team from the `slug:code` pairs; kids resolved to teams after load) → render.
- `?team=slug` → filter to that team; `?event=ID` → after render, scroll to and expand that event (and switch to list view).
- `?mock=1` → `mock_api.js`.

### 7.2 First run (no household)
- If the URL carries a team code: one sheet — "🥎 SAA 10U Wolves · Pick your player(s) to RSVP. No account needed." Name pills (first name + initial), multi-select, **Done**; footer links "My player isn't listed → ask Coach" (text) and "Just browsing".
- If no code: Teams list (public schedules) + "Have an invite link from your coach? Tap it to RSVP." and a "Coach" link.
- If both teams have codes stored (e.g. co-parent link): team tabs inside the picker.

### 7.3 Home (household present)
Header: team emoji/name (or "My schedule" when >1 team), household chips ("Kate · Sam" — tap → picker sheet), freshness dot, segmented control `All | 🥎 | ⚽` only for multi-team households. Coach mode adds a "Coach" pill and "+" button.

Body order:
1. **Read-only notice** if a team in view lacks a code ("Tap your invite link to RSVP and see who's going").
2. **Announcements**: pinned post as a banner; "New" dot until seen (lastSeen); "Updates (3)" disclosure with the recent feed (body, relative time).
3. **Since your last visit** strip (only if any): "Sat game moved to 2:00 · Tue practice cancelled" rows → tap to expand event.
4. **Needs your answer (N)**: compact rows — day/time, title, kid name when >1 — with inline `Going · Maybe · Can't` segmented control; poll slots appear here too ("Vote: practice time") → tap opens the poll card.
5. **Up next** hero — relative day + big time (or "Time TBD"), title, Home/Away pill, arrive-by, location → **Directions** (Apple Maps on iOS, Google Maps elsewhere), notes, status banner (CANCELLED / ⚠️ Weather pending — `status_note` / MOVED from `rescheduled_from`), per-kid RSVP control, headcount line `7 going · 1 maybe · 2 can't · 8 no reply · need 1 more`, unfilled-role hint ("Snacks still open — Claim"), "Later today" row if another event is the same day.
6. **Open polls**: slot rows with per-kid ✅ / 🤷 / ❌ (with text labels for a11y) and tallies.
7. **Schedule**: header with `List | Month` toggle and `All | Games | Practices` filter chips.
   - List: grouped by week; each row: day + time (big), title, location (short), status chip for my kid(s), badges (CANCELLED / TBD / MOVED / Weather / result pill for past), overlap marker ("overlaps Sam's game"). Tap → expands in place: full details, Directions, who's going (names by status; hidden entirely without the invite code — RLS returns no roster/RSVP rows, so no counts either; an "Have an invite code?" entry field lets a parent enter it, e.g. on an installed Home-Screen app whose storage is separate from Safari), volunteer roles (Claim/Unclaim per kid), my note field ("late from soccer", ≤80), "Answered Tue 9:12 PM", Add this event to my calendar (Google link + .ics download), Share event. Coach mode: ⋯ menu (see §8).
   - Month: `‹ May 2026 ›`, 7-column grid, cells with up to 2 mini pills (emoji + time) colored by team, "+N"; tap a day → that day's events render as cards beneath the grid.
   - Past: collapsed `details` with results.
8. **Footer**: Subscribe to calendar (sheet: `webcal://` button on iOS with 2-line how-to; https URL + copy + Google "From URL" steps elsewhere; note that Google ignores alarms) · Share with my co-parent (share sheet with `coParentLink`) · Change my players · Add to Home Screen hint (dismissible; iOS instructions) · Coach link.

### 7.4 RSVP control
Segmented `Going | Maybe | Can't` (selected = filled with status color; kid name label above when >1 kid on the team). Tap again on the selected segment does nothing; **Undo** via toast. Disabled (with a hint) only when read-only — no invite code for that team. Offline never disables it: the write is queued and the toast says so.

## 8. Coach UI

### 8.1 Coach mode on `index.html` (after sign-in)
- Header "Coach" pill; **+** button → event sheet (see 8.3) pre-set to the team in view.
- Each event card ⋯ menu: **Edit** · **Cancel…** (sheet: optional note → sets status cancelled; then offers "Text the team" composer) · **Weather pending…** (note like "Field check — decision by 8:30") · **Restore** (back to scheduled) · **Reschedule…** (new date/time; sets `rescheduled_from` = old start, clears RSVPs, keeps claims; offers "Text the team: please RSVP again") · **Enter result…** (two numbers; past games) · **Nudge no-replies** (composer with named non-responders + open roles + link) · **Text the team** (event summary + link) · **Copy no-reply names** · **Duplicate (+7 days)** · **Delete** (confirm sheet).
- Headcount on expanded card: names under Going / Maybe / Can't / No reply; tap a name → sheet: set RSVP (Going/Maybe/Can't/Clear) on their behalf, contact (parent name, `tel:`, `sms:`, `mailto:` from `player_contacts`). Conflict flag: "Snacks: Gia — marked Can't". **Text no-replies** button: multi-recipient `sms:` link with the nudge text when phones exist (iOS `sms:/open?addresses=a,b&body=…`, Android `sms:a,b?body=…`), else falls back to the share sheet.
- Posts: "Announce…" button → sheet (body, pinned toggle) → on save offers "Text the team". Edit/delete/pin from the feed.
- Polls: "New poll…" sheet (title, 2–6 slots, per-slot datetime); on the open poll card: names per slot, "Make this the practice" (location defaults to team default; option "repeat weekly until …" uses `expandWeekly`), "Close poll".

### 8.2 `coach.html` (admin)
- Sign-in card (passcode; email resolved from the `coaches` table is not needed — keep `SITE_CONFIG.COACH_EMAIL` for `signInWithPassword`). Sign out.
- Summary cards per team: next event + headcount, unfilled roles, "Open team →".
- Roster: list (name, initial, active, parent, phone, email); row tap → edit sheet (fields + contacts + notes); **Paste names** (textarea → `parseRosterPaste` → preview → add); **Mark all inactive** (season rollover, confirm).
- Team settings sheet: name, emoji, color, time zone, min players, default location, game/practice duration, arrive-early minutes, default volunteer roles. **Invite link**: shows `https://…/?team=slug&c=CODE` with Copy / Share; **Regenerate code** (confirm: "everyone will need the new link").
- Bulk add: sheet — kind, title/opponent, first date+time, location, duration, **repeat weekly × N / until date**, volunteer roles → preview list → insert all.
- Housekeeping: link to the public `.ics`.

### 8.3 Event sheet (shared)
Fields: kind segmented (Game / Practice / Other); opponent or title; Home/Away (games); date; time + "Time TBD" toggle; duration (prefilled from team default); location (prefilled team default; `<datalist>` of prior locations); volunteer roles (chips; prefilled defaults); notes (with hint "appears in the public calendar feed"); status note when editing a cancelled/tentative event. Buttons: **Save** · **Save & add another** (keeps the sheet open, prefilled from this event with date +7 days) · Cancel.

## 9. Calendar feed (`make_ics.js` + `buildIcs`)

Per team `<slug>.ics`, events with `starts_at ≥ now − 60 days`:
- `SUMMARY`: `🥎 Wolves vs Tigers · arrive 9:30` (games), `🥎 Wolves practice`, `🥎 Wolves: Picture day`; prefix `CANCELLED — ` when cancelled, `(weather pending) ` when tentative.
- `DTSTART/DTEND` in UTC from start and duration; `time_tbd` → all-day `VALUE=DATE`.
- `STATUS:CONFIRMED | TENTATIVE | CANCELLED`; `SEQUENCE` = epoch seconds of `updated_at`; `LAST-MODIFIED`; `UID:evt-<id>@wolves.glorbnorb.com`; `URL` = event deep link; `LOCATION`; `DESCRIPTION` = arrive-by, home/away, notes, status note, link (no names — the feed is public in the repo).
- `VALARM` DISPLAY `-P1D` and `-PT2H` except for cancelled / time_tbd.
- `X-WR-CALNAME`, `X-PUBLISHED-TTL:PT1H`, `REFRESH-INTERVAL;VALUE=DURATION:PT1H`.
- Workflow: cron `*/15 * * * *`; weekly heartbeat commit (touch `.heartbeat` on Mondays) so the 60-day inactivity rule never disables the schedule (and with it the Supabase keep-alive).

Per-event "Add to calendar" in the UI: Google Calendar template URL + a generated single-event `.ics` (data URL).

## 10. PWA

- `manifest.webmanifest`: name "Wolves Team Schedule", short_name "Wolves", `start_url: "/"`, `display: standalone`, theme/background colors, icons 192/512 (+ maskable).
- Icons: SVG source (`icons/icon.svg`) rendered to PNG 192/512/180 with a small PowerShell script using System.Drawing (verified available on this machine); `apple-touch-icon` 180.
- `sw.js`: precache shell (html, css, js, manifest, icons, CDN supabase-js); **network-first** for same-origin and CDN GETs with cache fallback; versioned cache name bumped on deploy; `skipWaiting` + `clients.claim`; old caches deleted on activate. Never caches Supabase REST responses (Store handles data caching).
- iOS install hint (dismissible) explaining Share → Add to Home Screen.

## 11. Verification

- `node schedule_lib.test.js` covers every pure helper in §6 including DST (`expandWeekly` across 2026-11-01), ICS (cancelled kept with STATUS, alarms present/absent, all-day TBD), composers, needsAnswer, groupByWeek/monthGrid boundaries, summarizeRsvps with maybe, record/result labels, roster parser.
- UI: exercised in Chrome at phone width (390×844) with `?mock=1`: onboarding, RSVP optimistic + undo, needs-answer strip, month view, coach mode sheets, dark mode; screenshots captured.
- RLS: after the coach applies the migration, `curl` smoke test (with/without `x-team-codes`, and authenticated as coach) recorded in `migrations/README.md`.
- Lighthouse-style checks: viewport, tap targets, contrast; manifest valid.

## 12. Out of scope (v1) / phase 2 notes

- **Web Push** (phase 2 design): `push_subscriptions(endpoint pk, keys, player_ids, team_ids)` anon insert/update; notify step in the ICS Action sends "you haven't answered for Saturday" and "today 10:00, arrive 9:30" via VAPID; iOS requires Add to Home Screen. ~30 min one-time coach setup (generate VAPID keys, add GitHub secrets). Build only if a season shows calendar + group text is not enough.
- Accounts, email/SMS, chat, photos, payments, stats/lineups, league admin, venues table, bulk paste schedule parser, RSVP deadlines/waitlists, attendance analytics, native apps, Realtime.

## 13. Rollout

1. Build on branch `team-app` (site keeps serving `main` meanwhile).
2. Coach pastes `migrations/0002_team_app.sql` in the Supabase SQL editor; runs the checklist query to read the two invite codes.
3. Smoke-test RLS with curl; verify coach sign-in still works.
4. Merge to `main` → Pages deploys; Action runs on the new schedule.
5. Coach texts each team its invite link; parents pick their kids.
