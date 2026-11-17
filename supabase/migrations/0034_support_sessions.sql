-- =====================================================================
-- 0034: Support mode: the Retexia team opens a customer's panels as them.
--
-- An admin or owner starts a session in admin.retexia.com (with a reason).
-- They get a one-time link (10 minutes) to a panel; opening it there, while
-- signed in as themselves, gives that browser a support cookie for up to
-- 60 minutes. The panels then show the customer's account (with a banner)
-- to that team member only. Their own login is never replaced, and the
-- customer's password, email and payments stay out of reach (those live on
-- retexia.com, not in the panels).
--
-- Only hashes of the link and the cookie are stored. Service role only.
-- =====================================================================

create table if not exists public.support_sessions (
  id           uuid primary key default gen_random_uuid(),
  staff_id     uuid not null references auth.users (id) on delete cascade,
  customer_id  uuid not null references auth.users (id) on delete cascade,
  reason       text not null check (char_length(btrim(reason)) between 3 and 300),
  link_hash    text not null unique,
  cookie_hash  text unique,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null,
  claimed_at   timestamptz,
  ended_at     timestamptz,
  check (staff_id <> customer_id),
  check (expires_at > created_at and expires_at <= created_at + interval '4 hours')
);
create index if not exists support_sessions_customer_idx on public.support_sessions (customer_id, created_at desc);
create index if not exists support_sessions_staff_idx on public.support_sessions (staff_id, created_at desc);

alter table public.support_sessions enable row level security;

-- The team can see who opened which account and why (admin "Activity"); nobody writes except the server.
drop policy if exists "staff read support sessions" on public.support_sessions;
create policy "staff read support sessions" on public.support_sessions
  for select to authenticated using (public.has_role(array['admin', 'owner']));

revoke insert, update, delete on public.support_sessions from anon, authenticated;
grant select on public.support_sessions to authenticated;
grant all on public.support_sessions to service_role;

comment on table public.support_sessions is 'Support mode: a team member (admin/owner) opening a customer''s product panels as that customer, with a reason. Link valid 10 minutes, session up to 60. Hashes only.';
