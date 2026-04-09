-- ============================================================
-- VIDOR ASSET MANAGER -- Database Schema
-- Run this in Supabase SQL Editor
-- ============================================================

-- ORGANIZATIONS (multi-tenant foundation)
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  plan text not null default 'free',
  created_at timestamptz default now()
);

-- ASSETS (core table)
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  asset_id text not null,
  category text not null default '',
  category_label text not null default '',
  make text not null default '',
  model text not null default '',
  description text not null default '',
  serial text not null default 'TBD',
  status text not null default 'active',
  condition text not null default 'good',
  notes text not null default '',
  location text not null default '',
  assigned_to text not null default '',
  purchase_date date,
  purchase_price numeric(10,2),
  current_value numeric(10,2),
  photo_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(org_id, asset_id)
);

-- CHECKOUT / CHECK-IN LOG
create table if not exists checkouts (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references assets(id) on delete cascade not null,
  org_id uuid references organizations(id) on delete cascade not null,
  checked_out_by text not null,
  checked_out_at timestamptz default now(),
  due_back_at timestamptz,
  checked_in_at timestamptz,
  notes text not null default '',
  created_at timestamptz default now()
);

-- MAINTENANCE LOG
create table if not exists maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid references assets(id) on delete cascade not null,
  org_id uuid references organizations(id) on delete cascade not null,
  type text not null default 'service',
  description text not null default '',
  performed_by text not null default '',
  performed_at date not null default current_date,
  cost numeric(10,2),
  next_due_at date,
  notes text not null default '',
  created_at timestamptz default now()
);

-- AUDIT LOG
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  asset_id uuid references assets(id) on delete set null,
  action text not null,
  field_changed text,
  old_value text,
  new_value text,
  performed_by text not null default 'system',
  created_at timestamptz default now()
);

-- CATEGORIES (per-org customizable)
create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade not null,
  key text not null,
  label text not null,
  group_label text not null default 'General',
  sort_order int not null default 0,
  unique(org_id, key)
);

-- STORAGE BUCKET for asset photos
insert into storage.buckets (id, name, public) 
values ('asset-photos', 'asset-photos', true)
on conflict do nothing;

-- STORAGE POLICY: allow all reads (public bucket)
create policy "Public read asset photos"
  on storage.objects for select
  using (bucket_id = 'asset-photos');

-- STORAGE POLICY: allow authenticated uploads
create policy "Authenticated upload asset photos"
  on storage.objects for insert
  with check (bucket_id = 'asset-photos');

create policy "Authenticated update asset photos"
  on storage.objects for update
  using (bucket_id = 'asset-photos');

create policy "Authenticated delete asset photos"
  on storage.objects for delete
  using (bucket_id = 'asset-photos');

-- INDEXES
create index if not exists assets_org_id_idx on assets(org_id);
create index if not exists assets_category_idx on assets(org_id, category);
create index if not exists assets_status_idx on assets(org_id, status);
create index if not exists checkouts_asset_id_idx on checkouts(asset_id);
create index if not exists maintenance_asset_id_idx on maintenance_logs(asset_id);
create index if not exists audit_org_id_idx on audit_log(org_id);

-- AUTO-UPDATE updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger assets_updated_at
  before update on assets
  for each row execute function update_updated_at();

-- RLS (Row Level Security) - foundation for multi-tenant
alter table organizations enable row level security;
alter table assets enable row level security;
alter table checkouts enable row level security;
alter table maintenance_logs enable row level security;
alter table audit_log enable row level security;
alter table categories enable row level security;

-- For now: open policies (single user, no auth yet)
-- Phase 2 will lock these down per-user/org
create policy "Allow all organizations" on organizations for all using (true) with check (true);
create policy "Allow all assets" on assets for all using (true) with check (true);
create policy "Allow all checkouts" on checkouts for all using (true) with check (true);
create policy "Allow all maintenance" on maintenance_logs for all using (true) with check (true);
create policy "Allow all audit" on audit_log for all using (true) with check (true);
create policy "Allow all categories" on categories for all using (true) with check (true);

