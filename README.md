# wolves.glorbnorb.com — team app

Schedule, RSVPs (Going / Maybe / Can't per kid), announcements, practice-time polls, volunteer sign-ups and
results for our softball and soccer teams. Static site on GitHub Pages + Supabase free tier. No build step.

- Parents: open the invite link once, pick your player(s), RSVP in one tap. Subscribe in your calendar app
  (reminders, cancellations and changes included). Add to Home Screen for an app icon.
- Coach: sign in on `coach.html` (admin) — on the team page you're in coach mode (add/edit/cancel/reschedule,
  headcount, nudge non-responders via the share sheet, announcements, polls).

## Files
`index.html` + `home_page.js` (parent app / coach mode), `coach.html` + `coach_page.js` (admin), `ui.js`
(shared rendering), `store.js` (state, cache, optimistic writes), `api.js` (Supabase), `mock_api.js` (`?mock=1` /
`?mock=coach` for demos), `schedule_lib.js` (pure logic, tested), `coach_sheets.js` (coach forms), `site.css`,
`sw.js` + `manifest.webmanifest` (PWA), `make_ics.js` (calendar feeds, run by the Action every 15 min).

## Dev
- `node schedule_lib.test.js` — pure-logic tests.
- `node store.test.js` — store/queue tests.
- `python -m http.server 8080` then `http://localhost:8080/?mock=1&team=softball&c=WOLF26` (or `?mock=coach`).
- DB changes: see `migrations/README.md`. `schema.sql` is the fresh schema; `tools/validate_sql.sh` checks both with Docker.

The 2026 batting-stats viewer that used to live here was retired 2026-08-18; it remains in git history.
