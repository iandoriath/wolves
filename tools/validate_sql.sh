#!/usr/bin/env bash
# Validates schema.sql (fresh) and v1 schema + migrations/0002..0003 against a throwaway Postgres.
set -euo pipefail
trap 'docker rm -f wolves-pg >/dev/null 2>&1 || true' EXIT
cd "$(dirname "$0")/.."
docker rm -f wolves-pg >/dev/null 2>&1 || true
docker run -d --name wolves-pg -e POSTGRES_PASSWORD=pw postgres:16-alpine >/dev/null
for i in $(seq 1 30); do docker exec wolves-pg pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done
docker exec wolves-pg pg_isready -U postgres >/dev/null
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
psql_ migrated < migrations/0003_event_arrive_early.sql
psql_ migrated < migrations/0003_event_arrive_early.sql   # idempotency
echo "== compare column sets"
q="select table_name, column_name, data_type from information_schema.columns where table_schema='public' order by 1,2"
diff <(docker exec wolves-pg psql -U postgres -d fresh -At -c "$q") <(docker exec wolves-pg psql -U postgres -d migrated -At -c "$q")
echo "columns identical"
echo "== compare policies"
pq="select tablename||'.'||policyname||':'||cmd||':'||coalesce(qual,'')||':'||coalesce(with_check,'') from pg_policies where schemaname='public' order by 1"
diff <(docker exec wolves-pg psql -U postgres -d fresh -At -c "$pq") <(docker exec wolves-pg psql -U postgres -d migrated -At -c "$pq")
echo "policies identical"
echo "== compare constraints"
# excludes synthetic not-null CHECK entries (named <schema_oid>_<table_oid>_<attnum>_not_null): those
# encode each database's own internal table OIDs, so fresh vs. migrated never match on name even when
# the actual column nullability is identical -- that's OID noise, not schema drift.
cq="select table_name||'.'||constraint_name||':'||constraint_type from information_schema.table_constraints where table_schema='public' and constraint_type in ('CHECK','UNIQUE','PRIMARY KEY') and constraint_name !~ '_not_null$' order by 1"
diff <(docker exec wolves-pg psql -U postgres -d fresh -At -c "$cq") <(docker exec wolves-pg psql -U postgres -d migrated -At -c "$cq")
echo "constraints identical"
echo "SQL OK"
