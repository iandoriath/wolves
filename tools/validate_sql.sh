#!/usr/bin/env bash
# Validates schema.sql (fresh) and v1 schema + migrations/0002 against a throwaway Postgres.
set -euo pipefail
cd "$(dirname "$0")/.."
docker rm -f wolves-pg >/dev/null 2>&1 || true
docker run -d --name wolves-pg -e POSTGRES_PASSWORD=pw -p 55432:5432 postgres:16-alpine >/dev/null
for i in $(seq 1 30); do docker exec wolves-pg pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
psql_() { docker exec -i wolves-pg psql -v ON_ERROR_STOP=1 -U postgres -d "$1" -q; }
stub='create schema if not exists auth; create or replace function auth.jwt() returns jsonb language sql stable as $$ select '\''{}'\''::jsonb $$;
      do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
      do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;'
echo "== fresh schema.sql"
docker exec wolves-pg psql -U postgres -q -c 'create database fresh' >/dev/null
echo "$stub" | psql_ fresh; psql_ fresh < schema.sql
echo "== v1 schema + migration 0002"
docker exec wolves-pg psql -U postgres -q -c 'create database migrated' >/dev/null
echo "$stub" | psql_ migrated
git show e84807d:schema.sql | psql_ migrated
psql_ migrated < migrations/0002_team_app.sql
psql_ migrated < migrations/0002_team_app.sql   # idempotency
echo "== compare column sets"
q="select table_name, column_name, data_type from information_schema.columns where table_schema='public' order by 1,2"
diff <(docker exec wolves-pg psql -U postgres -d fresh -At -c "$q") <(docker exec wolves-pg psql -U postgres -d migrated -At -c "$q") && echo "columns identical"
echo "== policies"
docker exec wolves-pg psql -U postgres -d migrated -At -c "select tablename||'.'||policyname from pg_policies order by 1"
docker rm -f wolves-pg >/dev/null
echo "SQL OK"
