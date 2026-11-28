-- =====================================================================
-- 0052: Feeder drafts. What a seller was setting up in Autopublish (template,
-- product, form, ad accounts, budget and text, the videos / images already
-- uploaded) and in Bulk create (which sources, which CRM sheets) is kept
-- while they work, so they can leave and come back, on any device.
-- One draft per seller per tool; saved by feeder.retexia.com, cleared after
-- a launch or with "Start over". Safe to run again. Run after 0051.
-- =====================================================================

create table if not exists feeder.drafts (
  user_id    uuid not null references auth.users (id) on delete cascade,
  tool       text not null check (tool in ('autopublish', 'bulk_create')),
  data       jsonb not null default '{}'::jsonb check (pg_column_size(data) <= 65536),
  updated_at timestamptz not null default now(),
  primary key (user_id, tool)
);
comment on table feeder.drafts is 'What a seller was setting up in a Feeder tool (Autopublish launch screen, Bulk create), kept until they launch or start over.';

alter table feeder.drafts enable row level security;
drop policy if exists own_read on feeder.drafts;
create policy own_read on feeder.drafts for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete on feeder.drafts from anon, authenticated;
grant select on feeder.drafts to authenticated;
grant all on feeder.drafts to service_role;
