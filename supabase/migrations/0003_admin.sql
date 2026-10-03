-- =============================================================================
-- Retexia admin panel (admin.retexia.com)
-- -----------------------------------------------------------------------------
-- Staff roles, the order workflow, payments and receipts, product
-- extensibility (service fields, n8n actions, private secrets), notifications,
-- audit log, admin RPCs and the matching Row Level Security.
--
-- Safe to run more than once. Never edit 0001/0002: change things here or in
-- a later migration. See docs/ADMIN_PLAN.md for how this maps to the spec.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Roles
-- -----------------------------------------------------------------------------

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('customer', 'support', 'editor', 'admin', 'owner'));
comment on column public.profiles.role is
  'customer, support, editor, admin or owner. Staff roles open admin.retexia.com. Only an owner can change roles.';

-- The caller's role when it is a staff role (null for customers and visitors).
create or replace function public.staff_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role from public.profiles where id = (select auth.uid()) and role <> 'customer';
$$;
comment on function public.staff_role() is 'The signed-in user''s staff role, or null.';

create or replace function public.has_role(roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select role from public.profiles where id = (select auth.uid())) = any (roles), false);
$$;
comment on function public.has_role(text[]) is 'True when the signed-in user has one of the given roles.';

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role(array['support', 'editor', 'admin', 'owner']);
$$;
comment on function public.is_staff() is 'True for any Retexia team member (support, editor, admin, owner).';

-- Existing policies use is_admin(): it now means admin or owner.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role(array['admin', 'owner']);
$$;
comment on function public.is_admin() is 'True for admins and owners.';

-- Trusted callers: dashboard/service role, or staff who handle requests.
create or replace function public.is_privileged()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.request_role() not in ('anon', 'authenticated')
      or public.has_role(array['support', 'admin', 'owner']);
$$;
comment on function public.is_privileged() is 'True for the dashboard, service role, support, admins and owners.';

-- Profiles: only an owner changes roles; there is always at least one owner.
create or replace function public.protect_profile_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.role is distinct from old.role and not public.has_role(array['owner']) then
      raise exception 'Only an owner can change roles' using errcode = '42501';
    end if;
    if not public.is_admin() then
      new.email := old.email;
    end if;
    new.id := old.id;
    new.created_at := old.created_at;
  end if;
  if old.role = 'owner' and new.role is distinct from 'owner'
     and (select count(*) from public.profiles where role = 'owner') <= 1 then
    raise exception 'There must always be at least one owner' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create or replace function public.protect_last_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'owner' and (select count(*) from public.profiles where role = 'owner') <= 1 then
    raise exception 'There must always be at least one owner' using errcode = 'P0001';
  end if;
  return old;
end;
$$;

drop trigger if exists protect_last_owner on public.profiles;
create trigger protect_last_owner
  before delete on public.profiles
  for each row execute function public.protect_last_owner();

-- -----------------------------------------------------------------------------
-- 2. Settings and navigation additions
-- -----------------------------------------------------------------------------

alter table public.site_settings
  add column if not exists payment_instructions text,
  add column if not exists invoice_business_name text,
  add column if not exists invoice_address text,
  add column if not exists invoice_footer text,
  add column if not exists invoice_logo_url text,
  add column if not exists receipt_prefix text not null default 'RCT';

-- Notification settings live apart from site_settings (which the website reads
-- with the public key) so team email addresses are never public.
create table if not exists public.staff_settings (
  id smallint primary key default 1 check (id = 1),
  staff_notification_emails text,
  notification_settings jsonb not null default
    '{"order.created": {"email": true, "whatsapp": false},
      "order.status_changed": {"email": true, "whatsapp": true},
      "payment.confirmed": {"email": true, "whatsapp": false},
      "staff_events": ["order.created", "contact.created", "payment.proof_uploaded"]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.staff_settings is 'Team-only settings (one row). Not readable by visitors.';
insert into public.staff_settings (id) values (1) on conflict (id) do nothing;

comment on column public.site_settings.payment_instructions is 'Markdown shown to customers while a request is awaiting payment (bank details, what to write as reference).';
comment on column public.site_settings.invoice_business_name is 'Business name printed on receipts.';
comment on column public.site_settings.invoice_address is 'Address printed on receipts.';
comment on column public.site_settings.invoice_footer is 'Small print at the bottom of receipts.';
comment on column public.site_settings.invoice_logo_url is 'Logo printed on receipts (falls back to the site logo).';
comment on column public.site_settings.receipt_prefix is 'Receipt number prefix, e.g. RCT → RCT-2026-0001.';
comment on column public.staff_settings.staff_notification_emails is 'Comma-separated team emails that get staff notifications.';
comment on column public.staff_settings.notification_settings is 'Per event: which customer channels are on ({"email": true, "whatsapp": false}); staff_events lists events the team is told about.';

alter table public.navigation_items
  add column if not exists signed_in_label text,
  add column if not exists signed_in_href text;
comment on column public.navigation_items.signed_in_label is 'Optional: label shown instead when the visitor is signed in (e.g. My account). Empty = unchanged.';
comment on column public.navigation_items.signed_in_href is 'Optional: link used instead when the visitor is signed in (e.g. /account).';

update public.navigation_items
   set signed_in_label = 'My account', signed_in_href = '/account'
 where location = 'header' and kind = 'button' and signed_in_label is null;

-- -----------------------------------------------------------------------------
-- 3. Orders: new columns and keeping records when a login is deleted
-- -----------------------------------------------------------------------------

alter table public.orders
  add column if not exists assigned_to uuid references public.profiles (id) on delete set null,
  add column if not exists service_data jsonb not null default '{}'::jsonb,
  add column if not exists paused_at timestamptz,
  add column if not exists cancel_reason text,
  add column if not exists price_override_reason text,
  add column if not exists source text not null default 'website';

alter table public.orders drop constraint if exists orders_source_check;
alter table public.orders
  add constraint orders_source_check check (source in ('website', 'admin', 'whatsapp', 'referral'));

comment on column public.orders.assigned_to is 'Team member looking after this request.';
comment on column public.orders.service_data is 'Product-specific setup values (see product_service_fields). Secrets are never stored here.';
comment on column public.orders.paused_at is 'When the subscription was paused.';
comment on column public.orders.cancel_reason is 'Why the request was cancelled or not accepted.';
comment on column public.orders.price_override_reason is 'Why the package, billing or price was changed by the team.';
comment on column public.orders.source is 'Where the request came from: website, admin, whatsapp or referral.';

-- Deleting a login keeps its orders for accounting (user_id becomes empty).
alter table public.orders alter column user_id drop not null;
alter table public.orders drop constraint if exists orders_user_id_fkey;
alter table public.orders
  add constraint orders_user_id_fkey foreign key (user_id) references auth.users (id) on delete set null;

create index if not exists orders_assigned_to_idx on public.orders (assigned_to);
create index if not exists orders_renews_at_idx on public.orders (renews_at) where status = 'active';

-- -----------------------------------------------------------------------------
-- 4. Order workflow
-- -----------------------------------------------------------------------------

create table if not exists public.order_status_transitions (
  id uuid primary key default gen_random_uuid(),
  from_status text not null references public.order_statuses (key) on update cascade on delete cascade,
  to_status text not null references public.order_statuses (key) on update cascade on delete cascade,
  action_label text not null,
  min_roles text[] not null default array['support', 'admin', 'owner'],
  requires_confirmed_payment boolean not null default false,
  requires_reason boolean not null default false,
  notify_customer_default boolean not null default true,
  customer_note_template text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (from_status, to_status)
);
comment on table public.order_status_transitions is 'Which status changes the team may make, with button labels. Status changes from the admin go only through admin_change_order_status().';
comment on column public.order_status_transitions.action_label is 'Button text in the admin, e.g. Approve.';
comment on column public.order_status_transitions.min_roles is 'Roles allowed to make this change, e.g. {support,admin,owner}.';
comment on column public.order_status_transitions.requires_confirmed_payment is 'Needs a confirmed setup or subscription payment first (admins can override with a reason).';
comment on column public.order_status_transitions.requires_reason is 'A note is required (e.g. why a request is not accepted).';
comment on column public.order_status_transitions.notify_customer_default is 'Whether "Notify customer" starts switched on.';
comment on column public.order_status_transitions.customer_note_template is 'Starting text for the customer-visible note.';

create table if not exists public.order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  body text not null check (char_length(body) between 1 and 10000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.order_notes is 'Internal notes on a request. Never shown to customers.';

create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  body text not null check (char_length(body) between 1 and 10000),
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.customer_notes is 'Internal notes about a customer. Never shown to customers.';

create index if not exists order_status_transitions_from_idx on public.order_status_transitions (from_status, sort_order);
create index if not exists order_status_transitions_to_idx on public.order_status_transitions (to_status);
create index if not exists order_notes_order_id_idx on public.order_notes (order_id, created_at);
create index if not exists order_notes_author_id_idx on public.order_notes (author_id);
create index if not exists customer_notes_user_id_idx on public.customer_notes (user_id, created_at);
create index if not exists customer_notes_author_id_idx on public.customer_notes (author_id);

-- -----------------------------------------------------------------------------
-- 5. Payments and receipts
-- -----------------------------------------------------------------------------

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete restrict,
  user_id uuid references auth.users (id) on delete set null,
  kind text not null default 'setup_fee' check (kind in ('setup_fee', 'subscription', 'addon', 'refund', 'other')),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text,
  method text not null default 'bank_transfer' check (method in ('bank_transfer', 'cash', 'card', 'online_gateway', 'other')),
  reference text,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed', 'refunded')),
  paid_at timestamptz,
  confirmed_at timestamptz,
  period_start timestamptz,
  period_end timestamptz,
  receipt_number text unique,
  proof_path text,
  note text,
  recorded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.payments is 'Money received (or refunded) for a request. Confirming a payment gives it a receipt number.';
comment on column public.payments.kind is 'setup_fee, subscription, addon, refund or other. A confirmed subscription payment extends the request''s renews_at.';
comment on column public.payments.reference is 'Bank or gateway reference.';
comment on column public.payments.status is 'pending (e.g. proof uploaded by the customer), confirmed, failed or refunded.';
comment on column public.payments.period_start is 'Subscription payments: start of the paid period.';
comment on column public.payments.period_end is 'Subscription payments: end of the paid period (becomes the request''s renews_at).';
comment on column public.payments.receipt_number is 'Generated on confirm, e.g. RCT-2026-0001.';
comment on column public.payments.proof_path is 'Payment proof file in the private payment-proofs bucket.';

create table if not exists public.receipt_counters (
  prefix text not null,
  year int not null,
  last_value int not null default 0,
  primary key (prefix, year)
);
comment on table public.receipt_counters is 'Internal: last receipt number per prefix and year. Do not edit.';

create index if not exists payments_order_id_idx on public.payments (order_id, created_at);
create index if not exists payments_user_id_idx on public.payments (user_id);
create index if not exists payments_recorded_by_idx on public.payments (recorded_by);
create index if not exists payments_status_idx on public.payments (status, created_at desc);

-- -----------------------------------------------------------------------------
-- 6. Product extensibility: service fields, actions, secrets, runs
-- -----------------------------------------------------------------------------

create table if not exists public.product_service_fields (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  type text not null default 'text' check (type in ('text', 'textarea', 'number', 'url', 'select', 'toggle', 'date', 'secret')),
  options jsonb not null default '[]'::jsonb,
  help_text text,
  visible_to_customer boolean not null default false,
  required_for_status text references public.order_statuses (key) on update cascade on delete set null,
  sort_order int not null default 0,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, key)
);
comment on table public.product_service_fields is 'Per-product setup values the team fills in on a request (stored in orders.service_data; secrets in private.order_secrets).';
comment on column public.product_service_fields.type is 'text, textarea, number, url, select, toggle, date or secret. Secrets are stored privately and shown masked.';
comment on column public.product_service_fields.options is 'Choices for select: [{"value": "a", "label": "A"}].';
comment on column public.product_service_fields.visible_to_customer is 'Shown read-only on the customer''s order page (never for secrets).';
comment on column public.product_service_fields.required_for_status is 'The request cannot move to this status until the field is filled (e.g. active).';

create table if not exists public.product_actions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  description text,
  allowed_statuses text[] not null default '{}',
  min_roles text[] not null default array['support', 'admin', 'owner'],
  confirm_text text,
  payload_fields text[] not null default '{}',
  on_success_status text references public.order_statuses (key) on update cascade on delete set null,
  on_success_note text,
  is_enabled boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, key)
);
comment on table public.product_actions is 'Buttons on a request that call the product''s n8n workflow. The webhook URL and signing secret live in private.product_action_secrets.';
comment on column public.product_actions.allowed_statuses is 'Statuses where the button is available. Empty = any status.';
comment on column public.product_actions.payload_fields is 'Order, answer, service_data or secret keys to send. Empty = the full order context (secrets are only sent when listed).';
comment on column public.product_actions.on_success_status is 'Move the request to this status when the workflow succeeds.';
comment on column public.product_actions.is_enabled is 'Off until a webhook URL is saved and the action is tested.';

