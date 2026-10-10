-- 0008 pg_net: outbound HTTP from Postgres. Used to load the question catalogue from the public repo when the
-- seed is too large to paste (see scripts/catalogue-sql.mjs), and by the weekly-digest schedule (0012).
create extension if not exists pg_net with schema extensions;
