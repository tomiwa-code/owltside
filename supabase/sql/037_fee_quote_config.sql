-- 037_fee_quote_config.sql
--
-- Read-only fee configuration for the public quote endpoint.
--
-- Why: `POST /api/v1/fees/quotes` needs the active fee rules and the
-- processing policy. Reading `public.fee_rules` / `public.platform_settings`
-- directly requires the service-role key (RLS is on and the tables are revoked
-- from anon/authenticated, which must stay that way for writes). Deployments
-- whose web environment only has PUBLIC_SUPABASE_URL + the anon key therefore
-- failed every quote with "Ticket fees are temporarily unavailable" even
-- though the database priced checkouts correctly.
--
-- `public.fee_quote_config()` returns the same, already-public pricing data as
-- a single SECURITY DEFINER read. It exposes nothing secret (the rates are
-- shown to buyers in the fee breakdown), takes no arguments, cannot write, and
-- is the only database access the browser roles get to the fee tables.
--
-- Safe to run repeatedly: `create or replace`, no table or data changes.

create or replace function public.fee_quote_config()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'rules', coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'id', r.id,
                   'name', r.name,
                   'minPriceKobo', r.min_price_kobo,
                   'maxPriceKobo', r.max_price_kobo,
                   'percentageBps', r.percentage_bps,
                   'fixedFeeKobo', r.fixed_fee_kobo,
                   'capKobo', r.cap_kobo,
                   'isActive', r.is_active,
                   'priority', r.priority
                 )
                 order by r.priority asc
               )
          from public.fee_rules r
         where r.is_active
      ),
      '[]'::jsonb
    ),
    'policy', (
      select jsonb_build_object(
               'processingBps', p.processing_bps,
               'processingFixedKobo', p.processing_fixed_kobo,
               'processingCapKobo', p.processing_cap_kobo,
               'freeTicketProcessingFeeKobo', p.free_ticket_processing_fee_kobo,
               'processingFeeBearer', p.processing_fee_bearer,
               'currency', p.currency
             )
        from public.platform_settings p
       where p.id = 1
    )
  );
$$;

revoke all on function public.fee_quote_config() from public;
grant execute on function public.fee_quote_config() to anon, authenticated, service_role;

notify pgrst, 'reload schema';
