-- ============================================================
-- AUTH & MULTI-TENANT SCHEMA UPDATE
-- Run this in Supabase SQL Editor
-- ============================================================

-- USER PROFILES (links auth.users to roles + orgs)
create table if not exists user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'viewer' check (role in ('super_admin','admin','viewer')),
  org_id uuid references organizations(id) on delete set null,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-create profile on signup
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into user_profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- INVITATIONS table
create table if not exists invitations (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null default 'viewer' check (role in ('admin','viewer')),
  org_id uuid references organizations(id) on delete cascade,
  invited_by uuid references auth.users(id) on delete set null,
  token text unique not null default encode(gen_random_bytes(32), 'hex'),
  accepted_at timestamptz,
  expires_at timestamptz default now() + interval '7 days',
  created_at timestamptz default now()
);

-- RLS on user_profiles
alter table user_profiles enable row level security;

drop policy if exists "Users can read own profile" on user_profiles;
create policy "Users can read own profile"
  on user_profiles for select
  using (auth.uid() = id);

drop policy if exists "Super admins read all profiles" on user_profiles;
create policy "Super admins read all profiles"
  on user_profiles for select
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'super_admin'
    )
  );

drop policy if exists "Super admins update all profiles" on user_profiles;
create policy "Super admins update all profiles"
  on user_profiles for update
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'super_admin'
    )
  );

drop policy if exists "Super admins insert profiles" on user_profiles;
create policy "Super admins insert profiles"
  on user_profiles for insert
  with check (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'super_admin'
    )
  );

-- RLS on invitations
alter table invitations enable row level security;

drop policy if exists "Super admins manage invitations" on invitations;
create policy "Super admins manage invitations"
  on invitations for all
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'super_admin'
    )
  );

drop policy if exists "Anyone can read own invitation by token" on invitations;
create policy "Anyone can read own invitation by token"
  on invitations for select
  using (true);

-- UPDATE assets RLS to be org-aware
drop policy if exists "Allow all assets" on assets;

create policy "Super admins see all assets"
  on assets for all
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'super_admin'
    )
  )
  with check (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'super_admin'
    )
  );

create policy "Admins manage their org assets"
  on assets for all
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid()
        and role = 'admin'
        and org_id = assets.org_id
    )
  )
  with check (
    exists (
      select 1 from user_profiles
      where id = auth.uid()
        and role = 'admin'
        and org_id = assets.org_id
    )
  );

create policy "Viewers read their org assets"
  on assets for select
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid()
        and role = 'viewer'
        and org_id = assets.org_id
    )
  );

-- UPDATE checkouts + maintenance RLS similarly
drop policy if exists "Allow all checkouts" on checkouts;
drop policy if exists "Allow all maintenance" on maintenance_logs;

create policy "Auth users manage their org checkouts"
  on checkouts for all
  using (
    exists (
      select 1 from user_profiles up
      join assets a on a.id = checkouts.asset_id
      where up.id = auth.uid()
        and (up.role = 'super_admin' or up.org_id = a.org_id)
    )
  );

create policy "Auth users manage their org maintenance"
  on maintenance_logs for all
  using (
    exists (
      select 1 from user_profiles up
      join assets a on a.id = maintenance_logs.asset_id
      where up.id = auth.uid()
        and (up.role = 'super_admin' or up.org_id = a.org_id)
    )
  );

-- UPDATE organizations RLS
drop policy if exists "Allow all organizations" on organizations;

create policy "Super admins manage orgs"
  on organizations for all
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and role = 'super_admin'
    )
  );

create policy "Users read own org"
  on organizations for select
  using (
    exists (
      select 1 from user_profiles
      where id = auth.uid() and org_id = organizations.id
    )
  );

-- Make yourself super_admin (run after first login with Google/Apple)
-- REPLACE the email below with your actual email
-- UPDATE user_profiles SET role = 'super_admin' WHERE email = 'your@email.com';

-- Indexes
create index if not exists user_profiles_role_idx on user_profiles(role);
create index if not exists user_profiles_org_id_idx on user_profiles(org_id);
create index if not exists invitations_token_idx on invitations(token);
create index if not exists invitations_email_idx on invitations(email);
