-- ============================================================
-- Update reveal settings RPC
-- ============================================================
-- Supersedes update_reveal_time. Lets the admin flip a rollo between
-- "instant" (photos visible as soon as they're taken) and "delayed"
-- (photos hidden until reveals_at), and pick the reveal moment in
-- the delayed case — all from the admin dashboard.
--
-- Same SECURITY DEFINER + token check pattern as the other admin
-- RPCs.

drop function if exists public.update_reveal_time(uuid, timestamptz);

create or replace function public.update_reveal_settings(
  p_token uuid,
  p_reveal_type text,        -- 'instant' or 'delayed'
  p_reveals_at timestamptz   -- ignored unless p_reveal_type = 'delayed'
) returns public.rollos
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rollo public.rollos;
  v_rollo_id uuid;
begin
  if p_reveal_type not in ('instant', 'delayed') then
    raise exception 'invalid reveal_type: %', p_reveal_type;
  end if;

  select rollo_id into v_rollo_id
  from public.rollo_admins
  where token = p_token;

  if v_rollo_id is null then
    raise exception 'invalid admin token';
  end if;

  update public.rollos
  set reveal_type = p_reveal_type,
      reveals_at = case
        when p_reveal_type = 'delayed' then p_reveals_at
        else null
      end
  where id = v_rollo_id
  returning * into v_rollo;

  return v_rollo;
end;
$$;

grant execute on function public.update_reveal_settings(uuid, text, timestamptz) to anon, authenticated;
