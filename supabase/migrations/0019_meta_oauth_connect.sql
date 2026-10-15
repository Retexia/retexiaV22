-- =====================================================================
-- 0019: "Connect Facebook & Instagram" (OAuth) saves Pages with
-- post.admin_connect_page(), from the website or from the n8n worker.
--
--   * n8n may run post.admin_connect_page() (the OAuth exchange can run there,
--     so the Meta app secret never has to be on the website);
--   * post.enforce_account_limit(): after a connect, only as many accounts as
--     the plan allows stay switched on (the ones connected last); the owner can
--     choose others on the Accounts page. Limits as in apps/panels/lib/post/plans.ts.
-- Safe to run again. Run after 0016.
-- =====================================================================

create or replace function post.enforce_account_limit(p_business uuid) returns int
language plpgsql volatile security definer set search_path = post, public as $$
declare
  v_limit int;
  v_off int;
begin
  select case b.plan::text when 'pro' then 10 when 'growth' then 4 else 2 end into v_limit
    from post.businesses b where b.id = p_business;
  if v_limit is null then return 0; end if;
  with ranked as (
    select a.id, row_number() over (order by a.updated_at desc, a.created_at desc, a.platform) as n
      from post.social_accounts a
     where a.business_id = p_business and a.enabled and a.status = 'connected'
  )
  update post.social_accounts a set enabled = false
    from ranked r
   where r.id = a.id and r.n > v_limit;
  get diagnostics v_off = row_count;
  return v_off;
end $$;

revoke execute on function post.enforce_account_limit(uuid) from public, anon, authenticated;
grant execute on function post.enforce_account_limit(uuid) to service_role, post_n8n;
grant execute on function post.admin_connect_page(uuid, text, text, text, text, text) to post_n8n;
