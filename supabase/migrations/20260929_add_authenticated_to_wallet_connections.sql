-- Atlas AI one-time $0.10 USDC authentication.
-- The AI agent checks wallet_connections.authenticated before responding.
-- Writes go through the Tower frontend API (service role); RLS stays locked.

ALTER TABLE wallet_connections
  ADD COLUMN IF NOT EXISTS authenticated BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE wallet_connections
  ADD COLUMN IF NOT EXISTS auth_tx_hash TEXT;

ALTER TABLE wallet_connections
  ADD COLUMN IF NOT EXISTS authenticated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_wallet_connections_authenticated_address
  ON wallet_connections (lower(address))
  WHERE authenticated = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_connections_auth_tx_hash
  ON wallet_connections (lower(auth_tx_hash))
  WHERE auth_tx_hash IS NOT NULL;

COMMENT ON COLUMN wallet_connections.authenticated IS
  'True after the wallet paid the one-time Atlas $0.10 USDC authentication fee';
COMMENT ON COLUMN wallet_connections.auth_tx_hash IS
  'Arc transaction hash that unlocked Atlas for this wallet (stored on one row)';
COMMENT ON COLUMN wallet_connections.authenticated_at IS
  'Timestamp when Atlas authentication was recorded';
