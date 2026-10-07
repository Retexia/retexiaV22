# Moving Lingo and Post into the Retexia project

Before: three Supabase projects (Retexia, Lingo, Post). After: one project,
with Lingo in schema `lingo` and Post in schema `post`. One login for
everything, one set of keys, and the product panels can rely on database rules.

Nothing below touches the old Lingo and Post projects until the last step, so
you can stop at any point. Do it in a quiet hour: the bot and the post
workflow are switched over in step 5.

You need the database connection string of each project:
**Project → Connect → Connection string (URI)**, Session pooler. It looks like
`postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`.
Below they are called `RETEXIA_DB`, `LINGO_DB` and `POST_DB`. Install the
PostgreSQL client tools (`brew install libpq`) for `pg_dump` and `psql`.

## 1. Create the schemas in the Retexia project

In the Retexia project's **SQL Editor**, run in order:

1. `supabase/migrations/0004_lingo_panel.sql` (if not run yet)
2. `supabase/migrations/0005_post_schema.sql`
3. `supabase/migrations/0006_lingo_schema.sql`

Then:

- **Database → Extensions:** enable `vector`, `pg_cron` and `pg_net` (Post's photo
  search and schedulers), and run `0005_post_schema.sql` again so the scheduled
  jobs are created.
- **Settings → API → Exposed schemas:** add `post` and `lingo`. (Every table in
  them has row-level security; visitors have no access.)

## 2. Copy the Lingo data

```bash
pg_dump "$LINGO_DB" --data-only --schema=public \
  -t public.lingo_users -t public.business_details -t public.products -t public.customers \
  -t public.orders -t public.messages -t public.fixed_messages \
  | sed -E "s/^COPY public\./COPY lingo./; s/setval\('public\./setval('lingo./" > lingo.sql
```

```bash
psql "$RETEXIA_DB" -c "set session_replication_role = replica;" -f lingo.sql
```

Check the counts match: `select count(*) from lingo.orders;` in both projects.

## 3. Copy the Post data

Post's businesses belonged to logins in the old Post project. In the Retexia
project they must belong to the customer's **Retexia** login, so they are moved
after the copy.

```bash
pg_dump "$POST_DB" --data-only --schema=public \
  -t public.businesses -t public.social_accounts -t public.products -t public.media -t public.plan_items \
  -t public.posts -t public.publications -t public.usage_monthly -t public.events \
  | sed -E "s/^COPY public\./COPY post./; s/setval\('public\./setval('post./" > post.sql
```

```bash
psql "$RETEXIA_DB" -c "set session_replication_role = replica;" -f post.sql
```

Then, for each business, point it at the owner's Retexia account (they must
have signed up on retexia.com):

```sql
update post.businesses
   set owner_id = (select id from auth.users where email = 'owner@example.com')
 where id = '<business id>';
-- approvals made in the old project pointed at old logins:
update post.posts set approved_by = null where approved_by not in (select id from auth.users);
```

**Files:** copy the Storage buckets `media` and `thumbs` from the Post project
to the Retexia project (same bucket names, same paths). The simplest way is the
Supabase CLI: `supabase storage cp -r ss:///media ./media --experimental` from
the old project, then the same command the other way round for the new one. If
the old images were only tests, skip this.

## 4. Link Lingo accounts to customers

Either fill **Lingo account ID** (`lingo.lingo_users.id`) on the customer's
Lingo request in the admin (Setup tab), and the account links itself the first
time they open lingo.retexia.com, or link it directly:

```sql
update lingo.lingo_users
   set owner_id = (select id from auth.users where email = 'owner@example.com')
 where id = 1;
```

## 5. Switch n8n over

The migrations created two database roles whose default schema is the
product's schema, so the workflows' SQL keeps working unchanged
(`products` means `lingo.products` for the Lingo role, `post.products` for the
Post role).

Give them passwords (Retexia SQL Editor, use long random values):

```sql
alter role lingo_n8n with login password '<long random password>';
alter role post_n8n  with login password '<another long random password>';
```

In n8n:

1. **Lingo Postgres** credential: host = the Retexia pooler host, port 5432,
   database `postgres`, user `lingo_n8n.<retexia-project-ref>`, the password above,
   SSL on.
2. **Post Postgres** credential (*Postgres account*): same, with user
   `post_n8n.<retexia-project-ref>`.
3. **Supabase** credential used by the Post workflow (Storage uploads and signed
   URLs): the Retexia project URL and its service-role key.
4. Post workflow → **Config** node: `supabaseUrl` = the Retexia project URL.
5. Send a test WhatsApp message to the bot and run the photo-post form once.

## 6. Switch the panels and retire the old projects

- `apps/panels` now uses the Retexia project's keys only
  (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`). Remove `NEXT_PUBLIC_SUPABASE_URL2`,
  `SUPABASE_SERVICE_ROLE_KEY2`, `LINGO_SUPABASE_URL` and
  `LINGO_SUPABASE_SERVICE_ROLE_KEY` from Vercel and redeploy.
- After a few days without problems, pause the old Lingo and Post projects
  (Project settings → General → Pause), and delete them later.
