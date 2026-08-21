# Applying migrations

The site has no server; schema changes are pasted into Supabase once by the coach.

## 0002_team_app.sql (team app v2)
**Apply this only together with deploying the `team-app` branch (right before or right after):
it code-gates roster and RSVP reads that the current site fetches anonymously. (The site has no
events yet, so the brief gap is harmless, but don't apply it days early.)**

1. Supabase dashboard → SQL editor → New query → paste the whole file → Run. Safe to re-run.
2. Read the invite codes:
   ```sql
   select t.slug, s.code from teams t join team_secrets s on s.team_id = t.id;
   ```
   Invite link per team: `https://wolves.glorbnorb.com/?team=<slug>&c=<code>` (also shown on coach.html → Team settings).
3. Smoke test the RLS code gate from any shell (anon key is public, it's in config.js):
   ```bash
   URL=https://vooksccncttyttuyahpp.supabase.co; ANON=<anon key>; CODE=<softball code>
   curl -s -H "apikey: $ANON" "$URL/rest/v1/players?select=id&limit=1"                      # expect: []
   curl -s -H "apikey: $ANON" -H "x-team-codes: $CODE" "$URL/rest/v1/players?select=id&limit=1"   # expect: [{"id":…}]
   curl -s -H "apikey: $ANON" "$URL/rest/v1/events?select=id&limit=1"                        # expect: rows (events are public)
   ```
   If the second call also returns `[]`, the `x-team-codes` header is not reaching Postgres —
   stop and use the documented fallback (spec §4.2: anonymous sign-in + `claim_team` RPC).
4. Check the same gate through the site itself — curl proves the policy, these prove the app
   reads it the way a parent will:
   - `https://wolves.glorbnorb.com/?team=softball&c=<CODE>` → the first-run picker lists the
     players. (Names on screen = the code reached PostgREST through the app's client.)
   - `https://wolves.glorbnorb.com/?team=soccer` (no code) → the schedule is visible, **no
     player names anywhere, and no headcounts or poll tallies**, with the read-only notice
     ("tap your invite link to RSVP and see who's going") and the "Have an invite code?" field.
     Zeroes instead of a hidden headcount means a build older than this migration is deployed.
5. Sign in on coach.html with the usual passcode; the roster should load.

If the page shows an error like "Could not find a relationship…" right after the migration,
PostgREST's schema cache is stale: wait a minute, or run `notify pgrst, 'reload schema';` in
the SQL editor.
