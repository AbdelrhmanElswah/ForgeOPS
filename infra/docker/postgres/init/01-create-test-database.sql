-- Runs once, when the Postgres volume is first created.
-- A separate database for integration tests, so `pnpm test` never touches dev data.
CREATE DATABASE forgeops_test OWNER forgeops;
