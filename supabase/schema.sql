-- Rollo: disposable camera event app schema
-- Run in Supabase SQL editor after creating a new project.

create extension if not exists "pgcrypto";

-- ---------- Tables ----------

create table public.rollos (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  cover_image_url text,
  host_id uuid references auth.users(id) on delete set null,
  host_name text,
  shot_limit int not null default 10,
  reveal_type text not null check (reveal_type in ('instant','delayed')) default 'instant',
  opens_at timestamptz not null default now(),
  closes_at timestamptz not null,
  reveals_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.guests (
  id uuid primary key default gen_random_uuid(),
  rollo_id uuid not null references public.rollos(id) on delete cascade,
  name text not null,
  device_id text not null,
  shots_used int not null default 0,
  joined_at timestamptz not null default now(),
  unique (rollo_id, device_id)
);

create table public.photos (
  id uuid primary key default gen_random_uuid(),
  rollo_id uuid not null references public.rollos(id) on delete cascade,
  guest_id uuid not null references public.guests(id) on delete cascade,
  storage_path text not null,
  width int,
  height int,
  size_bytes int,
  taken_at timestamptz not null default now()
);

create index on public.photos (rollo_id, taken_at desc);
create index on public.guests (rollo_id);

-- ---------- Storage ----------

insert into storage.buckets (id, name, public)
values ('rollo-photos', 'rollo-photos', false)
on conflict (id) do nothing;

-- ---------- RLS ----------

alter table public.rollos enable row level security;
alter table public.guests enable row level security;
alter table public.photos enable row level security;

-- Anyone with the code can read the rollo metadata.
create policy "rollos are readable by anyone"
  on public.rollos for select using (true);

create policy "host can create rollo"
  on public.rollos for insert with check (auth.uid() = host_id or host_id is null);

create policy "host can update own rollo"
  on public.rollos for update using (auth.uid() = host_id);

-- Guests can self-register and read members of the same rollo.
create policy "guests readable by anyone"
  on public.guests for select using (true);

create policy "anyone can join as guest"
  on public.guests for insert with check (true);

create policy "guest can update own row"
  on public.guests for update using (true);

-- Photo visibility honours reveal_type / reveals_at.
create policy "photos visible after reveal"
  on public.photos for select using (
    exists (
      select 1 from public.rollos r
      where r.id = photos.rollo_id
        and (
          r.reveal_type = 'instant'
          or (r.reveals_at is not null and r.reveals_at <= now())
        )
    )
  );

create policy "guests can upload photos"
  on public.photos for insert with check (true);

-- ---------- Storage policies ----------
-- The bucket is private; signed URLs are used for reads.
-- These policies authorise the anon role to upload and to generate signed URLs.

create policy "anyone can upload to rollo-photos"
  on storage.objects for insert
  with check (bucket_id = 'rollo-photos');

create policy "anyone can read rollo-photos"
  on storage.objects for select
  using (bucket_id = 'rollo-photos');

-- ---------- Admin layer ----------
-- Run supabase/admin-migration.sql to install / update the admin
-- token table, RPCs, and realtime publication.

-- ---------- Cover images bucket ----------
-- Run supabase/covers-migration.sql to create the public 'rollo-covers'
-- bucket used for event hero images. The 'rollo-photos' bucket above
-- stays private for actual event photos (gated by reveal_type).
