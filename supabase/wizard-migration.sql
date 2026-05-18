-- ============================================================
-- Wizard: add filter column + extend create_rollo RPC
-- ============================================================
-- Adds the 'filter' column to rollos so the wizard's camera-style
-- choice (original / vintage / bw) is persisted. The RPC gains a
-- p_filter param with default 'original' to stay backward-compatible
-- with any existing caller that doesn't pass it.

-- 1. Column + check constraint
alter table public.rollos add column if not exists filter text not null default 'original';

alter table public.rollos drop constraint if exists rollos_filter_check;
alter table public.rollos add constraint rollos_filter_check
  check (filter in ('original', 'vintage', 'bw'));

-- 2. Recreate RPC with the new param at the end (positional safety)
drop function if exists public.create_rollo(text, text, text, int, text, timestamptz, timestamptz, text);
drop function if exists public.create_rollo(text, text, text, int, text, timestamptz, timestamptz, text, text);

create function public.create_rollo(
  p_code text,
  p_name text,
  p_host_name text,
  p_shot_limit int,
  p_reveal_type text,
  p_closes_at timestamptz,
  p_reveals_at timestamptz,
  p_cover_image_url text,
  p_filter text default 'original'
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
    (code, name, host_name, shot_limit, reveal_type, closes_at, reveals_at, cover_image_url, filter)
  values
    (p_code, p_name, p_host_name, p_shot_limit, p_reveal_type, p_closes_at, p_reveals_at, p_cover_image_url, p_filter)
  returning id into v_id;
  insert into public.rollo_admins (rollo_id, token) values (v_id, v_token);
  return json_build_object('id', v_id, 'code', p_code, 'admin_token', v_token);
end;
$$;

grant execute on function public.create_rollo(text, text, text, int, text, timestamptz, timestamptz, text, text) to anon, authenticated;

-- 3. Verification
select 'filter column' as label,
       coalesce((select data_type from information_schema.columns
                 where table_schema='public' and table_name='rollos' and column_name='filter'),
                'MISSING') as value
union all
select 'create_rollo signature args',
       (select pg_get_function_arguments(oid)
        from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='public' and p.proname='create_rollo' limit 1);
