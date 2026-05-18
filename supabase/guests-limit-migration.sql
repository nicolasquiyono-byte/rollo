-- ============================================================
-- Wizard: guest limit + visibility permissions
-- ============================================================
-- Adds max_guests (free tier cap of 5 — not yet enforced at app/RLS level,
-- just persisted) and photos_visible_to_all (cosmetic for now; future RLS
-- will filter photos by guest_id when this is false).

alter table public.rollos
  add column if not exists max_guests integer not null default 5;

alter table public.rollos
  add column if not exists photos_visible_to_all boolean not null default true;

-- Recreate create_rollo RPC with the two new params at the end (backward-compat
-- defaults so older clients keep working).
drop function if exists public.create_rollo(text, text, text, int, text, timestamptz, timestamptz, text, text);
drop function if exists public.create_rollo(text, text, text, int, text, timestamptz, timestamptz, text, text, int, boolean);

create function public.create_rollo(
  p_code text,
  p_name text,
  p_host_name text,
  p_shot_limit int,
  p_reveal_type text,
  p_closes_at timestamptz,
  p_reveals_at timestamptz,
  p_cover_image_url text,
  p_filter text default 'original',
  p_max_guests int default 5,
  p_photos_visible_to_all boolean default true
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
    (code, name, host_name, shot_limit, reveal_type, closes_at, reveals_at,
     cover_image_url, filter, max_guests, photos_visible_to_all)
  values
    (p_code, p_name, p_host_name, p_shot_limit, p_reveal_type, p_closes_at, p_reveals_at,
     p_cover_image_url, p_filter, p_max_guests, p_photos_visible_to_all)
  returning id into v_id;
  insert into public.rollo_admins (rollo_id, token) values (v_id, v_token);
  return json_build_object('id', v_id, 'code', p_code, 'admin_token', v_token);
end;
$$;

grant execute on function public.create_rollo(text, text, text, int, text, timestamptz, timestamptz, text, text, int, boolean) to anon, authenticated;

-- Verification
select 'columns' as label,
       string_agg(column_name, ', ' order by column_name) as value
  from information_schema.columns
  where table_schema='public' and table_name='rollos'
    and column_name in ('max_guests','photos_visible_to_all','filter','shot_limit')
union all
select 'create_rollo arg count',
       (pronargs)::text
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='create_rollo'
  limit 1;
