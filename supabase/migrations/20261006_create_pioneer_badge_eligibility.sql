-- Pioneer badge progress begins when this migration is applied in production.
-- Existing activities are intentionally excluded from eligibility.
CREATE TABLE IF NOT EXISTS public.badge_eligibility_settings (
  badge_id TEXT PRIMARY KEY,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT badge_eligibility_settings_badge_id_check
    CHECK (badge_id IN ('swap-pioneer', 'bridge-pioneer'))
);

INSERT INTO public.badge_eligibility_settings (badge_id)
VALUES ('swap-pioneer'), ('bridge-pioneer')
ON CONFLICT (badge_id) DO NOTHING;

ALTER TABLE public.badge_eligibility_settings ENABLE ROW LEVEL SECURITY;

-- The browser roles must not be able to read or alter the eligibility baseline.
REVOKE ALL ON TABLE public.badge_eligibility_settings FROM anon, authenticated;

-- The pioneer badge API uses the Supabase service-role key. Service role bypasses
-- RLS by default, but this policy makes that intended server-only access explicit.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'badge_eligibility_settings'
      AND policyname = 'Service role manages pioneer badge eligibility settings'
  ) THEN
    CREATE POLICY "Service role manages pioneer badge eligibility settings"
      ON public.badge_eligibility_settings
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_activities_wallet_status_timestamp
  ON public.activities (wallet_address, status, timestamp DESC);