create table if not exists public.action_runs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  action_id uuid references public.product_actions (id) on delete set null,
  action_key text,
  action_label text,
  status text not null default 'queued' check (status in ('queued', 'running', 'succeeded', 'failed')),
  request jsonb,
  response jsonb,
  error text,
  triggered_by uuid references auth.users (id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.action_runs is 'Every call to a product action (n8n), with what was sent (without secrets) and what came back.';

create index if not exists product_service_fields_product_idx on public.product_service_fields (product_id, sort_order);
create index if not exists product_actions_product_idx on public.product_actions (product_id, sort_order);
create index if not exists action_runs_order_id_idx on public.action_runs (order_id, created_at desc);
create index if not exists action_runs_action_id_idx on public.action_runs (action_id);
create index if not exists action_runs_triggered_by_idx on public.action_runs (triggered_by);

-- Private schema: not exposed through the Supabase Data API.
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;
comment on schema private is 'Secrets. Not exposed through the API; read only through svc_* (service role) and role-checked admin_* functions.';

create table if not exists private.product_action_secrets (
  action_id uuid primary key references public.product_actions (id) on delete cascade,
  webhook_url text,
  signing_secret text,
  updated_by uuid,
  updated_at timestamptz not null default now()
);

create table if not exists private.order_secrets (
  order_id uuid not null references public.orders (id) on delete cascade,
  key text not null,
  value text not null,
  updated_by uuid,
  updated_at timestamptz not null default now(),
  primary key (order_id, key)
);

create table if not exists private.integration_settings (
  id int primary key default 1 check (id = 1),
  n8n_callback_secret text,
  notifications_webhook_url text,
  updated_at timestamptz not null default now()
);
insert into private.integration_settings (id) values (1) on conflict (id) do nothing;

alter table private.product_action_secrets enable row level security;
alter table private.order_secrets enable row level security;
alter table private.integration_settings enable row level security;

-- -----------------------------------------------------------------------------
-- 7. Notifications, audit log, saved views, media
-- -----------------------------------------------------------------------------

create table if not exists public.notifications_outbox (
  id uuid primary key default gen_random_uuid(),
  event text not null,
  channel text not null default 'email' check (channel in ('email', 'whatsapp')),
  recipient text,
  user_id uuid references auth.users (id) on delete set null,
  order_id uuid references public.orders (id) on delete set null,
  subject text,
  body text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts int not null default 0,
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.notifications_outbox is 'Emails and WhatsApp messages waiting to be sent. A Database Webhook on INSERT hands them to n8n, which reports back through /api/n8n/callback.';

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  actor_role text,
  action text not null,
  table_name text,
  record_id text,
  summary text,
  before jsonb,
  after jsonb,
  ip text,
  user_agent text,
  created_at timestamptz not null default now()
);
comment on table public.audit_logs is 'Who changed what and when. Written by triggers and the admin app; nobody can edit or delete rows.';

create table if not exists public.admin_saved_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page text not null,
  name text not null,
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.admin_saved_views is 'Saved table filters per team member (e.g. "Lingo · awaiting payment").';

create table if not exists public.media (
  id uuid primary key default gen_random_uuid(),
  path text not null unique,
  url text not null,
  alt text,
  width int,
  height int,
  size int,
  mime text,
  uploaded_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.media is 'Files in the site-assets bucket with their alt text and size.';

create index if not exists notifications_outbox_status_idx on public.notifications_outbox (status, created_at);
create index if not exists notifications_outbox_user_id_idx on public.notifications_outbox (user_id);
create index if not exists notifications_outbox_order_id_idx on public.notifications_outbox (order_id);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_record_idx on public.audit_logs (table_name, record_id);
create index if not exists audit_logs_actor_idx on public.audit_logs (actor_id);
create index if not exists admin_saved_views_user_idx on public.admin_saved_views (user_id, page);
create index if not exists media_uploaded_by_idx on public.media (uploaded_by);

-- -----------------------------------------------------------------------------
-- 8. updated_at triggers on the new tables
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'order_status_transitions', 'order_notes', 'customer_notes', 'payments', 'product_service_fields',
    'product_actions', 'action_runs', 'notifications_outbox', 'admin_saved_views', 'media', 'staff_settings'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------------------
-- 9. Audit trigger
-- -----------------------------------------------------------------------------

create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_role text;
  v_headers jsonb;
  v_before jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_after jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
begin
  -- Skip updates that change nothing but updated_at.
  if tg_op = 'UPDATE' and (v_before - 'updated_at') = (v_after - 'updated_at') then
    return null;
  end if;
  if v_uid is not null then
    select email, role into v_email, v_role from public.profiles where id = v_uid;
  end if;
  begin
    v_headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    v_headers := null;
  end;
  insert into public.audit_logs (actor_id, actor_email, actor_role, action, table_name, record_id, before, after, ip, user_agent)
  values (
    v_uid,
    v_email,
    coalesce(v_role, case when v_uid is null then 'system' end),
    lower(tg_op),
    tg_table_name,
    coalesce(v_after ->> 'id', v_before ->> 'id', v_after ->> 'key', v_before ->> 'key'),
    v_before,
    v_after,
    split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1),
    v_headers ->> 'user-agent'
  );
  return null;
end;
$$;
comment on function public.audit_row_change() is 'Writes an audit_logs row for every insert, update and delete on admin-editable tables.';

do $$
declare
  t text;
begin
  foreach t in array array[
    'site_settings', 'site_strings', 'navigation_items', 'pages', 'page_sections', 'services', 'testimonials',
    'faqs', 'products', 'product_features', 'packages', 'package_features', 'forms', 'form_steps', 'form_fields',
    'order_statuses', 'order_status_transitions', 'product_service_fields', 'product_actions', 'orders',
    'payments', 'profiles', 'media', 'contact_messages', 'order_notes', 'customer_notes', 'staff_settings'
  ]
  loop
    execute format('drop trigger if exists audit_row_change on public.%I', t);
    execute format(
      'create trigger audit_row_change after insert or update or delete on public.%I for each row execute function public.audit_row_change()',
      t
    );
  end loop;
end;
$$;

-- Explicit audit entry (status changes, secret reveals, auth actions).
create or replace function public._audit(
  p_action text,
  p_table text,
  p_record text,
  p_summary text,
  p_before jsonb default null,
  p_after jsonb default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_role text;
begin
  if v_uid is not null then
    select email, role into v_email, v_role from public.profiles where id = v_uid;
  end if;
  insert into public.audit_logs (actor_id, actor_email, actor_role, action, table_name, record_id, summary, before, after)
  values (v_uid, v_email, coalesce(v_role, 'system'), p_action, p_table, p_record, p_summary, p_before, p_after);
end;
$$;

-- -----------------------------------------------------------------------------
-- 10. Notifications
-- -----------------------------------------------------------------------------

-- Queue customer notifications for an event, following staff_settings.notification_settings.
create or replace function public._notify_customer(
  p_event text,
  p_order_id uuid,
  p_user_id uuid,
  p_subject text,
  p_body text,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cfg jsonb := coalesce(
    (select notification_settings -> p_event from public.staff_settings where id = 1),
    '{"email": true}'::jsonb
  );
  v_profile public.profiles%rowtype;
begin
  if p_user_id is null then
    return;
  end if;
  select * into v_profile from public.profiles where id = p_user_id;
  if not found then
    return;
  end if;
  if coalesce((v_cfg ->> 'email')::boolean, true) and v_profile.email is not null then
    insert into public.notifications_outbox (event, channel, recipient, user_id, order_id, subject, body, payload)
    values (p_event, 'email', v_profile.email, p_user_id, p_order_id, p_subject, p_body, p_payload);
  end if;
  if coalesce((v_cfg ->> 'whatsapp')::boolean, false) and coalesce(v_profile.whatsapp, v_profile.phone) is not null then
    insert into public.notifications_outbox (event, channel, recipient, user_id, order_id, subject, body, payload)
    values (p_event, 'whatsapp', coalesce(v_profile.whatsapp, v_profile.phone), p_user_id, p_order_id, p_subject, p_body, p_payload);
  end if;
end;
$$;

-- Queue staff notifications (emails in staff_settings.staff_notification_emails).
create or replace function public._notify_staff(
  p_event text,
  p_subject text,
  p_body text,
  p_order_id uuid default null,
  p_payload jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_settings public.staff_settings%rowtype;
  v_email text;
begin
  select * into v_settings from public.staff_settings where id = 1;
  if not found or v_settings.staff_notification_emails is null then
    return;
  end if;
  if not coalesce(v_settings.notification_settings -> 'staff_events' ? p_event, false) then
    return;
  end if;
  foreach v_email in array string_to_array(v_settings.staff_notification_emails, ',')
  loop
    v_email := trim(v_email);
    if v_email <> '' then
      insert into public.notifications_outbox (event, channel, recipient, order_id, subject, body, payload)
      values (p_event, 'email', v_email, p_order_id, p_subject, p_body, p_payload || jsonb_build_object('audience', 'staff'));
    end if;
  end loop;
end;
$$;

create or replace function public.notify_order_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product text := (select name from public.products where id = new.product_id);
begin
  perform public._notify_customer(
    'order.created', new.id, new.user_id,
    'We received your request ' || new.ref,
    'Thank you. We received your ' || coalesce(v_product, '') || ' request (' || new.ref || ') and will review it within one working day.',
    jsonb_build_object('ref', new.ref, 'status', new.status)
  );
  perform public._notify_staff(
    'order.created',
    'New request ' || new.ref,
    'A new ' || coalesce(v_product, '') || ' request (' || new.ref || ', ' || coalesce(new.package_name, '') || ') was submitted.',
    new.id,
    jsonb_build_object('ref', new.ref, 'source', new.source)
  );
  return null;
end;
$$;

drop trigger if exists notify_order_created on public.orders;
create trigger notify_order_created
  after insert on public.orders
  for each row execute function public.notify_order_created();

create or replace function public.notify_contact_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._notify_staff(
    'contact.created',
    'New message from ' || new.name,
    left(new.message, 500),
    null,
    jsonb_build_object('contact_message_id', new.id, 'email', new.email)
  );
  return null;
end;
$$;

drop trigger if exists notify_contact_created on public.contact_messages;
create trigger notify_contact_created
  after insert on public.contact_messages
  for each row execute function public.notify_contact_created();

-- -----------------------------------------------------------------------------
-- 11. Payment triggers: receipt numbers, periods, renewals
-- -----------------------------------------------------------------------------

create or replace function public.prepare_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_prefix text;
  v_year int := extract(year from now())::int;
  v_number int;
  v_becomes_confirmed boolean;
begin
  select * into v_order from public.orders where id = new.order_id;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  new.user_id := coalesce(new.user_id, v_order.user_id);
  new.currency := coalesce(new.currency, v_order.currency, (select currency_code from public.site_settings where id = 1), 'LKR');

  if tg_op = 'UPDATE' and new.status = 'refunded' and old.status <> 'refunded'
     and public.request_role() in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'Only an admin can refund a payment' using errcode = '42501';
  end if;

  v_becomes_confirmed := new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed');
  if v_becomes_confirmed then
    new.paid_at := coalesce(new.paid_at, now());
    new.confirmed_at := now();
    if new.receipt_number is null then
      v_prefix := coalesce(nullif(trim((select receipt_prefix from public.site_settings where id = 1)), ''), 'RCT');
      insert into public.receipt_counters (prefix, year, last_value)
      values (v_prefix, v_year, 1)
      on conflict (prefix, year) do update set last_value = public.receipt_counters.last_value + 1
      returning last_value into v_number;
      new.receipt_number := v_prefix || '-' || v_year || '-' || lpad(v_number::text, 4, '0');
    end if;
    if new.kind = 'subscription' then
      new.period_start := coalesce(new.period_start, v_order.renews_at, now());
      new.period_end := coalesce(
        new.period_end,
        new.period_start + case when v_order.billing_cycle = 'yearly' then interval '1 year' else interval '1 month' end
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists prepare_payment on public.payments;
create trigger prepare_payment
  before insert or update on public.payments
  for each row execute function public.prepare_payment();

create or replace function public.apply_payment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    select * into v_order from public.orders where id = new.order_id;
    if new.kind = 'subscription' and new.period_end is not null then
      update public.orders
         set renews_at = greatest(coalesce(renews_at, new.period_end), new.period_end)
       where id = new.order_id;
    end if;
    perform public._notify_customer(
      'payment.confirmed', new.order_id, new.user_id,
      'Payment received for ' || v_order.ref,
      'Thank you. We received ' || coalesce(new.currency, '') || ' ' || to_char(new.amount, 'FM999,999,990.00')
        || ' for ' || v_order.ref || '. Receipt ' || new.receipt_number || '.',
      jsonb_build_object('ref', v_order.ref, 'receipt_number', new.receipt_number, 'payment_id', new.id)
    );
  end if;
  return null;
end;
$$;

drop trigger if exists apply_payment on public.payments;
create trigger apply_payment
  after insert or update of status on public.payments
  for each row execute function public.apply_payment();

-- -----------------------------------------------------------------------------
-- 12. Staff views (all order columns, sign-in data) — rows only for staff
-- -----------------------------------------------------------------------------

drop view if exists public.staff_orders;
create view public.staff_orders as
select
  o.*,
  p.full_name as customer_name,
  p.email as customer_email,
  p.phone as customer_phone,
  p.whatsapp as customer_whatsapp,
  p.business_name as customer_business,
  pr.slug as product_slug,
  pr.name as product_name,
  pr.short_name as product_short_name,
  pr.code as product_code,
  st.label as status_label,
  st.tone as status_tone,
  coalesce(st.is_final, false) as status_is_final,
  a.full_name as assignee_name,
  case when o.billing_cycle = 'yearly' then round(o.price_amount / 12, 2) else o.price_amount end as monthly_value,
  (select count(*) from public.payments pay where pay.order_id = o.id and pay.status = 'pending')::int as pending_payments,
  (select coalesce(sum(case when pay.kind = 'refund' then -pay.amount else pay.amount end), 0)
     from public.payments pay where pay.order_id = o.id and pay.status = 'confirmed') as paid_total,
  lower(concat_ws(' ', o.ref, p.full_name, p.email, p.phone, p.whatsapp, p.business_name, o.package_name)) as search
from public.orders o
left join public.profiles p on p.id = o.user_id
join public.products pr on pr.id = o.product_id
left join public.order_statuses st on st.key = o.status
left join public.profiles a on a.id = o.assigned_to
where public.is_staff();
comment on view public.staff_orders is 'Every request with customer, product and status details. Returns rows only for staff.';

drop view if exists public.staff_customers;
create view public.staff_customers as
select
  p.id,
  p.full_name,
  p.email,
  p.phone,
  p.whatsapp,
  p.business_name,
  p.role,
  p.marketing_opt_in,
  p.avatar_url,
  p.created_at,
  p.updated_at,
  u.last_sign_in_at,
  u.email_confirmed_at,
  u.banned_until,
  coalesce(u.banned_until > now(), false) as is_banned,
  exists (select 1 from auth.mfa_factors f where f.user_id = p.id and f.status = 'verified') as mfa_enabled,
  (select coalesce(sum(case when pay.kind = 'refund' then -pay.amount else pay.amount end), 0)
     from public.payments pay where pay.user_id = p.id and pay.status = 'confirmed') as lifetime_paid,
  coalesce((select array_agg(distinct pr.slug order by pr.slug)
     from public.orders o join public.products pr on pr.id = o.product_id
    where o.user_id = p.id and o.status = 'active'), '{}') as active_products,
  (select count(*) from public.orders o where o.user_id = p.id)::int as orders_count,
  lower(concat_ws(' ', p.full_name, p.email, p.phone, p.whatsapp, p.business_name)) as search
from public.profiles p
left join auth.users u on u.id = p.id
where public.is_staff();
comment on view public.staff_customers is 'Profiles with sign-in data and totals. Returns rows only for staff.';

drop view if exists public.staff_payments;
create view public.staff_payments as
select
  pay.*,
  o.ref as order_ref,
  o.product_id,
  o.package_name,
  o.billing_cycle,
  pr.slug as product_slug,
  pr.short_name as product_short_name,
  p.full_name as customer_name,
  p.email as customer_email,
  p.business_name as customer_business,
  rb.full_name as recorded_by_name,
  case when pay.kind = 'refund' then -pay.amount else pay.amount end as signed_amount,
  lower(concat_ws(' ', o.ref, pay.receipt_number, pay.reference, p.full_name, p.email, p.business_name)) as search
from public.payments pay
join public.orders o on o.id = pay.order_id
join public.products pr on pr.id = o.product_id
left join public.profiles p on p.id = pay.user_id
left join public.profiles rb on rb.id = pay.recorded_by
where public.is_staff();
comment on view public.staff_payments is 'Payments with request, product and customer details. Returns rows only for staff.';

-- -----------------------------------------------------------------------------
-- 13. Order workflow functions
-- -----------------------------------------------------------------------------

-- Shared by admin_change_order_status (staff) and svc_apply_action_result (n8n).
create or replace function public._change_order_status(
  p_order_id uuid,
  p_to_status text,
  p_customer_note text,
  p_internal_note text,
  p_notify boolean,
  p_override_reason text,
  p_actor text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_tr public.order_status_transitions%rowtype;
  v_role text := public.staff_role();
  v_to public.order_statuses%rowtype;
  v_customer_note text := nullif(trim(coalesce(p_customer_note, '')), '');
  v_internal_note text := nullif(trim(coalesce(p_internal_note, '')), '');
  v_override text := nullif(trim(coalesce(p_override_reason, '')), '');
  v_missing text;
  v_paid boolean;
  v_event_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_order.status = p_to_status then
    raise exception 'The request is already in this status' using errcode = 'P0001';
  end if;

  select * into v_tr from public.order_status_transitions
   where from_status = v_order.status and to_status = p_to_status;
  if not found then
    raise exception 'A request cannot move from % to %', v_order.status, p_to_status using errcode = 'P0001';
  end if;

  if p_actor = 'staff' and not (coalesce(v_role, '') = any (v_tr.min_roles)) then
    raise exception 'Your role cannot make this change' using errcode = '42501';
  end if;

  if v_tr.requires_reason and v_customer_note is null and v_internal_note is null then
    raise exception 'Please give a reason' using errcode = 'P0001';
  end if;

  if v_tr.requires_confirmed_payment then
    select exists (
      select 1 from public.payments
       where order_id = p_order_id and status = 'confirmed' and kind in ('setup_fee', 'subscription')
    ) into v_paid;
    if not v_paid then
      if v_override is null or not (coalesce(v_role, '') in ('admin', 'owner')) then
        raise exception 'A confirmed payment is needed first. An admin can override this with a reason.' using errcode = 'P0001';
      end if;
    end if;
  end if;

  select string_agg(f.label, ', ' order by f.sort_order) into v_missing
    from public.product_service_fields f
   where f.product_id = v_order.product_id
     and f.required_for_status = p_to_status
     and f.is_visible
     and (
       (f.type <> 'secret' and nullif(trim(coalesce(v_order.service_data ->> f.key, '')), '') is null)
       or (f.type = 'secret' and not exists (
         select 1 from private.order_secrets s where s.order_id = v_order.id and s.key = f.key and s.value <> ''
       ))
     );
  if v_missing is not null then
    raise exception 'Fill in these setup fields first: %', v_missing using errcode = 'P0001';
  end if;

  select * into v_to from public.order_statuses where key = p_to_status;

  update public.orders
     set status = p_to_status,
         status_note = v_customer_note,
         starts_at = case when p_to_status = 'active' then coalesce(starts_at, now()) else starts_at end,
         renews_at = case
           when p_to_status = 'active' and renews_at is null then
             coalesce(starts_at, now()) + case when billing_cycle = 'yearly' then interval '1 year' else interval '1 month' end
           else renews_at end,
         paused_at = case when p_to_status = 'paused' then now() when p_to_status = 'active' then null else paused_at end,
         cancelled_at = case when p_to_status = 'cancelled' then now() else cancelled_at end,
         cancel_reason = case
           when p_to_status in ('cancelled', 'rejected') then coalesce(v_customer_note, v_internal_note, cancel_reason)
           else cancel_reason end
   where id = p_order_id;

  -- The timeline event written by log_order_event: make sure it carries this note and actor.
  select id into v_event_id from public.order_events
   where order_id = p_order_id and to_status = p_to_status
   order by created_at desc limit 1;
  update public.order_events
     set note = v_customer_note, created_by = auth.uid()
   where id = v_event_id;

  if v_internal_note is not null then
    insert into public.order_notes (order_id, author_id, body)
    values (p_order_id, auth.uid(), v_internal_note);
  end if;
  if v_override is not null and v_tr.requires_confirmed_payment and not coalesce(v_paid, true) then
    insert into public.order_notes (order_id, author_id, body)
    values (p_order_id, auth.uid(), 'Payment requirement overridden: ' || v_override);
  end if;

  perform public._audit(
    'status_change', 'orders', p_order_id::text,
    v_order.ref || ': ' || v_order.status || ' → ' || p_to_status || case when p_actor <> 'staff' then ' (by ' || p_actor || ')' else '' end,
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', p_to_status, 'customer_note', v_customer_note, 'override_reason', v_override)
  );

  if coalesce(p_notify, false) then
    perform public._notify_customer(
      'order.status_changed', p_order_id, v_order.user_id,
      'Update on your request ' || v_order.ref,
      coalesce(v_to.label, p_to_status) || '. ' || coalesce(v_to.description, '')
        || case when v_customer_note is not null then E'\n\n' || v_customer_note else '' end,
      jsonb_build_object('ref', v_order.ref, 'from_status', v_order.status, 'to_status', p_to_status, 'note', v_customer_note)
    );
  end if;

  return (select to_jsonb(o) from public.orders o where o.id = p_order_id);
end;
$$;

create or replace function public.admin_change_order_status(
  p_order_id uuid,
  p_to_status text,
  p_customer_note text default null,
  p_internal_note text default null,
  p_notify boolean default true,
  p_override_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'This area is for the Retexia team' using errcode = '42501';
  end if;
  return public._change_order_status(p_order_id, p_to_status, p_customer_note, p_internal_note, p_notify, p_override_reason, 'staff');
end;
$$;
comment on function public.admin_change_order_status(uuid, text, text, text, boolean, text) is
  'The only way the admin changes a request status: checks the transition, role, payment and required setup fields, then logs and notifies.';

create or replace function public.admin_assign_order(p_order_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role(array['support', 'admin', 'owner']) then
    raise exception 'Your role cannot assign requests' using errcode = '42501';
  end if;
  if p_user_id is not null and not exists (
    select 1 from public.profiles where id = p_user_id and role in ('support', 'admin', 'owner')
  ) then
    raise exception 'Requests can only be assigned to team members who handle requests' using errcode = 'P0001';
  end if;
  update public.orders set assigned_to = p_user_id where id = p_order_id;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
end;
$$;

-- Admins change package, billing, price, answers or dates (with a reason for money changes).
create or replace function public.admin_update_order(p_order_id uuid, p_changes jsonb, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_package public.packages%rowtype;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_money boolean := p_changes ?| array['package_id', 'billing_cycle', 'price_amount', 'setup_fee'];
  v_cycle text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change a request' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_money and v_reason is null then
    raise exception 'Please give a reason for changing the package, billing or price' using errcode = 'P0001';
  end if;

  v_cycle := coalesce(p_changes ->> 'billing_cycle', v_order.billing_cycle);
  if v_cycle not in ('monthly', 'yearly') then
    raise exception 'Billing must be monthly or yearly' using errcode = '22023';
  end if;

  if p_changes ? 'package_id' then
    select * into v_package from public.packages where id = (p_changes ->> 'package_id')::uuid;
    if not found or v_package.product_id <> v_order.product_id then
      raise exception 'That package does not belong to this product' using errcode = '22023';
    end if;
  else
    select * into v_package from public.packages where id = v_order.package_id;
  end if;
  if v_cycle = 'yearly' and v_package.price_yearly is null and not p_changes ? 'price_amount' then
    raise exception 'Yearly billing is not available for this package' using errcode = '22023';
  end if;

  update public.orders
     set package_id = v_package.id,
         package_name = case when p_changes ? 'package_id' then v_package.name else package_name end,
         billing_cycle = v_cycle,
         price_amount = case
           when p_changes ? 'price_amount' then (p_changes ->> 'price_amount')::numeric
           when p_changes ?| array['package_id', 'billing_cycle'] then
             case when v_cycle = 'yearly' then v_package.price_yearly else v_package.price_monthly end
           else price_amount end,
         setup_fee = case
           when p_changes ? 'setup_fee' then (p_changes ->> 'setup_fee')::numeric
           when p_changes ? 'package_id' then v_package.setup_fee
           else setup_fee end,
         answers = case when p_changes ? 'answers' then p_changes -> 'answers' else answers end,
         source = coalesce(p_changes ->> 'source', source),
         starts_at = case when p_changes ? 'starts_at' then (p_changes ->> 'starts_at')::timestamptz else starts_at end,
         renews_at = case when p_changes ? 'renews_at' then (p_changes ->> 'renews_at')::timestamptz else renews_at end,
         admin_note = case when p_changes ? 'admin_note' then p_changes ->> 'admin_note' else admin_note end,
         price_override_reason = case when v_money then v_reason else price_override_reason end
   where id = p_order_id;

  if v_reason is not null then
    insert into public.order_notes (order_id, author_id, body)
    values (p_order_id, auth.uid(), 'Changed ' || (select string_agg(k, ', ') from jsonb_object_keys(p_changes) k) || ': ' || v_reason);
  end if;

  return (select to_jsonb(o) from public.orders o where o.id = p_order_id);
end;
$$;

-- Support and admins fill in a request's product setup fields.
create or replace function public.admin_set_service_data(p_order_id uuid, p_values jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_field public.product_service_fields%rowtype;
  v_key text;
  v_value jsonb;
  v_data jsonb;
begin
  if not public.has_role(array['support', 'admin', 'owner']) then
    raise exception 'Your role cannot change setup fields' using errcode = '42501';
  end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  v_data := coalesce(v_order.service_data, '{}'::jsonb);

  for v_key, v_value in select * from jsonb_each(coalesce(p_values, '{}'::jsonb))
  loop
    select * into v_field from public.product_service_fields where product_id = v_order.product_id and key = v_key;
    if not found then
      raise exception 'Unknown setup field: %', v_key using errcode = '22023';
    end if;
    if v_field.type = 'secret' then
      if v_value is null or jsonb_typeof(v_value) = 'null' or (v_value #>> '{}') = '' then
        delete from private.order_secrets where order_id = p_order_id and key = v_key;
        perform public._audit('secret.clear', 'orders', p_order_id::text, v_order.ref || ': cleared secret ' || v_key);
      else
        insert into private.order_secrets (order_id, key, value, updated_by)
        values (p_order_id, v_key, v_value #>> '{}', auth.uid())
        on conflict (order_id, key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
        perform public._audit('secret.set', 'orders', p_order_id::text, v_order.ref || ': set secret ' || v_key);
      end if;
    elsif v_value is null or jsonb_typeof(v_value) = 'null' or (jsonb_typeof(v_value) = 'string' and (v_value #>> '{}') = '') then
      v_data := v_data - v_key;
    else
      v_data := jsonb_set(v_data, array[v_key], v_value);
    end if;
  end loop;

  update public.orders set service_data = v_data where id = p_order_id;
  return v_data;
end;
$$;

-- Masked view of which secrets a request has (never the values).
create or replace function public.admin_order_secret_status(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_staff() then
    raise exception 'This area is for the Retexia team' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(key, '••••' || right(value, 4))
      from private.order_secrets where order_id = p_order_id
  ), '{}'::jsonb);
end;
$$;

create or replace function public.admin_reveal_order_secret(p_order_id uuid, p_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_value text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can reveal secrets' using errcode = '42501';
  end if;
  select value into v_value from private.order_secrets where order_id = p_order_id and key = p_key;
  perform public._audit('secret.reveal', 'orders', p_order_id::text, 'Revealed secret ' || p_key);
  return v_value;
end;
$$;

-- Staff create a request for a customer (WhatsApp lead, referral, ...).
create or replace function public.admin_create_order(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_ref text;
begin
  if not public.has_role(array['support', 'admin', 'owner']) then
    raise exception 'Your role cannot create requests' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = (p ->> 'user_id')::uuid) then
    raise exception 'Customer not found' using errcode = 'P0002';
  end if;
  insert into public.orders (user_id, product_id, package_id, billing_cycle, answers, form_id, source, customer_note, assigned_to)
  values (
    (p ->> 'user_id')::uuid,
    (p ->> 'product_id')::uuid,
    (p ->> 'package_id')::uuid,
    coalesce(p ->> 'billing_cycle', 'monthly'),
    coalesce(p -> 'answers', '[]'::jsonb),
    nullif(p ->> 'form_id', '')::uuid,
    coalesce(p ->> 'source', 'admin'),
    nullif(p ->> 'customer_note', ''),
    auth.uid()
  )
  returning id, ref into v_id, v_ref;
  return jsonb_build_object('id', v_id, 'ref', v_ref);
end;
$$;

-- -----------------------------------------------------------------------------
-- 14. Product actions (n8n)
-- -----------------------------------------------------------------------------

-- Checks role/status/enabled, records a run and returns the context to send.
create or replace function public.admin_start_action_run(p_order_id uuid, p_action_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action public.product_actions%rowtype;
  v_order public.orders%rowtype;
  v_context jsonb;
  v_run_id uuid;
  v_role text := public.staff_role();
begin
  select * into v_action from public.product_actions where id = p_action_id;
  if not found then
    raise exception 'Action not found' using errcode = 'P0002';
  end if;
  if not (coalesce(v_role, '') = any (v_action.min_roles)) then
    raise exception 'Your role cannot run this action' using errcode = '42501';
  end if;
  if not v_action.is_enabled then
    raise exception 'This action is switched off' using errcode = 'P0001';
  end if;
  select * into v_order from public.orders where id = p_order_id;
  if not found or v_order.product_id <> v_action.product_id then
    raise exception 'Request not found for this product' using errcode = 'P0002';
  end if;
  if cardinality(v_action.allowed_statuses) > 0 and not (v_order.status = any (v_action.allowed_statuses)) then
    raise exception 'This action is not available in status %', v_order.status using errcode = 'P0001';
  end if;

  v_context := jsonb_build_object(
    'order', jsonb_build_object(
      'id', v_order.id, 'ref', v_order.ref, 'status', v_order.status, 'billing_cycle', v_order.billing_cycle,
      'package_name', v_order.package_name, 'price_amount', v_order.price_amount, 'setup_fee', v_order.setup_fee,
      'currency', v_order.currency, 'source', v_order.source, 'starts_at', v_order.starts_at,
      'renews_at', v_order.renews_at, 'created_at', v_order.created_at
    ),
    'customer', (
      select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'email', p.email, 'phone', p.phone,
                                'whatsapp', p.whatsapp, 'business_name', p.business_name)
        from public.profiles p where p.id = v_order.user_id
    ),
    'package', (
      select jsonb_build_object('id', k.id, 'slug', k.slug, 'name', k.name)
        from public.packages k where k.id = v_order.package_id
    ),
    'product', (
      select jsonb_build_object('id', pr.id, 'slug', pr.slug, 'code', pr.code, 'name', pr.name)
        from public.products pr where pr.id = v_order.product_id
    ),
    'answers', (
      select coalesce(jsonb_object_agg(a ->> 'key', a -> 'value'), '{}'::jsonb)
        from jsonb_array_elements(v_order.answers) a
    ),
    'service_data', v_order.service_data
  );

  -- Only the listed keys, when the action lists any.
  if cardinality(v_action.payload_fields) > 0 then
    v_context := jsonb_set(v_context, '{answers}', coalesce((
      select jsonb_object_agg(k, v) from jsonb_each(v_context -> 'answers') e(k, v) where k = any (v_action.payload_fields)
    ), '{}'::jsonb));
    v_context := jsonb_set(v_context, '{service_data}', coalesce((
      select jsonb_object_agg(k, v) from jsonb_each(v_context -> 'service_data') e(k, v) where k = any (v_action.payload_fields)
    ), '{}'::jsonb));
  end if;

  insert into public.action_runs (order_id, action_id, action_key, action_label, status, request, triggered_by, started_at)
  values (p_order_id, p_action_id, v_action.key, v_action.label, 'running', v_context, auth.uid(), now())
  returning id into v_run_id;

  perform public._audit('action.run', 'orders', p_order_id::text, v_order.ref || ': ran ' || v_action.label);

  return jsonb_build_object(
    'run_id', v_run_id,
    'action', jsonb_build_object('id', v_action.id, 'key', v_action.key, 'label', v_action.label,
                                 'payload_fields', to_jsonb(v_action.payload_fields)),
    'context', v_context
  );
end;
$$;

create or replace function public.admin_set_action_secret(p_action_id uuid, p_webhook_url text default null, p_signing_secret text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can change action secrets' using errcode = '42501';
  end if;
  if not exists (select 1 from public.product_actions where id = p_action_id) then
    raise exception 'Action not found' using errcode = 'P0002';
  end if;
  if p_webhook_url is not null and p_webhook_url <> '' and p_webhook_url !~ '^https?://' then
    raise exception 'The webhook URL must start with https://' using errcode = '22023';
  end if;
  insert into private.product_action_secrets (action_id, webhook_url, signing_secret, updated_by)
  values (p_action_id, nullif(p_webhook_url, ''), nullif(p_signing_secret, ''), auth.uid())
  on conflict (action_id) do update set
    webhook_url = case when p_webhook_url is null then private.product_action_secrets.webhook_url else nullif(p_webhook_url, '') end,
    signing_secret = case when p_signing_secret is null then private.product_action_secrets.signing_secret else nullif(p_signing_secret, '') end,
    updated_by = auth.uid(),
    updated_at = now();
  perform public._audit('secret.set', 'product_actions', p_action_id::text, 'Changed action webhook/secret');
end;
$$;

create or replace function public.admin_action_secret_status(p_product_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see action settings' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_object_agg(a.id::text, jsonb_build_object(
      'has_webhook', s.webhook_url is not null,
      'webhook_host', substring(s.webhook_url from '^https?://([^/]+)'),
      'has_secret', s.signing_secret is not null
    ))
      from public.product_actions a
      left join private.product_action_secrets s on s.action_id = a.id
     where a.product_id = p_product_id
  ), '{}'::jsonb);
end;
$$;

create or replace function public.admin_set_integration_settings(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_role(array['owner']) then
    raise exception 'Only an owner can change integrations' using errcode = '42501';
  end if;
  update private.integration_settings set
    n8n_callback_secret = case when p ? 'n8n_callback_secret' then nullif(p ->> 'n8n_callback_secret', '') else n8n_callback_secret end,
    notifications_webhook_url = case when p ? 'notifications_webhook_url' then nullif(p ->> 'notifications_webhook_url', '') else notifications_webhook_url end,
    updated_at = now()
  where id = 1;
  perform public._audit('secret.set', 'integration_settings', '1', 'Changed integration settings: ' ||
    (select string_agg(k, ', ') from jsonb_object_keys(p) k));
end;
$$;

create or replace function public.admin_integration_status()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role(array['owner']) then
    raise exception 'Only an owner can see integrations' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'has_callback_secret', n8n_callback_secret is not null,
      'callback_secret_hint', case when n8n_callback_secret is not null then '••••' || right(n8n_callback_secret, 4) end,
      'notifications_webhook_url', notifications_webhook_url,
      'updated_at', updated_at
    ) from private.integration_settings where id = 1
  );
end;
$$;

-- Service role only (apps/admin server code): secrets and n8n results.
create or replace function public.svc_get_action_secret(p_action_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('webhook_url', webhook_url, 'signing_secret', signing_secret)
    from private.product_action_secrets where action_id = p_action_id;
$$;

create or replace function public.svc_get_order_secrets(p_order_id uuid, p_keys text[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
    from private.order_secrets where order_id = p_order_id and key = any (p_keys);
$$;

create or replace function public.svc_get_integration_settings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('n8n_callback_secret', n8n_callback_secret, 'notifications_webhook_url', notifications_webhook_url)
    from private.integration_settings where id = 1;
$$;

-- Apply an n8n result (synchronous reply or callback). Idempotent per run.
create or replace function public.svc_apply_action_result(
  p_run_id uuid,
  p_status text,
  p_service_data jsonb default null,
  p_order_status text default null,
  p_customer_note text default null,
  p_error text default null,
  p_response jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run public.action_runs%rowtype;
  v_action public.product_actions%rowtype;
  v_order public.orders%rowtype;
  v_key text;
  v_value jsonb;
  v_type text;
  v_data jsonb;
  v_target text;
  v_note text := nullif(p_error, '');
begin
  if p_status not in ('succeeded', 'failed', 'running') then
    raise exception 'status must be succeeded, failed or running' using errcode = '22023';
  end if;
  select * into v_run from public.action_runs where id = p_run_id for update;
  if not found then
    raise exception 'Run not found' using errcode = 'P0002';
  end if;
  if v_run.status in ('succeeded', 'failed') then
    return jsonb_build_object('run_id', v_run.id, 'status', v_run.status, 'already_finished', true);
  end if;

  if p_status = 'running' then
    update public.action_runs set response = coalesce(p_response, response) where id = p_run_id;
    return jsonb_build_object('run_id', p_run_id, 'status', 'running');
  end if;

  select * into v_action from public.product_actions where id = v_run.action_id;
  select * into v_order from public.orders where id = v_run.order_id for update;

  if p_status = 'succeeded' and p_service_data is not null and jsonb_typeof(p_service_data) = 'object' then
    v_data := coalesce(v_order.service_data, '{}'::jsonb);
    for v_key, v_value in select * from jsonb_each(p_service_data)
    loop
      select type into v_type from public.product_service_fields where product_id = v_order.product_id and key = v_key;
      if v_type is null then
        continue; -- only keys defined in product_service_fields
      elsif v_type = 'secret' then
        insert into private.order_secrets (order_id, key, value)
        values (v_order.id, v_key, v_value #>> '{}')
        on conflict (order_id, key) do update set value = excluded.value, updated_at = now();
      else
        v_data := jsonb_set(v_data, array[v_key], v_value);
      end if;
    end loop;
    update public.orders set service_data = v_data where id = v_order.id;
  end if;

  update public.action_runs
     set status = p_status,
         response = coalesce(p_response, response),
         error = nullif(p_error, ''),
         finished_at = now()
   where id = p_run_id;

  v_target := case when p_status = 'succeeded' then coalesce(nullif(p_order_status, ''), v_action.on_success_status) end;
  if v_target is not null and v_target <> v_order.status then
    begin
      perform public._change_order_status(
        v_order.id, v_target, coalesce(nullif(p_customer_note, ''), v_action.on_success_note), 'Changed by ' || coalesce(v_action.label, 'n8n'),
        true, null, 'n8n'
      );
    exception when others then
      v_note := 'Status not changed: ' || sqlerrm;
      update public.action_runs set error = v_note where id = p_run_id;
    end;
  end if;

  return jsonb_build_object('run_id', p_run_id, 'status', p_status, 'note', v_note);
end;
$$;

-- -----------------------------------------------------------------------------
-- 15. Customer-facing helpers (retexia.com order page)
-- -----------------------------------------------------------------------------

create or replace function public.customer_order_service_fields(p_order_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('key', f.key, 'label', f.label, 'type', f.type, 'value', o.service_data -> f.key)
                            order by f.sort_order), '[]'::jsonb)
    from public.orders o
    join public.product_service_fields f on f.product_id = o.product_id
   where o.id = p_order_id
     and o.user_id = (select auth.uid())
     and f.visible_to_customer
     and f.is_visible
     and f.type <> 'secret'
     and nullif(trim(coalesce(o.service_data ->> f.key, '')), '') is not null;
$$;
comment on function public.customer_order_service_fields(uuid) is 'Setup values marked visible_to_customer for the signed-in customer''s own request.';

create or replace function public.customer_submit_payment_proof(
  p_order_id uuid,
  p_proof_path text,
  p_reference text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.orders%rowtype;
  v_id uuid;
begin
  select * into v_order from public.orders where id = p_order_id and user_id = (select auth.uid());
  if not found then
    raise exception 'Request not found' using errcode = 'P0002';
  end if;
  if v_order.status <> 'awaiting_payment' then
    raise exception 'This request is not waiting for a payment' using errcode = 'P0001';
  end if;
  if p_proof_path is null or p_proof_path not like (auth.uid()::text || '/' || p_order_id::text || '/%') then
    raise exception 'Upload the proof first' using errcode = '22023';
  end if;
  insert into public.payments (order_id, user_id, kind, amount, currency, method, reference, status, proof_path, note, recorded_by)
  values (
    p_order_id, v_order.user_id, 'setup_fee', coalesce(v_order.setup_fee, 0) + coalesce(v_order.price_amount, 0),
    v_order.currency, 'bank_transfer', left(nullif(trim(coalesce(p_reference, '')), ''), 200), 'pending', p_proof_path,
    coalesce(left(nullif(trim(coalesce(p_note, '')), ''), 1000), 'Setup fee and first period (proof uploaded by the customer)'),
    null
  )
  returning id into v_id;
  perform public._notify_staff(
    'payment.proof_uploaded', 'Payment proof for ' || v_order.ref,
    'The customer uploaded a payment proof for ' || v_order.ref || '.', p_order_id,
    jsonb_build_object('ref', v_order.ref, 'payment_id', v_id)
  );
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 16. Products: create, duplicate, reorder
-- -----------------------------------------------------------------------------

-- Copy a form (steps and fields). Returns the new form id.
create or replace function public._clone_form(p_form_id uuid, p_new_slug text, p_product_id uuid, p_title text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form public.forms%rowtype;
  v_new_form uuid;
  v_step public.form_steps%rowtype;
  v_new_step uuid;
begin
  select * into v_form from public.forms where id = p_form_id;
  if not found then
    return null;
  end if;
  insert into public.forms (slug, product_id, title, description, submit_label, success_title, success_message, version)
  values (p_new_slug, p_product_id, coalesce(p_title, v_form.title), v_form.description, v_form.submit_label,
          v_form.success_title, v_form.success_message, 1)
  returning id into v_new_form;
  for v_step in select * from public.form_steps where form_id = p_form_id order by sort_order
  loop
    insert into public.form_steps (form_id, step_number, title, description, sort_order, is_visible)
    values (v_new_form, v_step.step_number, v_step.title, v_step.description, v_step.sort_order, v_step.is_visible)
    returning id into v_new_step;
    insert into public.form_fields (step_id, form_id, key, label, type, placeholder, help_text, options, required, min, max,
                                    default_value, show_if, width, prefill_from, sort_order, is_visible)
    select v_new_step, v_new_form, key, label, type, placeholder, help_text, options, required, min, max,
           default_value, show_if, width, prefill_from, sort_order, is_visible
      from public.form_fields where step_id = v_step.id;
  end loop;
  return v_new_form;
end;
$$;

-- A free 3-letter order code derived from a slug.
create or replace function public._free_product_code(p_slug text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_letters text := upper(regexp_replace(p_slug, '[^a-zA-Z]', '', 'g')) || 'XXX';
  v_candidate text;
  v_alpha text := 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  i int;
  j int;
begin
  v_candidate := substr(v_letters, 1, 3);
  if not exists (select 1 from public.products where code = v_candidate) then
    return v_candidate;
  end if;
  for i in 1..26 loop
    for j in 1..26 loop
      v_candidate := substr(v_letters, 1, 1) || substr(v_alpha, i, 1) || substr(v_alpha, j, 1);
      if not exists (select 1 from public.products where code = v_candidate) then
        return v_candidate;
      end if;
    end loop;
  end loop;
  raise exception 'No free product code' using errcode = 'P0001';
end;
$$;

create or replace function public.admin_create_product(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product_id uuid;
  v_slug text := lower(trim(p ->> 'slug'));
  v_name text := trim(p ->> 'name');
  v_pkg jsonb;
  v_pkg_id uuid;
  v_feat jsonb;
  v_i int;
  v_page_id uuid;
  v_section jsonb;
  v_form_id uuid;
  v_source_product uuid := nullif(p -> 'form' ->> 'from_product_id', '')::uuid;
  v_step_titles text[] := array['About your business', 'Details', 'Contact'];
begin
  if not public.is_admin() then
    raise exception 'Only admins can create products' using errcode = '42501';
  end if;
  if v_slug is null or v_slug !~ '^[a-z0-9][a-z0-9-]*$' then
    raise exception 'The slug may only use lowercase letters, numbers and dashes' using errcode = '22023';
  end if;
  if exists (select 1 from public.pages where slug = v_slug) then
    raise exception 'A page with the address /% already exists', v_slug using errcode = '23505';
  end if;

  insert into public.products (slug, code, name, short_name, tagline, description, icon, color_light, color_dark,
                               color_soft_light, color_soft_dark, status, page_slug, panel_url, panel_live, sort_order)
  values (
    v_slug,
    coalesce(nullif(upper(p ->> 'code'), ''), public._free_product_code(v_slug)),
    v_name,
    coalesce(nullif(trim(p ->> 'short_name'), ''), v_name),
    nullif(p ->> 'tagline', ''),
    nullif(p ->> 'description', ''),
    nullif(p ->> 'icon', ''),
    coalesce(nullif(p ->> 'color_light', ''), '#2a68d9'),
    coalesce(nullif(p ->> 'color_dark', ''), '#7aaeff'),
    coalesce(nullif(p ->> 'color_soft_light', ''), '#eaf1fd'),
    coalesce(nullif(p ->> 'color_soft_dark', ''), '#14254a'),
    'hidden',
    v_slug,
    nullif(p ->> 'panel_url', ''),
    false,
    coalesce((select max(sort_order) + 1 from public.products), 1)
  )
  returning id into v_product_id;

  v_i := 0;
  for v_pkg in select * from jsonb_array_elements(coalesce(p -> 'packages', '[]'::jsonb))
  loop
    v_i := v_i + 1;
    insert into public.packages (product_id, slug, name, tagline, description, price_monthly, price_yearly, setup_fee,
                                 currency, badge, is_featured, cta_label, fine_print, is_active, sort_order)
    values (
      v_product_id, v_pkg ->> 'slug', v_pkg ->> 'name', nullif(v_pkg ->> 'tagline', ''), nullif(v_pkg ->> 'description', ''),
      coalesce((v_pkg ->> 'price_monthly')::numeric, 0), nullif(v_pkg ->> 'price_yearly', '')::numeric,
      coalesce(nullif(v_pkg ->> 'setup_fee', '')::numeric, 0), nullif(v_pkg ->> 'currency', ''), nullif(v_pkg ->> 'badge', ''),
      coalesce((v_pkg ->> 'is_featured')::boolean, false), nullif(v_pkg ->> 'cta_label', ''), nullif(v_pkg ->> 'fine_print', ''),
      true, v_i
    )
    returning id into v_pkg_id;
    insert into public.package_features (package_id, label, included, sort_order)
    select v_pkg_id, f ->> 'label', coalesce((f ->> 'included')::boolean, true), ord
      from jsonb_array_elements(coalesce(v_pkg -> 'features', '[]'::jsonb)) with ordinality as t(f, ord)
     where coalesce(f ->> 'label', '') <> '';
  end loop;

  insert into public.pages (slug, title, seo_title, seo_description, product_id, is_published)
  values (v_slug, v_name, v_name || coalesce(' · ' || nullif(p ->> 'tagline', ''), ''), nullif(p ->> 'tagline', ''),
          v_product_id, true)
  returning id into v_page_id;
  for v_section in select * from jsonb_array_elements(coalesce(p -> 'sections', '[]'::jsonb))
  loop
    insert into public.page_sections (page_id, type, anchor, background, eyebrow, title, highlight, subtitle, content, sort_order)
    values (v_page_id, v_section ->> 'type', nullif(v_section ->> 'anchor', ''), coalesce(v_section ->> 'background', 'surface'),
            nullif(v_section ->> 'eyebrow', ''), nullif(v_section ->> 'title', ''), nullif(v_section ->> 'highlight', ''),
            nullif(v_section ->> 'subtitle', ''), coalesce(v_section -> 'content', '{}'::jsonb),
            coalesce((v_section ->> 'sort_order')::int, 0));
  end loop;

  if v_source_product is not null then
    v_form_id := public._clone_form(
      (select onboarding_form_id from public.products where id = v_source_product),
      v_slug || '-onboarding', v_product_id, 'Set up your ' || coalesce(nullif(trim(p ->> 'short_name'), ''), v_name)
    );
    insert into public.product_service_fields (product_id, key, label, type, options, help_text, visible_to_customer,
                                               required_for_status, sort_order, is_visible)
    select v_product_id, key, label, type, options, help_text, visible_to_customer, required_for_status, sort_order, is_visible
      from public.product_service_fields where product_id = v_source_product;
  end if;
  if v_form_id is null then
    insert into public.forms (slug, product_id, title, description, submit_label, success_title, success_message)
    values (v_slug || '-onboarding', v_product_id, 'Set up your ' || coalesce(nullif(trim(p ->> 'short_name'), ''), v_name),
            'A few questions so we can set things up for you.', 'Submit request', 'Request received',
            'Thank you. We will review your details and message you within one working day.')
    returning id into v_form_id;
    insert into public.form_steps (form_id, step_number, title, sort_order)
    select v_form_id, n, v_step_titles[n], n from generate_series(1, 3) n;
  end if;
  update public.products set onboarding_form_id = v_form_id where id = v_product_id;

  perform public._audit('insert', 'products', v_product_id::text, 'Created product ' || v_name || ' with the wizard');
  return v_product_id;
end;
$$;
comment on function public.admin_create_product(jsonb) is 'Product wizard: creates a hidden product with packages, a page with sections and a form, in one transaction.';

create or replace function public.admin_duplicate_product(
  p_product_id uuid,
  p_new_slug text,
  p_new_name text,
  p_new_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_src public.products%rowtype;
  v_new uuid;
  v_slug text := lower(trim(p_new_slug));
  v_pkg public.packages%rowtype;
  v_new_pkg uuid;
  v_page public.pages%rowtype;
  v_new_page uuid;
  v_form uuid;
  v_action public.product_actions%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Only admins can duplicate products' using errcode = '42501';
  end if;
  select * into v_src from public.products where id = p_product_id;
  if not found then
    raise exception 'Product not found' using errcode = 'P0002';
  end if;
  if v_slug is null or v_slug !~ '^[a-z0-9][a-z0-9-]*$' then
    raise exception 'The slug may only use lowercase letters, numbers and dashes' using errcode = '22023';
  end if;

  insert into public.products (slug, code, name, short_name, tagline, description, icon, color_light, color_dark,
                               color_soft_light, color_soft_dark, status, page_slug, panel_url, panel_live, sort_order)
  values (v_slug, coalesce(nullif(upper(p_new_code), ''), public._free_product_code(v_slug)), p_new_name,
          p_new_name, v_src.tagline, v_src.description, v_src.icon, v_src.color_light, v_src.color_dark,
          v_src.color_soft_light, v_src.color_soft_dark, 'hidden', v_slug, null, false,
          coalesce((select max(sort_order) + 1 from public.products), 1))
  returning id into v_new;

  insert into public.product_features (product_id, icon, title, description, sort_order, is_visible)
  select v_new, icon, title, description, sort_order, is_visible from public.product_features where product_id = p_product_id;

  for v_pkg in select * from public.packages where product_id = p_product_id order by sort_order
  loop
    insert into public.packages (product_id, slug, name, tagline, description, price_monthly, price_yearly, setup_fee, currency,
                                 price_note, badge, is_featured, cta_label, fine_print, is_active, sort_order, is_visible)
    values (v_new, v_pkg.slug, v_pkg.name, v_pkg.tagline, v_pkg.description, v_pkg.price_monthly, v_pkg.price_yearly,
            v_pkg.setup_fee, v_pkg.currency, v_pkg.price_note, v_pkg.badge, v_pkg.is_featured, v_pkg.cta_label,
            v_pkg.fine_print, v_pkg.is_active, v_pkg.sort_order, v_pkg.is_visible)
    returning id into v_new_pkg;
    insert into public.package_features (package_id, label, included, tooltip, sort_order, is_visible)
    select v_new_pkg, label, included, tooltip, sort_order, is_visible from public.package_features where package_id = v_pkg.id;
  end loop;

  select * into v_page from public.pages where product_id = p_product_id order by created_at limit 1;
  if found then
    insert into public.pages (slug, title, seo_title, seo_description, og_image_url, product_id, is_published, show_in_sitemap)
    values (v_slug, p_new_name, p_new_name, v_page.seo_description, v_page.og_image_url, v_new, true, v_page.show_in_sitemap)
    returning id into v_new_page;
    insert into public.page_sections (page_id, type, anchor, background, eyebrow, title, highlight, subtitle, content, sort_order, is_visible)
    select v_new_page, type, anchor, background,
           case when eyebrow = v_src.name then p_new_name else eyebrow end,
           title, highlight, subtitle,
           replace(content::text, '"product_slug": "' || v_src.slug || '"', '"product_slug": "' || v_slug || '"')::jsonb,
           sort_order, is_visible
      from public.page_sections where page_id = v_page.id;
  end if;

  v_form := public._clone_form(v_src.onboarding_form_id, v_slug || '-onboarding', v_new, 'Set up your ' || p_new_name);
  update public.products set onboarding_form_id = v_form where id = v_new;

  insert into public.product_service_fields (product_id, key, label, type, options, help_text, visible_to_customer,
                                             required_for_status, sort_order, is_visible)
  select v_new, key, label, type, options, help_text, visible_to_customer, required_for_status, sort_order, is_visible
    from public.product_service_fields where product_id = p_product_id;

  for v_action in select * from public.product_actions where product_id = p_product_id
  loop
    insert into public.product_actions (product_id, key, label, description, allowed_statuses, min_roles, confirm_text,
                                        payload_fields, on_success_status, on_success_note, is_enabled, sort_order)
    values (v_new, v_action.key, v_action.label, v_action.description, v_action.allowed_statuses, v_action.min_roles,
            v_action.confirm_text, v_action.payload_fields, v_action.on_success_status, v_action.on_success_note, false,
            v_action.sort_order);
  end loop;

  insert into public.faqs (product_id, question, answer, sort_order, is_visible)
  select v_new, question, answer, sort_order, is_visible from public.faqs where product_id = p_product_id;

  perform public._audit('insert', 'products', v_new::text, 'Duplicated ' || v_src.name || ' as ' || p_new_name);
  return v_new;
end;
$$;

create or replace function public.admin_reorder(p_table text, p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_editor_tables text[] := array['navigation_items', 'page_sections', 'services', 'faqs', 'testimonials'];
  v_admin_tables text[] := array['products', 'packages', 'package_features', 'product_features', 'form_steps', 'form_fields',
                                 'product_service_fields', 'product_actions', 'order_status_transitions'];
  i int;
begin
  if p_table = any (v_editor_tables) then
    if not public.has_role(array['editor', 'admin', 'owner']) then
      raise exception 'Your role cannot reorder this' using errcode = '42501';
    end if;
  elsif p_table = any (v_admin_tables) then
    if not public.is_admin() then
      raise exception 'Only admins can reorder this' using errcode = '42501';
    end if;
  else
    raise exception 'This list cannot be reordered' using errcode = '22023';
  end if;
  for i in 1 .. coalesce(array_length(p_ids, 1), 0) loop
    execute format('update public.%I set sort_order = $1 where id = $2 and sort_order is distinct from $1', p_table)
      using i, p_ids[i];
  end loop;
end;
$$;

-- Owner: scrub personal data before a login is deleted (orders and payments stay).
create or replace function public.admin_anonymise_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  if not public.has_role(array['owner']) then
    raise exception 'Only an owner can delete customers' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete yourself' using errcode = 'P0001';
  end if;
  select email into v_email from public.profiles where id = p_user_id;

  update public.contact_messages
     set name = 'Deleted customer', email = 'deleted@invalid', phone = null, business_name = null
   where user_id = p_user_id or (v_email is not null and lower(email) = lower(v_email));
  delete from public.waitlist where user_id = p_user_id or (v_email is not null and lower(email) = lower(v_email));

  -- Remove personal answers (contact details, names) but keep the business facts.
  update public.orders o
     set answers = (
       select coalesce(jsonb_agg(
         case when exists (
           select 1 from public.form_fields f
            where f.form_id = o.form_id and f.key = a ->> 'key'
              and (f.type in ('phone', 'email') or f.prefill_from is not null)
         ) then a || jsonb_build_object('value', '[removed]', 'display_value', '[removed]') else a end
       ), '[]'::jsonb)
       from jsonb_array_elements(o.answers) a
     )
   where o.user_id = p_user_id;

  update public.profiles
     set full_name = 'Deleted customer', phone = null, whatsapp = null, business_name = null, avatar_url = null,
         marketing_opt_in = false
   where id = p_user_id;

  perform public._audit('auth.delete', 'profiles', p_user_id::text, 'Anonymised customer before deleting their login');
end;
$$;

-- Form builder: save a whole form (meta, steps, fields) in one transaction.
-- Bumps forms.version. A question key that customers already answered can't be
-- renamed (old requests store answers by key); the question can still be
-- relabelled, hidden or deleted.
create or replace function public.admin_save_form(p jsonb)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form_id uuid := (p ->> 'id')::uuid;
  v_version int;
  v_locked text[];
  v_step jsonb;
  v_field jsonb;
  v_step_id uuid;
  v_step_ids uuid[] := '{}';
  v_field_ids uuid[] := '{}';
  v_keys text[] := '{}';
  v_renamed uuid[] := '{}';
  v_old_key text;
  v_key text;
  v_ref text;
  i int := 0;
  j int;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change forms' using errcode = '42501';
  end if;
  perform 1 from public.forms where id = v_form_id for update;
  if not found then
    raise exception 'Form not found' using errcode = 'P0002';
  end if;
  if coalesce(trim(p ->> 'title'), '') = '' then
    raise exception 'The form needs a title' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'steps') <> 'array' or jsonb_array_length(p -> 'steps') = 0 then
    raise exception 'A form needs at least one step' using errcode = '22023';
  end if;

  select coalesce(array_agg(distinct a ->> 'key'), '{}') into v_locked
    from public.orders o, jsonb_array_elements(o.answers) a
   where o.form_id = v_form_id and jsonb_typeof(o.answers) = 'array';

  -- Collect keys and ids from the payload, and check renames of answered keys.
  for v_step in select * from jsonb_array_elements(p -> 'steps') loop
    if nullif(v_step ->> 'id', '') is not null then
      v_step_ids := v_step_ids || (v_step ->> 'id')::uuid;
    end if;
    for v_field in select * from jsonb_array_elements(coalesce(v_step -> 'fields', '[]')) loop
      v_key := v_field ->> 'key';
      if v_key is null or v_key !~ '^[a-z][a-z0-9_]*$' then
        raise exception 'Question key "%" must be lowercase letters, numbers and underscores', coalesce(v_key, '') using errcode = '22023';
      end if;
      if v_key = any (v_keys) then
        raise exception 'Two questions use the key "%"', v_key using errcode = '22023';
      end if;
      v_keys := v_keys || v_key;
      if nullif(v_field ->> 'id', '') is not null then
        v_field_ids := v_field_ids || (v_field ->> 'id')::uuid;
        select key into v_old_key from public.form_fields where id = (v_field ->> 'id')::uuid and form_id = v_form_id;
        if v_old_key is not null and v_old_key <> v_key then
          if v_old_key = any (v_locked) then
            raise exception 'Customers already answered "%", so its key can''t change. Change the label instead.', v_old_key using errcode = '22023';
          end if;
          v_renamed := v_renamed || (v_field ->> 'id')::uuid;
        end if;
      end if;
    end loop;
  end loop;

  -- show_if must point at another question of this form.
  for v_step in select * from jsonb_array_elements(p -> 'steps') loop
    for v_field in select * from jsonb_array_elements(coalesce(v_step -> 'fields', '[]')) loop
      if jsonb_typeof(v_field -> 'show_if') = 'object' then
        v_ref := v_field -> 'show_if' ->> 'field';
        if v_ref is null or not (v_ref = any (v_keys)) or v_ref = v_field ->> 'key' then
          raise exception '"%" is shown only when another question has an answer: pick that question', v_field ->> 'label' using errcode = '22023';
        end if;
      end if;
    end loop;
  end loop;

  -- Remove what is no longer in the form, then park renamed keys so swaps don't collide.
  delete from public.form_fields where form_id = v_form_id and not (id = any (v_field_ids));
  delete from public.form_steps where form_id = v_form_id and not (id = any (v_step_ids));
  update public.form_fields set key = 'tmp_' || replace(id::text, '-', '_') where form_id = v_form_id and id = any (v_renamed);

  for v_step in select * from jsonb_array_elements(p -> 'steps') loop
    i := i + 1;
    if nullif(v_step ->> 'id', '') is not null then
      update public.form_steps
         set title = coalesce(nullif(trim(v_step ->> 'title'), ''), 'Step ' || i),
             description = nullif(v_step ->> 'description', ''),
             is_visible = coalesce((v_step ->> 'is_visible')::boolean, true),
             step_number = i, sort_order = i
       where id = (v_step ->> 'id')::uuid and form_id = v_form_id
       returning id into v_step_id;
      if v_step_id is null then
        raise exception 'Step not found in this form' using errcode = 'P0002';
      end if;
    else
      insert into public.form_steps (form_id, title, description, is_visible, step_number, sort_order)
      values (v_form_id, coalesce(nullif(trim(v_step ->> 'title'), ''), 'Step ' || i), nullif(v_step ->> 'description', ''),
              coalesce((v_step ->> 'is_visible')::boolean, true), i, i)
      returning id into v_step_id;
    end if;

    j := 0;
    for v_field in select * from jsonb_array_elements(coalesce(v_step -> 'fields', '[]')) loop
      j := j + 1;
      if nullif(v_field ->> 'id', '') is not null then
        update public.form_fields set
          step_id = v_step_id,
          key = v_field ->> 'key',
          label = coalesce(nullif(trim(v_field ->> 'label'), ''), v_field ->> 'key'),
          type = v_field ->> 'type',
          placeholder = nullif(v_field ->> 'placeholder', ''),
          help_text = nullif(v_field ->> 'help_text', ''),
          options = coalesce(v_field -> 'options', '[]'),
          required = coalesce((v_field ->> 'required')::boolean, false),
          min = nullif(v_field ->> 'min', '')::numeric,
          max = nullif(v_field ->> 'max', '')::numeric,
          default_value = nullif(v_field ->> 'default_value', ''),
          show_if = case when jsonb_typeof(v_field -> 'show_if') = 'object' then v_field -> 'show_if' end,
          width = coalesce(nullif(v_field ->> 'width', ''), 'full'),
          prefill_from = nullif(v_field ->> 'prefill_from', ''),
          is_visible = coalesce((v_field ->> 'is_visible')::boolean, true),
          sort_order = j
        where id = (v_field ->> 'id')::uuid and form_id = v_form_id;
        if not found then
          raise exception 'Question not found in this form' using errcode = 'P0002';
        end if;
      else
        insert into public.form_fields (step_id, form_id, key, label, type, placeholder, help_text, options, required,
                                        min, max, default_value, show_if, width, prefill_from, is_visible, sort_order)
        values (v_step_id, v_form_id, v_field ->> 'key', coalesce(nullif(trim(v_field ->> 'label'), ''), v_field ->> 'key'),
                v_field ->> 'type', nullif(v_field ->> 'placeholder', ''), nullif(v_field ->> 'help_text', ''),
                coalesce(v_field -> 'options', '[]'), coalesce((v_field ->> 'required')::boolean, false),
                nullif(v_field ->> 'min', '')::numeric, nullif(v_field ->> 'max', '')::numeric,
                nullif(v_field ->> 'default_value', ''),
                case when jsonb_typeof(v_field -> 'show_if') = 'object' then v_field -> 'show_if' end,
                coalesce(nullif(v_field ->> 'width', ''), 'full'), nullif(v_field ->> 'prefill_from', ''),
                coalesce((v_field ->> 'is_visible')::boolean, true), j);
      end if;
    end loop;
  end loop;

  update public.forms set
    title = trim(p ->> 'title'),
    description = nullif(p ->> 'description', ''),
    submit_label = nullif(p ->> 'submit_label', ''),
    success_title = nullif(p ->> 'success_title', ''),
    success_message = nullif(p ->> 'success_message', ''),
    version = version + 1
  where id = v_form_id
  returning version into v_version;

  perform public._audit('form.save', 'forms', v_form_id::text,
    format('Saved form "%s" (version %s, %s questions)', trim(p ->> 'title'), v_version, cardinality(v_keys)));
  return v_version;
end;
$$;

-- Keys customers already answered (the builder locks them).
create or replace function public.admin_form_locked_keys(p_form_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.is_staff() then coalesce((
    select array_agg(distinct a ->> 'key')
      from public.orders o, jsonb_array_elements(o.answers) a
     where o.form_id = p_form_id and jsonb_typeof(o.answers) = 'array'
  ), '{}') else '{}' end;
$$;

-- -----------------------------------------------------------------------------
-- 17. Dashboard
-- -----------------------------------------------------------------------------

create or replace function public.admin_dashboard(
  p_product_id uuid default null,
  p_from date default (current_date - 29),
  p_to date default current_date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_from timestamptz := p_from::timestamptz;
  v_to timestamptz := (p_to + 1)::timestamptz;
  v_result jsonb;
begin
  if not public.is_staff() then
    raise exception 'This area is for the Retexia team' using errcode = '42501';
  end if;

  with o as (
    select * from public.orders where p_product_id is null or product_id = p_product_id
  ),
  pay as (
    select pay.* from public.payments pay join o on o.id = pay.order_id
  )
  select jsonb_build_object(
    'new_requests', (select count(*) from o where created_at >= v_from and created_at < v_to),
    'waiting_for_action', (
      select count(*) from o
       where status in ('submitted', 'reviewing')
          or (status = 'awaiting_payment' and exists (select 1 from pay where pay.order_id = o.id and pay.status = 'pending'))
          or (status = 'setting_up' and updated_at < now() - interval '3 days')
    ),
    'active_subscriptions', (select count(*) from o where status = 'active'),
    'mrr', (select coalesce(sum(case when billing_cycle = 'yearly' then price_amount / 12 else price_amount end), 0)
              from o where status = 'active'),
    'revenue', (select coalesce(sum(case when kind = 'refund' then -amount else amount end), 0)
                  from pay where status = 'confirmed' and paid_at >= v_from and paid_at < v_to),
    'setup_fees', (select coalesce(sum(amount), 0) from pay
                    where status = 'confirmed' and kind = 'setup_fee' and paid_at >= v_from and paid_at < v_to),
    'renewals_due', (select count(*) from o where status = 'active' and renews_at >= now() and renews_at < now() + interval '7 days'),
    'overdue_renewals', (select count(*) from o where status = 'active' and renews_at < now()),
    'new_customers', (
      select count(*) from public.profiles pr
       where pr.role = 'customer' and pr.created_at >= v_from and pr.created_at < v_to
         and (p_product_id is null or exists (select 1 from o where o.user_id = pr.id))
    ),
    'unread_messages', (
      select count(*) from public.contact_messages
       where status = 'new' and (p_product_id is null or product_id = p_product_id)
    ),
    'waitlist_signups', (
      select count(*) from public.waitlist
       where created_at >= v_from and created_at < v_to and (p_product_id is null or product_id = p_product_id)
    ),
    'by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from o group by status) s), '{}'::jsonb),
    'weekly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'week', to_char(w, 'YYYY-MM-DD'),
        'requests', (select count(*) from o where created_at >= w and created_at < w + interval '7 days'),
        'revenue', (select coalesce(sum(case when kind = 'refund' then -amount else amount end), 0)
                      from pay where status = 'confirmed' and paid_at >= w and paid_at < w + interval '7 days')
      ) order by w)
      from generate_series(date_trunc('week', v_from), v_to - interval '1 second', interval '1 week') w
    ), '[]'::jsonb),
    'mrr_by_product', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', pr.id, 'slug', pr.slug, 'name', pr.short_name, 'color', pr.color_light,
        'mrr', (select coalesce(sum(case when x.billing_cycle = 'yearly' then x.price_amount / 12 else x.price_amount end), 0)
                  from public.orders x where x.product_id = pr.id and x.status = 'active'),
        'active', (select count(*) from public.orders x where x.product_id = pr.id and x.status = 'active')
      ) order by pr.sort_order)
      from public.products pr where p_product_id is null or pr.id = p_product_id
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;
comment on function public.admin_dashboard(uuid, date, date) is 'Numbers and weekly series for the admin dashboard. Staff only.';

-- -----------------------------------------------------------------------------
-- 18. Row Level Security
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'order_status_transitions', 'order_notes', 'customer_notes', 'payments', 'receipt_counters',
    'product_service_fields', 'product_actions', 'action_runs', 'notifications_outbox', 'audit_logs',
    'admin_saved_views', 'media', 'staff_settings'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

-- Content tables: staff see hidden rows; editors write website content,
-- admins write products, forms, settings and statuses.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      ('site_settings', 'true', 'admin'),
      ('site_strings', 'true', 'editor'),
      ('navigation_items', 'is_visible', 'editor'),
      ('pages', 'is_published', 'editor'),
      ('page_sections', 'is_visible and exists (select 1 from public.pages p where p.id = page_id and p.is_published)', 'editor'),
      ('services', 'is_visible', 'editor'),
      ('testimonials', 'is_visible', 'editor'),
      ('faqs', 'is_visible', 'editor'),
      ('products', 'is_visible and status <> ''hidden''', 'admin'),
      ('product_features', 'is_visible', 'admin'),
      ('packages', 'is_visible', 'admin'),
      ('package_features', 'is_visible', 'admin'),
      ('forms', 'true', 'admin'),
      ('form_steps', 'is_visible', 'admin'),
      ('form_fields', 'is_visible', 'admin'),
      ('order_statuses', 'true', 'admin')
    ) as v (tbl, cond, writer)
  loop
    execute format('drop policy if exists "Public can read" on public.%I', r.tbl);
    execute format(
      'create policy "Public can read" on public.%I for select to anon, authenticated using (%s or (select public.is_staff()))',
      r.tbl, r.cond
    );
    execute format('drop policy if exists "Admins can write" on public.%I', r.tbl);
    execute format('drop policy if exists "Staff can write" on public.%I', r.tbl);
    execute format(
      'create policy "Staff can write" on public.%I for all to authenticated using (%s) with check (%s)',
      r.tbl,
      case when r.writer = 'editor' then '(select public.has_role(array[''editor'', ''admin'', ''owner'']))' else '(select public.is_admin())' end,
      case when r.writer = 'editor' then '(select public.has_role(array[''editor'', ''admin'', ''owner'']))' else '(select public.is_admin())' end
    );
  end loop;
end;
$$;

-- Profiles: staff read everyone; admins edit (role changes: owner, via trigger).
drop policy if exists "Owner can read own profile" on public.profiles;
create policy "Owner can read own profile" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_staff()));

-- Orders and timeline: staff read everything.
drop policy if exists "Owner can read own orders" on public.orders;
create policy "Owner can read own orders" on public.orders
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_staff()));

drop policy if exists "Owner can read own order events" on public.order_events;
create policy "Owner can read own order events" on public.order_events
  for select to authenticated
  using (
    exists (select 1 from public.orders o where o.id = order_id and o.user_id = (select auth.uid()))
    or (select public.is_staff())
  );

-- Inbox: staff read, support/admin update, admin delete.
drop policy if exists "Admins can manage messages" on public.contact_messages;
drop policy if exists "Staff can read messages" on public.contact_messages;
drop policy if exists "Support can update messages" on public.contact_messages;
drop policy if exists "Admins can delete messages" on public.contact_messages;
create policy "Staff can read messages" on public.contact_messages
  for select to authenticated using ((select public.is_staff()));
create policy "Support can update messages" on public.contact_messages
  for update to authenticated
  using ((select public.has_role(array['support', 'admin', 'owner'])))
  with check ((select public.has_role(array['support', 'admin', 'owner'])));
create policy "Admins can delete messages" on public.contact_messages
  for delete to authenticated using ((select public.is_admin()));

drop policy if exists "Admins can manage waitlist" on public.waitlist;
drop policy if exists "Staff can read waitlist" on public.waitlist;
drop policy if exists "Admins can delete waitlist" on public.waitlist;
create policy "Staff can read waitlist" on public.waitlist
  for select to authenticated using ((select public.is_staff()));
create policy "Admins can delete waitlist" on public.waitlist
  for delete to authenticated using ((select public.is_admin()));

-- Workflow configuration
drop policy if exists "Staff can read transitions" on public.order_status_transitions;
drop policy if exists "Admins can write transitions" on public.order_status_transitions;
create policy "Staff can read transitions" on public.order_status_transitions
  for select to authenticated using ((select public.is_staff()));
create policy "Admins can write transitions" on public.order_status_transitions
  for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

-- Internal notes
do $$
declare
  t text;
begin
  foreach t in array array['order_notes', 'customer_notes']
  loop
    execute format('drop policy if exists "Staff can read notes" on public.%I', t);
    execute format('drop policy if exists "Support can add notes" on public.%I', t);
    execute format('drop policy if exists "Authors and admins can edit notes" on public.%I', t);
    execute format('drop policy if exists "Authors and admins can delete notes" on public.%I', t);
    execute format('create policy "Staff can read notes" on public.%I for select to authenticated using ((select public.is_staff()))', t);
    execute format(
      'create policy "Support can add notes" on public.%I for insert to authenticated
         with check ((select public.has_role(array[''support'', ''admin'', ''owner''])) and author_id = (select auth.uid()))', t);
    execute format(
      'create policy "Authors and admins can edit notes" on public.%I for update to authenticated
         using (author_id = (select auth.uid()) or (select public.is_admin()))
         with check (author_id = (select auth.uid()) or (select public.is_admin()))', t);
    execute format(
      'create policy "Authors and admins can delete notes" on public.%I for delete to authenticated
         using (author_id = (select auth.uid()) or (select public.is_admin()))', t);
  end loop;
end;
$$;

-- Payments
drop policy if exists "Staff and owners can read payments" on public.payments;
drop policy if exists "Support can record payments" on public.payments;
drop policy if exists "Support can update payments" on public.payments;
drop policy if exists "Admins can delete payments" on public.payments;
create policy "Staff and owners can read payments" on public.payments
  for select to authenticated
  using (
    (select public.is_staff())
    or (user_id = (select auth.uid()) and status in ('confirmed', 'refunded', 'pending'))
  );
create policy "Support can record payments" on public.payments
  for insert to authenticated
  with check ((select public.has_role(array['support', 'admin', 'owner'])));
create policy "Support can update payments" on public.payments
  for update to authenticated
  using ((select public.has_role(array['support', 'admin', 'owner'])))
  with check ((select public.has_role(array['support', 'admin', 'owner'])));
create policy "Admins can delete payments" on public.payments
  for delete to authenticated using ((select public.is_admin()));

-- Product extensibility
do $$
declare
  t text;
begin
  foreach t in array array['product_service_fields', 'product_actions']
  loop
    execute format('drop policy if exists "Staff can read" on public.%I', t);
    execute format('drop policy if exists "Admins can write" on public.%I', t);
    execute format('create policy "Staff can read" on public.%I for select to authenticated using ((select public.is_staff()))', t);
    execute format(
      'create policy "Admins can write" on public.%I for all to authenticated
         using ((select public.is_admin())) with check ((select public.is_admin()))', t);
  end loop;
end;
$$;

drop policy if exists "Staff can read runs" on public.action_runs;
create policy "Staff can read runs" on public.action_runs
  for select to authenticated using ((select public.is_staff()));

drop policy if exists "Staff can read outbox" on public.notifications_outbox;
drop policy if exists "Admins can retry outbox" on public.notifications_outbox;
create policy "Staff can read outbox" on public.notifications_outbox
  for select to authenticated using ((select public.is_staff()));
create policy "Admins can retry outbox" on public.notifications_outbox
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Admins can read audit log" on public.audit_logs;
create policy "Admins can read audit log" on public.audit_logs
  for select to authenticated using ((select public.is_admin()));

drop policy if exists "Own saved views" on public.admin_saved_views;
create policy "Own saved views" on public.admin_saved_views
  for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_staff()))
  with check (user_id = (select auth.uid()) and (select public.is_staff()));

drop policy if exists "Staff can read staff settings" on public.staff_settings;
drop policy if exists "Admins can change staff settings" on public.staff_settings;
create policy "Staff can read staff settings" on public.staff_settings
  for select to authenticated using ((select public.is_staff()));
create policy "Admins can change staff settings" on public.staff_settings
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));

drop policy if exists "Staff can read media" on public.media;
drop policy if exists "Editors can write media" on public.media;
create policy "Staff can read media" on public.media
  for select to authenticated using ((select public.is_staff()));
create policy "Editors can write media" on public.media
  for all to authenticated
  using ((select public.has_role(array['editor', 'admin', 'owner'])))
  with check ((select public.has_role(array['editor', 'admin', 'owner'])));

-- -----------------------------------------------------------------------------
-- 19. Storage
-- -----------------------------------------------------------------------------

-- site-assets: editors (not only admins) upload website images.
drop policy if exists "site-assets: admin insert" on storage.objects;
drop policy if exists "site-assets: admin update" on storage.objects;
drop policy if exists "site-assets: admin delete" on storage.objects;
drop policy if exists "site-assets: editor insert" on storage.objects;
drop policy if exists "site-assets: editor update" on storage.objects;
drop policy if exists "site-assets: editor delete" on storage.objects;
create policy "site-assets: editor insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'site-assets' and (select public.has_role(array['editor', 'admin', 'owner'])));
create policy "site-assets: editor update" on storage.objects
  for update to authenticated
  using (bucket_id = 'site-assets' and (select public.has_role(array['editor', 'admin', 'owner'])))
  with check (bucket_id = 'site-assets' and (select public.has_role(array['editor', 'admin', 'owner'])));
create policy "site-assets: editor delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'site-assets' and (select public.has_role(array['editor', 'admin', 'owner'])));

-- payment-proofs: private. Customers upload to and read their own folder
-- (<user_id>/<order_id>/<file>); support, admins and owners see everything.
-- Storage itself refuses files over 5 MB or of other types.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-proofs', 'payment-proofs', false, 5242880, array['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "payment-proofs: read" on storage.objects;
drop policy if exists "payment-proofs: upload" on storage.objects;
drop policy if exists "payment-proofs: staff update" on storage.objects;
drop policy if exists "payment-proofs: staff delete" on storage.objects;
create policy "payment-proofs: read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'payment-proofs'
    and ((select public.has_role(array['support', 'admin', 'owner']))
         or (storage.foldername(name))[1] = (select auth.uid())::text)
  );
create policy "payment-proofs: upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and ((select public.has_role(array['support', 'admin', 'owner']))
         or (storage.foldername(name))[1] = (select auth.uid())::text)
  );
create policy "payment-proofs: staff update" on storage.objects
  for update to authenticated
  using (bucket_id = 'payment-proofs' and (select public.has_role(array['support', 'admin', 'owner'])))
  with check (bucket_id = 'payment-proofs' and (select public.has_role(array['support', 'admin', 'owner'])));
create policy "payment-proofs: staff delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'payment-proofs' and (select public.is_admin()));

-- -----------------------------------------------------------------------------
-- 20. Grants (newer projects grant nothing to the API roles by default)
-- -----------------------------------------------------------------------------

grant select, insert, update, delete on
  public.order_status_transitions, public.order_notes, public.customer_notes, public.payments,
  public.product_service_fields, public.product_actions, public.admin_saved_views, public.media
to authenticated;
grant select, update on public.notifications_outbox to authenticated;
grant select, update on public.staff_settings to authenticated;
revoke all on public.staff_settings from anon;
grant select on public.action_runs, public.audit_logs to authenticated;
grant select on public.staff_orders, public.staff_customers, public.staff_payments to authenticated;
revoke all on public.staff_orders, public.staff_customers, public.staff_payments from anon;
revoke all on public.receipt_counters from anon, authenticated;
grant insert, delete on public.waitlist to authenticated;
grant update on public.contact_messages to authenticated;

-- Customers see when a subscription was paused and where a request came from.
grant select (paused_at, source) on public.orders to authenticated;

grant all on all tables in schema public to service_role;
grant usage on schema private to service_role;
grant all on all tables in schema private to service_role;

-- Functions: helpers for policies, RPCs for staff and customers, svc_* for the service role.
grant execute on function public.staff_role(), public.has_role(text[]), public.is_staff(), public.is_admin(),
  public.is_privileged() to anon, authenticated;
grant execute on function
  public.admin_change_order_status(uuid, text, text, text, boolean, text),
  public.admin_assign_order(uuid, uuid),
  public.admin_update_order(uuid, jsonb, text),
  public.admin_set_service_data(uuid, jsonb),
  public.admin_order_secret_status(uuid),
  public.admin_reveal_order_secret(uuid, text),
  public.admin_create_order(jsonb),
  public.admin_start_action_run(uuid, uuid),
  public.admin_set_action_secret(uuid, text, text),
  public.admin_action_secret_status(uuid),
  public.admin_set_integration_settings(jsonb),
  public.admin_integration_status(),
  public.admin_create_product(jsonb),
  public.admin_duplicate_product(uuid, text, text, text),
  public.admin_reorder(text, uuid[]),
  public.admin_save_form(jsonb),
  public.admin_form_locked_keys(uuid),
  public.admin_anonymise_user(uuid),
  public.admin_dashboard(uuid, date, date),
  public.customer_order_service_fields(uuid),
  public.customer_submit_payment_proof(uuid, text, text, text)
to authenticated;

-- Internal helpers and service-role functions: nobody else may call them.
do $$
declare
  f text;
begin
  foreach f in array array[
    'public._change_order_status(uuid, text, text, text, boolean, text, text)',
    'public._audit(text, text, text, text, jsonb, jsonb)',
    'public._notify_customer(text, uuid, uuid, text, text, jsonb)',
    'public._notify_staff(text, text, text, uuid, jsonb)',
    'public._clone_form(uuid, text, uuid, text)',
    'public.svc_get_action_secret(uuid)',
    'public.svc_get_order_secrets(uuid, text[])',
    'public.svc_get_integration_settings()',
    'public.svc_apply_action_result(uuid, text, jsonb, text, text, text, jsonb)'
  ]
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end;
$$;
grant execute on all functions in schema public to service_role;
-- grant above re-opened internal helpers to service_role only; make sure the API roles stay locked out.
revoke execute on function public._change_order_status(uuid, text, text, text, boolean, text, text) from anon, authenticated;
revoke execute on function public.svc_apply_action_result(uuid, text, jsonb, text, text, text, jsonb) from anon, authenticated;

-- -----------------------------------------------------------------------------
-- 21. Realtime
-- -----------------------------------------------------------------------------

do $$
declare
  t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['orders', 'contact_messages', 'payments', 'action_runs']
    loop
      if not exists (
        select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
      ) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- 22. Default workflow and Lingo setup example (kept if already edited)
-- -----------------------------------------------------------------------------

insert into public.order_status_transitions
  (from_status, to_status, action_label, min_roles, requires_confirmed_payment, requires_reason, notify_customer_default,
   customer_note_template, sort_order)
select v.from_status, v.to_status, v.label, v.roles, v.payment, v.reason, v.notify, v.template, v.sort_order
from (values
  ('submitted', 'reviewing', 'Start review', array['support', 'admin', 'owner'], false, false, false, null, 1),
  ('submitted', 'awaiting_payment', 'Approve', array['support', 'admin', 'owner'], false, false, true,
    'Good news: your request is approved. Please pay the setup fee and first period using the details below, with your reference as the payment reference.', 2),
  ('reviewing', 'awaiting_payment', 'Approve', array['support', 'admin', 'owner'], false, false, true,
    'Good news: your request is approved. Please pay the setup fee and first period using the details below, with your reference as the payment reference.', 2),
  ('submitted', 'rejected', 'Reject', array['support', 'admin', 'owner'], false, true, true,
    'Thank you for your interest. We cannot take this request because ', 3),
  ('reviewing', 'rejected', 'Reject', array['support', 'admin', 'owner'], false, true, true,
    'Thank you for your interest. We cannot take this request because ', 3),
  ('awaiting_payment', 'setting_up', 'Start setup', array['support', 'admin', 'owner'], true, false, true,
    'Payment received, thank you. We have started setting things up.', 1),
  ('setting_up', 'active', 'Mark as live', array['support', 'admin', 'owner'], false, false, true,
    'You are live. Everything is running.', 1),
  ('active', 'paused', 'Pause', array['support', 'admin', 'owner'], false, false, true, null, 2),
  ('paused', 'active', 'Resume', array['support', 'admin', 'owner'], false, false, true, 'Welcome back. Everything is running again.', 1),
  ('submitted', 'cancelled', 'Cancel', array['support', 'admin', 'owner'], false, false, true, null, 9),
  ('reviewing', 'cancelled', 'Cancel', array['support', 'admin', 'owner'], false, false, true, null, 9),
  ('awaiting_payment', 'cancelled', 'Cancel', array['support', 'admin', 'owner'], false, false, true, null, 9),
  ('setting_up', 'cancelled', 'Cancel', array['support', 'admin', 'owner'], false, false, true, null, 9),
  ('active', 'cancelled', 'Cancel', array['support', 'admin', 'owner'], false, false, true, null, 9),
  ('paused', 'cancelled', 'Cancel', array['support', 'admin', 'owner'], false, false, true, null, 9)
) as v (from_status, to_status, label, roles, payment, reason, notify, template, sort_order)
where exists (select 1 from public.order_statuses where key = v.from_status)
  and exists (select 1 from public.order_statuses where key = v.to_status)
on conflict (from_status, to_status) do nothing;

insert into public.product_service_fields
  (product_id, key, label, type, help_text, visible_to_customer, required_for_status, sort_order)
select p.id, v.key, v.label, v.type, v.help, v.visible, v.required_for, v.sort_order
from public.products p
join (values
  ('bot_name', 'Bot name', 'text', 'The name customers see in replies.', false, null, 1),
  ('whatsapp_phone_number_id', 'WhatsApp phone number ID', 'text', 'From Meta → WhatsApp → API setup.', false, 'active', 2),
  ('waba_id', 'WhatsApp Business Account ID', 'text', null, false, null, 3),
  ('meta_access_token', 'Meta access token', 'secret', 'Permanent system user token. Stored privately.', false, null, 4),
  ('n8n_workflow_id', 'n8n workflow ID', 'text', null, false, null, 5),
  ('go_live_date', 'Go-live date', 'date', 'Shown to the customer.', true, null, 6)
) as v (key, label, type, help, visible, required_for, sort_order) on true
where p.slug = 'lingo'
on conflict (product_id, key) do nothing;

insert into public.product_actions
  (product_id, key, label, description, allowed_statuses, min_roles, confirm_text, payload_fields, is_enabled, sort_order)
select p.id, 'start_setup', 'Start setup in n8n',
       'Sends the request, answers and setup fields to the Lingo setup workflow.',
       array['setting_up'], array['support', 'admin', 'owner'],
       'This sends the request details to the Lingo setup workflow in n8n.', '{}', false, 1
from public.products p
where p.slug = 'lingo'
on conflict (product_id, key) do nothing;
