-- Replace the legacy hard-coded checkout formula inside the existing reservation RPC.
-- Quotes/order amounts remain server-authoritative and the RPC's idempotency lock is preserved.
DO $$
DECLARE
  v_source text;
  v_old text := $old$
  -- Matches the checkout's long-standing maths: buyers pay the organiser share
  -- plus a platform fee of 5% + ₦100 per paid pass; free passes carry none.
  v_net := greatest(0, v_gross - v_discount);
  v_fee := case when v_gross <= 0 then 0 else round(v_gross * 0.05) + 100 * v_total_qty end;
  v_grand := greatest(0, v_gross + v_fee - v_discount);
  v_amount_kobo := round(v_grand * 100)::bigint;
$old$;
  v_new text := $new$
  -- Price every ticket against the same editable rule rows used by fee quotes.
  v_platform_kobo := 0;
  v_processing_kobo := 0;
  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_qty := (v_item ->> 'qty')::int;
    select t into v_tier from jsonb_array_elements(v_event.tiers) t where t ->> 'id' = v_item ->> 'tierId';
    v_price_kobo := round((v_tier ->> 'price')::numeric * 100)::bigint;
    if v_price_kobo < 0 then raise exception 'Ticket price cannot be negative'; end if;
    if v_price_kobo > 0 then
      select * into v_rule from public.fee_rules
       where is_active and v_price_kobo >= min_price_kobo
         and (max_price_kobo is null or v_price_kobo <= max_price_kobo)
       order by priority asc limit 1;
      if not found then raise exception 'No active fee rule covers this ticket price'; end if;
      v_raw_fee_kobo := round(v_price_kobo::numeric * v_rule.percentage_bps / 10000)::bigint + v_rule.fixed_fee_kobo;
      v_platform_kobo := v_platform_kobo + least(v_raw_fee_kobo, coalesce(v_rule.cap_kobo, v_raw_fee_kobo)) * v_qty;
      select * into v_policy from public.platform_settings where id = 1;
      v_raw_processing_kobo := round(v_price_kobo::numeric * v_policy.processing_bps / 10000)::bigint + v_policy.processing_fixed_kobo;
      v_processing_kobo := v_processing_kobo + least(v_raw_processing_kobo, coalesce(v_policy.processing_cap_kobo, v_raw_processing_kobo)) * v_qty;
    else
      select * into v_policy from public.platform_settings where id = 1;
      v_processing_kobo := v_processing_kobo + least(v_policy.free_ticket_processing_fee_kobo, coalesce(v_policy.processing_cap_kobo, v_policy.free_ticket_processing_fee_kobo)) * v_qty;
    end if;
  end loop;
  v_fee := v_platform_kobo / 100.0;
  v_processing := v_processing_kobo / 100.0;
  v_net := v_gross - v_discount
    - case when v_event.fee_bearer = 'ABSORB' then v_fee else 0 end
    - case when v_policy.processing_fee_bearer = 'ABSORB' then v_processing else 0 end;
  v_grand := greatest(0, v_gross - v_discount
    + case when v_event.fee_bearer = 'PASS' then v_fee else 0 end
    + case when v_policy.processing_fee_bearer = 'PASS' then v_processing else 0 end);
  v_amount_kobo := round(v_grand * 100)::bigint;
$new$;
BEGIN
  v_source := pg_get_functiondef('public.create_pending_order(text,jsonb,text,text)'::regprocedure);
  v_source := replace(v_source, '  v_fee numeric := 0;',
    '  v_fee numeric := 0;' || E'\n  v_processing numeric := 0;\n  v_platform_kobo bigint := 0;\n  v_processing_kobo bigint := 0;\n  v_price_kobo bigint := 0;\n  v_raw_fee_kobo bigint := 0;\n  v_raw_processing_kobo bigint := 0;\n  v_rule public.fee_rules%rowtype;\n  v_policy public.platform_settings%rowtype;');
  IF position(v_old in v_source) = 0 THEN
    RAISE EXCEPTION 'Could not patch create_pending_order fee calculation; expected legacy block was not found';
  END IF;
  v_source := replace(v_source, v_old, v_new);
  v_source := replace(v_source,
    '  v_amount_kobo := round(v_grand * 100)::bigint;',
    '  v_amount_kobo := round(v_grand * 100)::bigint;' || E'\n  insert into public.fee_quote_audit(event_id, organizer_id, idempotency_key, quantity, quote) values (v_event.id, v_event.organizer_id, case when v_key is null then null else ''checkout:'' || v_key end, v_total_qty, jsonb_build_object(''ticketPriceKobo'', round((v_gross - v_discount) * 100)::bigint, ''platformFeeKobo'', v_platform_kobo, ''processingFeeKobo'', v_processing_kobo, ''buyerTotalKobo'', v_amount_kobo, ''organizerNetKobo'', round(v_net * 100)::bigint, ''feeBearer'', v_event.fee_bearer, ''currency'', ''NGN''));');
  EXECUTE v_source;
END $$;
