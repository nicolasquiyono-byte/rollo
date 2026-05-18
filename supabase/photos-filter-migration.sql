-- ============================================================
-- Per-photo filter snapshot
-- ============================================================
-- The rollo carries a filter setting (vintage/bw/original) chosen in the
-- wizard. Now each photo also stores the filter that was active when it
-- was captured, so changing rollo.filter later doesn't retroactively
-- transform old photos. Photos are saved ORIGINAL in storage; the filter
-- is applied at render time (gallery, downloads, etc.) via CSS / canvas.

alter table public.photos
  add column if not exists filter text not null default 'original';

alter table public.photos drop constraint if exists photos_filter_check;
alter table public.photos add constraint photos_filter_check
  check (filter in ('original', 'vintage', 'bw'));

-- Backfill: existing photos inherit the filter of their parent rollo,
-- so rollos created before this migration keep a consistent look.
update public.photos p
set filter = r.filter
from public.rollos r
where r.id = p.rollo_id
  and p.filter = 'original'
  and r.filter <> 'original';

-- Verification
select 'photos.filter column' as label, data_type as value
  from information_schema.columns
  where table_schema='public' and table_name='photos' and column_name='filter'
union all
select 'photos by filter', filter || ': ' || count(*)::text
  from public.photos group by filter order by filter;
