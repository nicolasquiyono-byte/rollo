-- ============================================================
-- Admin dashboard migration (idempotente)
-- Corre esto en el SQL editor de Supabase.
-- ============================================================

-- 1. Tabla con tokens de admin (separada para que anon no los lea vía SELECT * on rollos)
create table if not exists public.rollo_admins (
  rollo_id uuid primary key references public.rollos(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);

alter table public.rollo_admins enable row level security;
-- Sin policies = anon no puede SELECT/UPDATE/DELETE. Solo los RPCs SECURITY DEFINER
-- (que corren como owner) tocan esta tabla.

-- 2. Backfill: rollos creados antes de esta migración necesitan un token.
--    gen_random_uuid() vive en pg_catalog (siempre disponible, sin depender
--    del schema 'extensions' donde Supabase instala pgcrypto).
insert into public.rollo_admins (rollo_id, token)
select id, replace(gen_random_uuid()::text, '-', '')
from public.rollos
where id not in (select rollo_id from public.rollo_admins);

-- 3. RPC: crea rollo + admin token atómicamente. Devuelve el token al cliente.
drop function if exists public.create_rollo(text, text, text, int, text, timestamptz, timestamptz, text);
create function public.create_rollo(
  p_code text,
  p_name text,
  p_host_name text,
  p_shot_limit int,
  p_reveal_type text,
  p_closes_at timestamptz,
  p_reveals_at timestamptz,
  p_cover_image_url text
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_token text := replace(gen_random_uuid()::text, '-', '');
begin
  insert into public.rollos
    (code, name, host_name, shot_limit, reveal_type, closes_at, reveals_at, cover_image_url)
  values
    (p_code, p_name, p_host_name, p_shot_limit, p_reveal_type, p_closes_at, p_reveals_at, p_cover_image_url)
  returning id into v_id;
  insert into public.rollo_admins (rollo_id, token) values (v_id, v_token);
  return json_build_object('id', v_id, 'code', p_code, 'admin_token', v_token);
end;
$$;
grant execute on function public.create_rollo(text, text, text, int, text, timestamptz, timestamptz, text) to anon, authenticated;

-- 4. RPC: valida token y devuelve el rollo completo (lo usa la página /admin)
drop function if exists public.get_rollo_by_admin_token(text);
create function public.get_rollo_by_admin_token(p_token text)
returns public.rollos
language sql
security definer
set search_path = public
stable
as $$
  select r.*
  from public.rollos r
  join public.rollo_admins a on a.rollo_id = r.id
  where a.token = p_token;
$$;
grant execute on function public.get_rollo_by_admin_token(text) to anon, authenticated;

-- 5. RPC: cierra rollo (mueve closes_at a now)
drop function if exists public.close_rollo_now(text);
create function public.close_rollo_now(p_token text)
returns public.rollos
language plpgsql
security definer
set search_path = public
as $$
declare r public.rollos;
begin
  update public.rollos
  set closes_at = now()
  from public.rollo_admins a
  where a.rollo_id = public.rollos.id and a.token = p_token
  returning public.rollos.* into r;
  if r.id is null then
    raise exception 'invalid_admin_token' using errcode = '28000';
  end if;
  return r;
end;
$$;
grant execute on function public.close_rollo_now(text) to anon, authenticated;

-- 6. RPC: revela fotos (mueve reveals_at a now)
drop function if exists public.reveal_rollo_now(text);
create function public.reveal_rollo_now(p_token text)
returns public.rollos
language plpgsql
security definer
set search_path = public
as $$
declare r public.rollos;
begin
  update public.rollos
  set reveals_at = now()
  from public.rollo_admins a
  where a.rollo_id = public.rollos.id and a.token = p_token
  returning public.rollos.* into r;
  if r.id is null then
    raise exception 'invalid_admin_token' using errcode = '28000';
  end if;
  return r;
end;
$$;
grant execute on function public.reveal_rollo_now(text) to anon, authenticated;

-- 7. Realtime publication para el dashboard (guests + photos en vivo)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'photos'
  ) then
    alter publication supabase_realtime add table public.photos;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'guests'
  ) then
    alter publication supabase_realtime add table public.guests;
  end if;
end $$;

-- 8. Verificación
select 'rollo_admins'::text as label, count(*)::text as value from public.rollo_admins
union all
select 'rollos sin admin', count(*)::text from public.rollos r
  where not exists (select 1 from public.rollo_admins a where a.rollo_id = r.id)
union all
select 'fns instaladas', string_agg(proname, ', ' order by proname)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('create_rollo', 'get_rollo_by_admin_token', 'close_rollo_now', 'reveal_rollo_now')
union all
select 'realtime tables', string_agg(tablename, ', ' order by tablename)
  from pg_publication_tables
  where pubname = 'supabase_realtime' and schemaname = 'public';
