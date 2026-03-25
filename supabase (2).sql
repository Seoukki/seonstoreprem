-- ══════════════════════════════════════════════════
-- SeonsPrems — Supabase SQL Setup
-- Jalankan di: Supabase > SQL Editor > New Query
-- ══════════════════════════════════════════════════

-- 1. PRODUCTS
create table if not exists products (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text not null check (category in ('streaming','music','productivity','ai','gaming','other')),
  description text,
  image_url   text,
  prices      jsonb not null default '{}',
  stock       integer not null default 0,
  badge       text default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. ORDERS
create table if not exists orders (
  id            uuid primary key default gen_random_uuid(),
  txn_id        text unique not null,
  product_id    uuid references products(id),
  product_name  text not null,
  category      text,
  email         text not null,
  whatsapp      text not null,
  duration      text not null,
  quantity      integer not null default 1,
  total         bigint not null,
  account_data  jsonb,
  status        text not null default 'pending' check (status in ('pending','paid','failed','expired')),
  paid_at       timestamptz,
  created_at    timestamptz not null default now()
);

-- 3. ACCOUNT POOL
create table if not exists account_pool (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid references products(id) on delete cascade,
  account_data jsonb not null,
  used         boolean not null default false,
  order_id     uuid references orders(id),
  created_at   timestamptz not null default now()
);

-- 4. BROADCAST
create table if not exists broadcast (
  id         uuid primary key default gen_random_uuid(),
  message    text not null,
  active     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 5. TESTIMONIALS
create table if not exists testimonials (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  product          text not null,
  rating           integer not null default 5,
  message          text not null,
  avatar_initials  text,
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);

-- INDEXES
create index if not exists idx_orders_txn_id  on orders(txn_id);
create index if not exists idx_orders_status  on orders(status);
create index if not exists idx_orders_created on orders(created_at desc);
create index if not exists idx_pool_product   on account_pool(product_id) where not used;
create index if not exists idx_products_cat   on products(category) where active;

-- ROW LEVEL SECURITY
alter table products     enable row level security;
alter table orders       enable row level security;
alter table account_pool enable row level security;
alter table broadcast    enable row level security;
alter table testimonials enable row level security;

create policy "public_read_products"     on products     for select using (active = true);
create policy "public_insert_orders"     on orders       for insert with check (true);
create policy "public_read_orders"       on orders       for select using (true);
create policy "public_read_broadcast"    on broadcast    for select using (active = true);
create policy "public_read_testimonials" on testimonials for select using (active = true);
create policy "no_public_pool"           on account_pool for select using (false);

-- SAMPLE DATA
insert into testimonials (name, product, rating, message, avatar_initials) values
  ('Aldi S.', 'Spotify Premium', 5, 'Akun langsung aktif kurang dari 1 menit! Paling cepat yang pernah saya coba.', 'AS'),
  ('Dina R.', 'Netflix Premium', 5, 'Harga murah, akun bagus, tidak pernah ada masalah sudah 3 bulan. Recommended!', 'DR'),
  ('Budi P.', 'ChatGPT Plus', 5, 'Top banget! Beli jam 2 pagi langsung dapat akunnya. Support responsif.', 'BP'),
  ('Sari W.', 'Canva Pro', 5, 'Murah banget dibanding beli sendiri. Pengirimannya otomatis, keren!', 'SW'),
  ('Reza F.', 'YouTube Premium', 5, 'Sudah 6 bulan langganan di sini. Tidak pernah ada masalah, terpercaya.', 'RF')
on conflict do nothing;

insert into broadcast (message, active) values
  ('Selamat datang di SeonsPrems! Dapatkan akun premium terlengkap dengan harga terbaik. Pengiriman otomatis 24/7!', true)
on conflict do nothing;
