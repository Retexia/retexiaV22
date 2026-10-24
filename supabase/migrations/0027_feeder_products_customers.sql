-- =====================================================================
-- 0027: Retexia Feeder: the Feeder product catalogue and each customer's
-- products, form names and CRM links (schema "feeder").
--
--   feeder.products           product_id (= Feeder's product ID, the item_code
--                             in the courier file) | product_name | price
--                             (Feeder selling price) | delivery_fee | aliases
--                             (other names, for everyone) | active
--   feeder.customers          one row per customer: name | crm_links
--   feeder.customer_products  a customer's products: product_id | form_names
--                             (their Facebook / TikTok / CRM form names) |
--                             price (their own selling price; empty = Feeder's)
--   feeder.products_overview  each product with every customer's form names
--                             ("Diabetic tablets (Amaya)", …)
--   feeder.customers_overview each customer: name | crm_links | product_ids
--
-- Customers manage their own rows on feeder.retexia.com (My products, CRM
-- links); Bulk import sends them to the n8n worker with every build.
-- The 169 products are Feeder's list (reseller.feeder.lk → All Product);
-- delivery_fee starts at 450. Re-running updates names and prices, never a
-- customer's own data or a changed delivery fee.
-- Then: Supabase → Project Settings → Data API → Exposed schemas → add "feeder".
-- Safe to run again. Run after 0026.
-- =====================================================================

create schema if not exists feeder;
grant usage on schema feeder to authenticated, service_role;

create table if not exists feeder.products (
  product_id   int primary key check (product_id > 0),
  product_name text not null check (char_length(btrim(product_name)) between 1 and 200),
  price        numeric(12, 2) not null check (price >= 0),
  delivery_fee numeric(12, 2) not null default 450 check (delivery_fee >= 0),
  aliases      text[] not null default '{}',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table feeder.products is 'Feeder products. product_id = Feeder product ID (item_code in the courier CSV). price = Feeder selling price.';
comment on column feeder.products.aliases is 'Other names for this product, for every customer (spellings, Sinhala words).';

create table if not exists feeder.customers (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  name       text check (name is null or char_length(name) <= 120),
  crm_links  text[] not null default '{}' check (cardinality(crm_links) <= 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table feeder.customers is 'Feeder customers: name and CRM Google Sheet links (view access). Their products: feeder.customer_products.';

create table if not exists feeder.customer_products (
  user_id    uuid not null references feeder.customers (user_id) on delete cascade,
  product_id int not null references feeder.products (product_id) on delete cascade,
  form_names text[] not null default '{}' check (cardinality(form_names) <= 30),
  price      numeric(12, 2) check (price is null or price >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, product_id)
);
create index if not exists customer_products_product_idx on feeder.customer_products (product_id);
comment on table feeder.customer_products is 'A customer''s products: their form names (leads from these forms are this product) and their own selling price (empty = Feeder price).';

-- Customers read the catalogue and change only their own rows; the Retexia team can read everything.
alter table feeder.products enable row level security;
alter table feeder.customers enable row level security;
alter table feeder.customer_products enable row level security;
drop policy if exists catalogue_read on feeder.products;
create policy catalogue_read on feeder.products for select to authenticated using (true);
drop policy if exists own_row on feeder.customers;
create policy own_row on feeder.customers for all to authenticated
  using (user_id = (select auth.uid()) or (select public.is_privileged()))
  with check (user_id = (select auth.uid()));
drop policy if exists own_rows on feeder.customer_products;
create policy own_rows on feeder.customer_products for all to authenticated
  using (user_id = (select auth.uid()) or (select public.is_privileged()))
  with check (user_id = (select auth.uid()));
grant select on feeder.products to authenticated;
grant select, insert, update, delete on feeder.customers, feeder.customer_products to authenticated;
grant all on all tables in schema feeder to service_role;

create or replace view feeder.products_overview with (security_invoker = true) as
select p.product_id, p.product_name, p.price, p.delivery_fee,
       coalesce(array_agg(f.name || ' (' || coalesce(nullif(c.name, ''), 'customer') || ')' order by c.name, f.name)
                filter (where f.name is not null), '{}') as form_names,
       p.aliases, p.active
  from feeder.products p
  left join feeder.customer_products cp on cp.product_id = p.product_id
  left join feeder.customers c on c.user_id = cp.user_id
  left join lateral unnest(cp.form_names) as f(name) on true
 group by p.product_id;

create or replace view feeder.customers_overview with (security_invoker = true) as
select c.user_id, c.name, c.crm_links,
       coalesce(array_agg(cp.product_id order by cp.product_id) filter (where cp.product_id is not null), '{}') as product_ids,
       c.updated_at
  from feeder.customers c
  left join feeder.customer_products cp on cp.user_id = c.user_id
 group by c.user_id;
grant select on feeder.products_overview, feeder.customers_overview to authenticated, service_role;

-- Feeder's products (names and selling prices from reseller.feeder.lk); aliases only where none are set yet.
insert into feeder.products (product_id, product_name, price, aliases) values
  (39, 'Pull Reducer', 1490, '{}'::text[]),
  (44, 'Reading Glass', 990, '{}'::text[]),
  (61, 'Kinoki Cleansing Detox Foot Pads', 890, '{}'::text[]),
  (87, 'Magic Water Painting Book', 400, '{}'::text[]),
  (94, 'Kitchen Oil Sticker Heat Proof Aluminum Foil', 495, '{}'::text[]),
  (121, 'Nose Ear Eyebrow Portable Mini Trimmer', 1450, '{}'::text[]),
  (165, 'Eva Rain Coat Premium Quality', 1450, '{}'::text[]),
  (175, 'Kitchen Wall Sticker', 1490, '{}'::text[]),
  (192, 'Musical Cot Mobile', 2000, '{}'::text[]),
  (193, 'Food Making Set', 1500, '{}'::text[]),
  (194, 'CACTUS Dancing Toy', 1700, '{}'::text[]),
  (195, 'Ashwagandha oil 10ml', 990, '{}'::text[]),
  (196, 'Ayurwedha Beard Oil 30ml', 990, '{}'::text[]),
  (197, 'Mathra Hair Growth Spray 30ml', 990, '{}'::text[]),
  (198, 'Miracal Hair Growth Oil 30ml', 990, '{}'::text[]),
  (199, 'Sandhi Raja 30ml', 990, '{}'::text[]),
  (200, 'Lice Free Hair Spray 30ml', 990, '{}'::text[]),
  (203, 'Lips Balm 10g', 990, '{}'::text[]),
  (204, 'Wart Remover', 1490, array['Wartosin', 'Wartosin Cream', 'Wart Removal', 'Wartocin', 'Wartosine', 'Wartosin Gel', 'Skin Tag Remover', 'Mole Remover', 'Wart Cream']::text[]),
  (207, 'Varicose Relief Spray 60ml', 1490, '{}'::text[]),
  (215, 'Herbal hemo spray 30ml', 1490, '{}'::text[]),
  (219, 'Tyre Puncture Repair Tool Kit', 950, '{}'::text[]),
  (222, 'Varicose Relief Cream', 1490, '{}'::text[]),
  (226, 'FEGPLUS Hair & Beard Growth Serum 50ml', 1900, '{}'::text[]),
  (228, '8.5'' LCD Writing Tablet', 1500, '{}'::text[]),
  (229, 'English Book', 2200, '{}'::text[]),
  (230, 'Rechargeable Flash Card Reader', 1500, '{}'::text[]),
  (231, 'Wooden Calculation Shelf', 1450, '{}'::text[]),
  (232, 'Wall Mounted Urinal Potty - Frog', 1500, '{}'::text[]),
  (233, 'Baby Nose Cleaner Tool', 750, '{}'::text[]),
  (234, 'Baby Bath Toys', 1300, '{}'::text[]),
  (235, 'Breast Feeding Cover', 1500, '{}'::text[]),
  (236, 'Kids Learning Tablet', 1750, '{}'::text[]),
  (237, 'Head Shaping Pillow (18*23cm)', 1350, '{}'::text[]),
  (238, 'Baby Bibs - 7 days', 1300, '{}'::text[]),
  (239, '2pcs Silicone Spoon', 1000, '{}'::text[]),
  (240, 'Baby Safety Helmet', 1400, '{}'::text[]),
  (241, 'Talking Posters', 2500, '{}'::text[]),
  (242, '3+ Baby English Book', 2500, '{}'::text[]),
  (243, 'Cloth Books - 6Pcs', 900, '{}'::text[]),
  (244, '8Pcs Wash Cloths', 1000, '{}'::text[]),
  (245, 'Teether glove', 1000, '{}'::text[]),
  (246, '4 in 1 Cotton Blanket', 3000, '{}'::text[]),
  (247, 'Knee Protection Pad', 1000, '{}'::text[]),
  (248, 'Albert Design Gold Plated Bracelet', 2600, '{}'::text[]),
  (256, 'Manual Garlic Press Chopper', 850, '{}'::text[]),
  (258, 'Cake Turntable', 1250, '{}'::text[]),
  (265, 'Bottle Type Juice Blender', 1650, '{}'::text[]),
  (266, 'High Power USB Rechargeable Mini Torch', 950, '{}'::text[]),
  (278, 'ANC Airpod Pro', 2100, '{}'::text[]),
  (280, 'Wind Power Plane Toy', 950, '{}'::text[]),
  (287, 'Free Size Seamless Yoga Short & Top', 1950, '{}'::text[]),
  (288, '4 Pcs Hot Short (viscose)', 2050, '{}'::text[]),
  (289, '2 Pcs Super Soft Bath Brush', 1250, '{}'::text[]),
  (290, '16 Pcs Menicure Pedicure Set', 1550, '{}'::text[]),
  (294, 'Multifunctional Phone Holder', 950, '{}'::text[]),
  (297, 'Wearable Bath Towel', 1750, array['Bath Towel', 'Premium Towel', 'Towel', 'Bath Towl', 'Large Towel', 'Cotton Towel', 'Bath Towels', 'Premium Bath Towels', 'Premium Bath Towel']::text[]),
  (300, 'Water Proof Tape', 1350, '{}'::text[]),
  (314, 'Smart Side Bag', 2500, '{}'::text[]),
  (315, 'Ayora Ashwagandha Oil 30ml', 1100, '{}'::text[]),
  (316, 'Original Vericos Ayurvedic Oil 30ml', 1340, '{}'::text[]),
  (341, '3 in 1 100W Charging Cable', 850, '{}'::text[]),
  (342, 'Kinoki Cleansing Detox Foot Pad 20PCS', 1340, array['Kinoki', 'Kinoki Foot Pads', 'Detox Foot Pads', 'Foot Pads', 'Detox Pads', 'Kinoki Pads', 'Foot Detox Pads', 'Kinoki Detox', 'Kenoki Foot Pads', 'Kinoki Detox Foot Pads']::text[]),
  (343, 'FengShui Bracelet', 990, '{}'::text[]),
  (346, '5M Black Wall Sticker - White and Other', 1750, '{}'::text[]),
  (348, '3 IN 1 Zinc Alloy Charging Cable', 990, '{}'::text[]),
  (349, 'Waterproof Butyl Tape 5M', 1450, '{}'::text[]),
  (350, '2 pcs Double Arrow a reflective Stickers', 1200, '{}'::text[]),
  (352, 'Radium Star Stiker 100pcs', 990, '{}'::text[]),
  (353, 'Super Soft Bath Brush', 590, '{}'::text[]),
  (356, 'Wired Split Microphone', 1200, '{}'::text[]),
  (361, 'Magic Mesh', 1700, '{}'::text[]),
  (368, 'Radium Star Stiker 200pcs', 1450, '{}'::text[]),
  (371, 'Mini Speedy Food Chopper', 1450, '{}'::text[]),
  (372, 'Fun Gesture LED Light', 2250, '{}'::text[]),
  (375, 'Strawberry Lips Balm', 990, '{}'::text[]),
  (376, 'Wireless Door Bell', 1750, '{}'::text[]),
  (377, 'Active Charcoal Toothpaste', 1340, '{}'::text[]),
  (379, 'Meedani 30 Capsule', 1340, '{}'::text[]),
  (380, 'Aloevera Foot Crack Cream - 25g', 1340, array['aloevera 1340', 'Footcare cream 1340']::text[]),
  (381, '24g Gold Plated Bracelet', 1550, '{}'::text[]),
  (383, 'Migraine Relief Herbal Hair Oil 50ml', 990, '{}'::text[]),
  (384, 'Ayur Kesha Herbal Hair Oil 50ml', 990, '{}'::text[]),
  (386, 'Nurse Watch', 1600, '{}'::text[]),
  (392, '2Pcs Silicone Gel Spa Socks', 1200, '{}'::text[]),
  (394, '120W Charging Dock', 1550, '{}'::text[]),
  (395, 'Mosquito Repellent Spray 50ml', 990, '{}'::text[]),
  (396, 'Varicose Veins Oil - 30ml', 990, '{}'::text[]),
  (397, 'Muscle Gain Magic 30 Capsuals', 1340, '{}'::text[]),
  (403, 'Digital Kids Touch Screen Watch', 1200, '{}'::text[]),
  (409, 'Scrub Soap - Coffee & Turmeric 100g', 990, '{}'::text[]),
  (410, 'Whitening Soap - Niacinamide & Vitamin C (100g)', 990, '{}'::text[]),
  (411, 'Herbal Soap -Ginger & Aloe Vera (100g)', 990, '{}'::text[]),
  (412, 'Ranawara With Cinnamon Herbal Tea - 70g', 1550, '{}'::text[]),
  (413, 'Moringa With Citrus Herbal Tea - 75g', 1550, '{}'::text[]),
  (419, 'Nail repair serum 30ml', 1450, '{}'::text[]),
  (420, 'Herbal Pet Shampoo 200ml', 1490, '{}'::text[]),
  (421, 'Whitening Toothpaste', 1450, array['SP6 Toothpaste', 'SP 6', 'SP6', 'Brightening Toothpaste', 'Probiotic Toothpaste', 'SP6 Probiotic', 'SP 6 Toothpaste', 'Teeth Whitening Paste', 'Dath Sudu Karana', 'SP 6 Brightening Probiotic Toothpaste']::text[]),
  (433, 'Ayora Diabetic Care 30 tablets', 1340, array['Ayora Diabetic', 'Diabetic Care', 'Diabetic Tablet', 'Diabetes Tablet', 'Sugar Tablet', 'Sini Tablet', 'Diyawadiyawa Tablet', 'Diabatic Tablet', 'Diabetic Beheth', 'Sugar Care', 'Ayora Diabetic Care Tablet']::text[]),
  (436, 'Ayora Cholesterol Care 30 tablets', 1340, array['Ayora Cholesterol', 'Cholesterol Care', 'Cholesterol Tablet', 'Kolestrol Tablet', 'Cholestrol Tablet', 'Cholesterol Pills', 'Cholesterol Beheth', 'Heart Care Tablet', 'Ayora Cholesterol Care Tablet']::text[]),
  (437, 'Ayora Fat Burn 30 tablets', 1340, array['Ayora Fat Burn', 'Fat Burn Tablet', 'Fat Burner', 'Fat Burning Tablet', 'Weight Loss Tablet', 'Slimming Tablet', 'Medaya Adu Karana', 'Fat Bern Tablet', 'Weight Loss Pills', 'Fatburn 1340', 'Ayora Fat Burn Tablet']::text[]),
  (438, 'Ayora Black Hair Oil', 1340, array['Ayora Hair Oil', 'Black Hair Oil', 'Hair Growth Oil', 'Ayora Black Oil', 'Hair Oil', 'Konde Thel', 'Konde Wawena Thel', 'Hair Grow Oil', 'Kalu Konde Thel', 'Ayora Hair Growth', 'Ayora Hair Growth Black Hair Oil']::text[]),
  (439, 'Ayora Arshas Care Tablets', 1340, array['Ayora Hemorrhoids', 'Hemorrhoids Tablet', 'Piles Tablet', 'Piles Care', 'Arshas Tablet', 'Hemorrhoid Care', 'Hemoroids Tablet', 'Haemorrhoids Tablet', 'Piles Beheth', 'Ayora Hemorrhoids Care Tablet']::text[]),
  (441, 'Ayora Beard Growth Oil', 1340, array['Ayora Beard', 'Beard Spray', 'Beard Growth', 'Beard Oil Spray', 'Beard Grow Spray', 'Rewla Spray', 'Rewla Wawena', 'Ayora Bird Spray', 'Bread Spray', 'Beard Growth Spray', 'Ayora Beard Growth Spray']::text[]),
  (444, '20 Pads Kinoki Foot Patch', 1350, '{}'::text[]),
  (446, '"Lucky Leo X" Perfume bottle', 1250, '{}'::text[]),
  (447, '"Lucky Leo Charm" Perfume bottle', 1250, '{}'::text[]),
  (449, 'Ayora Underarm Cream', 1340, '{}'::text[]),
  (452, '"Leo Forest" Car diffuser perfume', 990, array['leo forest 990']::text[]),
  (453, 'Ayora Anti lice 30ml', 1340, '{}'::text[]),
  (454, 'Ayora Ashwaganda Tablets', 1340, '{}'::text[]),
  (455, 'Moringa Capsules', 1340, '{}'::text[]),
  (456, 'Garcinia Capsules', 1340, array['Ayuseth Garcinia', 'Garcinia Capsules', 'Garcinia Capsule', 'Garcinia', 'Garcenia', 'Garsinia', 'Ayuseth Capsules', 'Ayuseth', 'Garcinia Weight Loss', 'Goraka Capsules', 'Ayuseth Garcinia Capsules']::text[]),
  (457, 'Canereed (Thebu) Capsules', 1340, '{}'::text[]),
  (459, 'Sunglasses for Girls', 1250, '{}'::text[]),
  (460, 'Sunglasses for Boy', 1250, '{}'::text[]),
  (461, 'Tote Bag - (RAW)', 1100, '{}'::text[]),
  (462, 'Non Printed Purse', 990, '{}'::text[]),
  (463, 'Hair powder', 990, '{}'::text[]),
  (464, 'USA With Dharma Chakra pendant', 990, '{}'::text[]),
  (465, 'Vloging Kit', 1890, '{}'::text[]),
  (466, 'Voltage Detector', 1350, '{}'::text[]),
  (467, 'VIP Hair Color Shampoo', 1790, array['VIP Shampoo', 'VIP Hair Colour', 'VIP Hair Color Shampoo', 'Hair Colour Shampoo', 'Hair Color Shampoo', 'Hair Dye Shampoo', 'Black Hair Shampoo', 'VIP Hair Dye', 'VIP Colour Shampoo', 'VIP Hair Colour Shampoo']::text[]),
  (468, 'Ayora Garcinia Max Tablets', 1340, '{}'::text[]),
  (469, 'Children water Book', 990, '{}'::text[]),
  (471, 'Ayora Fatty Liver Tablets', 1340, '{}'::text[]),
  (472, 'Pet Shampoo 200ml', 1250, '{}'::text[]),
  (473, '10x booster capsules', 1340, '{}'::text[]),
  (474, 'Nail Care Cream', 1450, '{}'::text[]),
  (475, 'Arthritis Pain Relied 30ml', 1340, '{}'::text[]),
  (476, 'Joint Pain Relief Plus + 30ml', 1340, '{}'::text[]),
  (477, 'Stress Relief 30ml', 1340, '{}'::text[]),
  (478, 'Mosquito Repellent Lotion 30g', 1350, '{}'::text[]),
  (479, 'Ayur Hair Care Cream-100g', 1950, '{}'::text[]),
  (480, 'Ayur Hair Care Serum- 30ml', 1450, '{}'::text[]),
  (481, 'Secret Whitening Cream 30g ( Under Arm / Private Areas )', 1950, '{}'::text[]),
  (482, 'VIP Whitening Face Cream 30g', 1950, '{}'::text[]),
  (483, 'Portable Detergent', 1150, '{}'::text[]),
  (484, 'Shoe Wet Wipes', 1190, '{}'::text[]),
  (485, 'Flex Tape', 1190, '{}'::text[]),
  (486, 'Stainless Steel Cleaning Paste', 995, '{}'::text[]),
  (488, 'Oil Film Cleaning Brush', 1290, '{}'::text[]),
  (490, 'Stretch Marks Remover Essential Oil', 1490, '{}'::text[]),
  (491, 'Devil Eye LED Car Light Sticker', 1850, '{}'::text[]),
  (492, 'Cartier Bangle', 1750, '{}'::text[]),
  (493, '10 Pcs Blue Toilet Blocks', 1250, '{}'::text[]),
  (495, 'Kids Anti Mosquito Repellent Watch', 950, '{}'::text[]),
  (496, 'Portable Compression Towel', 950, '{}'::text[]),
  (497, '12 Pcs Knife Set', 1250, '{}'::text[]),
  (498, 'CR777 Perfume', 1250, '{}'::text[]),
  (499, 'BLACK ANGEL Perfume', 1250, '{}'::text[]),
  (501, 'London Dreams Perfume', 1250, '{}'::text[]),
  (502, 'Velora Medaharani Guli 60pcs', 1540, '{}'::text[]),
  (503, 'Velora Ashwagandha Toffee 60pcs', 1540, '{}'::text[]),
  (504, 'Velora Diyawadiya Suwa Guli 60pcs', 1540, '{}'::text[]),
  (505, 'Night dress Light colour', 1290, '{}'::text[]),
  (506, 'Plant booster', 1340, '{}'::text[]),
  (507, 'Tile expert tile cleaner', 1450, '{}'::text[]),
  (508, 'Karapothu cleaner', 990, '{}'::text[]),
  (514, '"Leo Flora" Car diffuser perfume', 990, '{}'::text[]),
  (515, '"Leo Aura" Car diffuser perfume', 990, '{}'::text[]),
  (516, 'AyurSri Niacinamide Face Serum 30ml', 1950, '{}'::text[]),
  (517, 'Ayora Gastric Care 30Tablets', 1340, array['Gastritis 1340', 'Ayora Ayurvedic Gastric Care Tablets', 'Gastric Care']::text[]),
  (518, '5M Kitchen Wall Sticker - Black', 1550, '{}'::text[]),
  (519, 'Tobacco''s Toothpaste', 1490, '{}'::text[]),
  (520, 'Ayora Arthritis Oil 30ml', 1340, array['Arthritis 1340']::text[]),
  (521, 'Leo Room Diffuser *Jasmine*', 1750, '{}'::text[]),
  (522, 'Leo Room diffuser *Rose*', 1750, array['Room Diffuser 1750']::text[]),
  (523, 'Dadahara Kushta Blam', 1450, '{}'::text[])
on conflict (product_id) do update
   set product_name = excluded.product_name,
       price = excluded.price,
       aliases = case when feeder.products.aliases = '{}' then excluded.aliases else feeder.products.aliases end,
       updated_at = now();