-- SEED: Create Vidor Media org and default categories
insert into organizations (id, name, slug, plan)
values ('00000000-0000-0000-0000-000000000001', 'Vidor Media Productions', 'vidor-media', 'pro')
on conflict do nothing;

insert into categories (org_id, key, label, group_label, sort_order) values
('00000000-0000-0000-0000-000000000001','GUITARS','Guitars','Audio',1),
('00000000-0000-0000-0000-000000000001','AMPLIFIERS','Amplifiers','Audio',2),
('00000000-0000-0000-0000-000000000001','KEYBOARDS_AND_PIANOS','Keyboards & Pianos','Audio',3),
('00000000-0000-0000-0000-000000000001','SYNTHESIZERS','Synthesizers','Audio',4),
('00000000-0000-0000-0000-000000000001','EURORACK_MODULES','Eurorack Modules','Audio',5),
('00000000-0000-0000-0000-000000000001','CONTROLLERS_AND_SEQUENCERS','Controllers & Sequencers','Audio',6),
('00000000-0000-0000-0000-000000000001','SAMPLERS_AND_GROOVEBOXES','Samplers & Grooveboxes','Audio',7),
('00000000-0000-0000-0000-000000000001','MIXERS_AND_INTERFACES','Mixers & Interfaces','Audio',8),
('00000000-0000-0000-0000-000000000001','STUDIO_MONITORS','Studio Monitors','Audio',9),
('00000000-0000-0000-0000-000000000001','MICROPHONES','Microphones','Audio',10),
('00000000-0000-0000-0000-000000000001','WIRELESS_SYSTEMS','Wireless Systems','Audio',11),
('00000000-0000-0000-0000-000000000001','HEADPHONES','Headphones','Audio',12),
('00000000-0000-0000-0000-000000000001','RECORDERS','Recorders','Audio',13),
('00000000-0000-0000-0000-000000000001','EFFECTS','Effects','Audio',14),
('00000000-0000-0000-0000-000000000001','TUNERS','Tuners','Audio',15),
('00000000-0000-0000-0000-000000000001','CAMERAS','Cameras','Photo & Video',16),
('00000000-0000-0000-0000-000000000001','LENSES','Lenses','Photo & Video',17),
('00000000-0000-0000-0000-000000000001','FLASH_AND_TRIGGERS','Flash & Triggers','Photo & Video',18),
('00000000-0000-0000-0000-000000000001','LIGHTING','Lighting','Photo & Video',19),
('00000000-0000-0000-0000-000000000001','BATTERIES_AND_POWER','Batteries & Power','Photo & Video',20),
('00000000-0000-0000-0000-000000000001','GIMBALS_AND_STABILIZERS','Gimbals & Stabilizers','Photo & Video',21),
('00000000-0000-0000-0000-000000000001','CAMERA_SUPPORT','Camera Support','Photo & Video',22),
('00000000-0000-0000-0000-000000000001','EDELKRONE_MOTION_CONTROL','edelkrone Motion Control','Photo & Video',23),
('00000000-0000-0000-0000-000000000001','VIDEO_MONITORING','Video Monitoring','Photo & Video',24),
('00000000-0000-0000-0000-000000000001','COLOR_AND_CALIBRATION','Color & Calibration','Photo & Video',25),
('00000000-0000-0000-0000-000000000001','STORAGE','Storage','Systems',26),
('00000000-0000-0000-0000-000000000001','CASES_AND_BAGS','Cases & Bags','Systems',27),
('00000000-0000-0000-0000-000000000001','DIY_AND_LAB','DIY & Lab','Systems',28),
('00000000-0000-0000-0000-000000000001','COMPUTERS_AND_DISPLAYS','Computers & Displays','Systems',29),
('00000000-0000-0000-0000-000000000001','SOFTWARE','Software','Systems',30),
('00000000-0000-0000-0000-000000000001','DOMAINS','Domains','Systems',31)
on conflict do nothing;
