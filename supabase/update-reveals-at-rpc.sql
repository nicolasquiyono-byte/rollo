-- ============================================================
-- Update reveal time RPC
-- ============================================================
-- Lets an admin push back (or pull in) the reveal time of a delayed
-- rollo after it's already created, without exposing direct UPDATE
-- access to the table. Verifies the admin token before touching the
-- row — same pattern as close_rollo_now / reveal_rollo_now.

create or replace function public.update_reveal_time(
  p_token uuid,
  p_reveals_at timestamptz
) returns public.rollos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rollo public.rollos;
  v_rollo_id uuid;
begin
  -- Verify the admin token. rollo_admins is the lookup table the other
  -- admin RPCs use (see admin-migration.sql).
  select rollo_id into v_rollo_id
  from public.rollo_admins
  where token = p_token;

  if v_rollo_id is null then
    raise exception 'invalid admin token';
  end if;

  -- Apply the update and return the fresh rollo row so the client can
  -- refresh its local state in one round-trip.
  update public.rollos
  set reveals_at = p_reveals_at
  where id = v_rollo_id
  returning * into v_rollo;

  return v_rollo;
end;
$$;

grant execute on function public.update_reveal_time(uuid, timestamptz) to anon, authenticated;
