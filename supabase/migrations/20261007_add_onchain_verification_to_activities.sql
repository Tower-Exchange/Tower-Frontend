-- On-chain verification state for activities (Legion / Republic partner verification).
--
-- activities rows are written by the client through POST /api/user/activities,
-- so amounts/types/hashes are self-reported. The Legion webhook only counts a
-- swap/bridge after its transaction hash has been checked against the chain.
-- Results are cached here so each hash is checked once.
--
-- PRODUCTION SAFETY
--   * One ALTER TABLE, four nullable columns, no DEFAULT, no CHECK, no index:
--     on Postgres 11+ this is a catalog-only change (no table rewrite, no scan),
--     so it is instant regardless of table size.
--   * It still needs a brief ACCESS EXCLUSIVE lock. lock_timeout makes it fail
--     fast (and harmlessly) if a long-running query holds the table, instead of
--     queueing and blocking every swap/bridge insert behind it. If it errors with
--     "canceling statement due to lock timeout", just re-run it a moment later.
--   * Idempotent (IF NOT EXISTS). Existing rows keep NULL = "not yet checked".
--   * No existing index, trigger, policy, function or view is touched.
--
-- Writes go through the Tower API (service role); RLS stays locked.

SET lock_timeout = '5s';

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS onchain_status TEXT,          -- 'verified' | 'rejected' | NULL
  ADD COLUMN IF NOT EXISTS onchain_chain_id INTEGER,
  ADD COLUMN IF NOT EXISTS onchain_block_time TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS onchain_checked_at TIMESTAMPTZ;

RESET lock_timeout;
