-- Configurable tiered service fees. All monetary amounts are integer kobo.
ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS fee_bearer text NOT NULL DEFAULT 'PASS'
  CHECK (fee_bearer IN ('ABSORB', 'PASS'));

CREATE TABLE IF NOT EXISTS public.fee_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  min_price_kobo bigint NOT NULL CHECK (min_price_kobo >= 0),
  max_price_kobo bigint CHECK (max_price_kobo IS NULL OR max_price_kobo >= min_price_kobo),
  percentage_bps integer NOT NULL CHECK (percentage_bps >= 0),
  fixed_fee_kobo bigint NOT NULL DEFAULT 0 CHECK (fixed_fee_kobo >= 0),
  cap_kobo bigint CHECK (cap_kobo IS NULL OR cap_kobo >= 0),
  is_active boolean NOT NULL DEFAULT true,
  priority integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS fee_rules_active_range_idx ON public.fee_rules(is_active, priority, min_price_kobo, max_price_kobo);

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  processing_bps integer NOT NULL DEFAULT 150 CHECK (processing_bps >= 0),
  processing_fixed_kobo bigint NOT NULL DEFAULT 10000 CHECK (processing_fixed_kobo >= 0),
  processing_cap_kobo bigint CHECK (processing_cap_kobo IS NULL OR processing_cap_kobo >= 0),
  free_ticket_processing_fee_kobo bigint NOT NULL DEFAULT 0 CHECK (free_ticket_processing_fee_kobo >= 0),
  processing_fee_bearer text NOT NULL DEFAULT 'PASS' CHECK (processing_fee_bearer IN ('ABSORB', 'PASS')),
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.platform_settings(id) VALUES (1) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.fee_rules(name,min_price_kobo,max_price_kobo,percentage_bps,fixed_fee_kobo,cap_kobo,is_active,priority)
VALUES
 ('low_price_default',1,199999,400,10000,NULL,true,10),
 ('mid_range_default',200000,1500000,600,10000,NULL,true,20),
 ('high_price_default',1500001,NULL,500,10000,500000,true,30)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.fee_quote_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL,
  organizer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  idempotency_key text,
  quantity integer NOT NULL CHECK (quantity > 0),
  quote jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS fee_quote_audit_idempotency_key_idx
  ON public.fee_quote_audit(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS fee_quote_audit_created_at_idx ON public.fee_quote_audit(created_at DESC);

ALTER TABLE public.fee_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_quote_audit ENABLE ROW LEVEL SECURITY;
-- No browser role may change pricing, settings or audit records. Server routes use service role.
REVOKE ALL ON public.fee_rules, public.platform_settings, public.fee_quote_audit FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fee_rules, public.platform_settings TO service_role;
GRANT SELECT, INSERT ON public.fee_quote_audit TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.fee_quote_audit_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.touch_fee_rule_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS fee_rules_touch_updated_at ON public.fee_rules;
CREATE TRIGGER fee_rules_touch_updated_at BEFORE UPDATE ON public.fee_rules
FOR EACH ROW EXECUTE FUNCTION public.touch_fee_rule_updated_at();
