-- =====================================================================
-- 0031: Retexia Plan as a product (retexia.com/products, /plan, admin).
--
-- Plan is free for every Retexia account: no packages, no order, no
-- approval. The site shows it as "Free" and its buttons open
-- https://plan.retexia.com directly (sign-in goes through retexia.com).
-- Safe to run again: texts are updated, nothing is duplicated.
-- =====================================================================

insert into public.products (slug, code, name, short_name, tagline, description, icon,
                             color_light, color_dark, color_soft_light, color_soft_dark,
                             status, page_slug, panel_url, panel_live, sort_order)
values (
  'plan', 'PLN', 'Retexia Plan', 'Plan',
  'Reach your goals, one day at a time',
  'Set income, savings and business goals for the year, month and week. Track them on charts, tick off your daily tasks, keep your streak going, and ask the Retexia coach how to catch up. Free for every Retexia account.',
  'target', '#5b3fd1', '#a996ff', '#ece8fc', '#221a45',
  'live', 'plan', 'https://plan.retexia.com', true,
  coalesce((select max(sort_order) + 1 from public.products where slug <> 'plan'), 1)
)
on conflict (slug) do update set
  name = excluded.name,
  short_name = excluded.short_name,
  tagline = excluded.tagline,
  description = excluded.description,
  icon = excluded.icon,
  color_light = excluded.color_light,
  color_dark = excluded.color_dark,
  color_soft_light = excluded.color_soft_light,
  color_soft_dark = excluded.color_soft_dark,
  status = 'live',
  page_slug = 'plan',
  panel_url = excluded.panel_url,
  panel_live = true,
  updated_at = now();

-- What you get (the "features" section reads these).
insert into public.product_features (id, product_id, icon, title, description, sort_order, is_visible)
select md5('retexia:feature:plan:' || v.n)::uuid, (select id from public.products where slug = 'plan'), v.icon, v.title, v.description, v.n, true
from (values
  (1, 'target', 'Year, month and week goals', 'Big goals broken into smaller ones. Income, savings, business, health, learning or anything else.'),
  (2, 'chart-line', 'Charts you design', 'Track what matters: income, savings, clients, pages read. Add values any time and see if you are ahead or behind.'),
  (3, 'list-checks', 'A daily to-do list', 'Tasks that repeat every day, every 2 or 3 days, or on the days you choose.'),
  (4, 'flame', 'Streaks', 'Every day you finish your tasks grows your streak. Do not break the chain.'),
  (5, 'bot', 'Your AI coach', 'Ask "Am I on track?" in any goal. The coach knows your numbers and tells you what to do next.'),
  (6, 'users', 'Goals with your people', 'Invite your partner or team to a goal: they see the charts, add values and chat with you.'),
  (7, 'message-circle', 'Morning WhatsApp', 'Today''s tasks and your streak on WhatsApp, at the time you choose.'),
  (8, 'mail', 'Weekly report', 'Every Sunday evening: how your week went and one thing to focus on next.')
) as v (n, icon, title, description)
on conflict (id) do update set
  product_id = excluded.product_id, icon = excluded.icon, title = excluded.title,
  description = excluded.description, sort_order = excluded.sort_order, is_visible = true;

insert into public.faqs (id, product_id, question, answer, sort_order, is_visible)
select md5('retexia:faq:plan:' || v.n)::uuid, (select id from public.products where slug = 'plan'), v.question, v.answer, v.n, true
from (values
  (1, 'Is Retexia Plan really free?', 'Yes. Plan is free for every Retexia account. There is nothing to buy and no card needed.'),
  (2, 'Do I need another Retexia product to use it?', 'No. Create a free Retexia account (or sign in) and open plan.retexia.com.'),
  (3, 'Who can see my goals?', 'Only you. You can invite people to a single goal by email; they see that goal only, and you choose if they can add values.'),
  (4, 'How do the WhatsApp reminders work?', 'Add your WhatsApp number in Reminders & settings and choose a time. Every morning you get today''s tasks and your streak. Turn it off any time.'),
  (5, 'What does the coach know?', 'Only what is in that goal: its charts, your tasks and streaks, and the chat. It works in English, Sinhala, Singlish and Tamil.')
) as v (n, question, answer)
on conflict (id) do update set
  product_id = excluded.product_id, question = excluded.question, answer = excluded.answer,
  sort_order = excluded.sort_order, is_visible = true;

-- The page: retexia.com/plan
insert into public.pages (slug, title, seo_title, seo_description, product_id, is_published, show_in_sitemap)
values ('plan', 'Retexia Plan', 'Retexia Plan · Reach your goals, one day at a time',
        'Free goal tracker for Sri Lankan businesses and people: income and savings goals, charts, daily tasks, streaks, an AI coach and WhatsApp reminders.',
        (select id from public.products where slug = 'plan'), true, true)
on conflict (slug) do update set
  title = excluded.title, seo_title = excluded.seo_title, seo_description = excluded.seo_description,
  product_id = excluded.product_id, is_published = true, show_in_sitemap = true, updated_at = now();

delete from public.page_sections
 where page_id = (select id from public.pages where slug = 'plan')
   and id not in (select md5('retexia:section:plan:' || n)::uuid from generate_series(1, 5) n);
insert into public.page_sections (id, page_id, type, anchor, background, eyebrow, title, highlight, subtitle, content, sort_order, is_visible)
select md5('retexia:section:plan:' || v.n)::uuid, (select id from public.pages where slug = 'plan'),
       v.type, v.anchor, v.background, v.eyebrow, v.title, v.highlight, v.subtitle, v.content::jsonb, v.n, true
from (values
  (1, 'hero', null, 'surface', 'Retexia Plan · Free',
    'Reach your goals, one day at a time', 'one day at a time',
    'Income goals, savings goals and everything else, on charts you design. Tick off today''s tasks, keep your streak going and let the Retexia coach keep you on track.',
    '{"visual": "none", "show_halo": true, "primary_cta": {"label": "Start free", "href": "https://plan.retexia.com"}, "secondary_cta": {"label": "How it works", "href": "#how"}}'),
  (2, 'features', 'features', 'surface', 'What you get',
    'Everything you need to stay consistent', 'stay consistent', null,
    '{"source": "product", "columns": 2}'),
  (3, 'steps', 'how', 'sunk', 'How it works',
    'Set a goal, then show up every day', 'show up every day', null,
    $json${"items": [
      {"icon": "target", "title": "Set a goal", "text": "Pick income, savings, a habit or anything else, for this year, month or week."},
      {"icon": "chart-line", "title": "Track it", "text": "Add values to its chart whenever you like and see if you are ahead or behind."},
      {"icon": "list-checks", "title": "Do today's tasks", "text": "Your daily list, with repeats and a streak. A WhatsApp nudge every morning if you want."},
      {"icon": "bot", "title": "Ask the coach", "text": "Stuck or behind? The coach looks at your numbers and gives you the next step."}
    ]}$json$),
  (4, 'faq', 'faq', 'surface', 'Questions',
    'Questions about Plan', 'Plan', null,
    '{"product_slug": "plan"}'),
  (5, 'cta', null, 'sunk', null,
    'Your goals, every day, for free', 'for free',
    'Sign in with your Retexia account and set your first goal in a minute.',
    '{"primary_cta": {"label": "Start free", "href": "https://plan.retexia.com"}, "secondary_cta": {"label": "Talk to us", "href": "/contact"}}')
) as v (n, type, anchor, background, eyebrow, title, highlight, subtitle, content)
on conflict (id) do update set
  page_id = excluded.page_id, type = excluded.type, anchor = excluded.anchor, background = excluded.background,
  eyebrow = excluded.eyebrow, title = excluded.title, highlight = excluded.highlight, subtitle = excluded.subtitle,
  content = excluded.content, sort_order = excluded.sort_order, is_visible = excluded.is_visible;
