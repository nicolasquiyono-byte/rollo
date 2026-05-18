-- ============================================================
-- Unlock photos SELECT policy
-- ============================================================
-- Trade-off: the locked gallery view now shows real photos blurred via CSS,
-- which requires the client to read the rows even before reveal_at. The
-- "delayed reveal" becomes a UX convention (visual blur, lock icon, sticky
-- banner) rather than a hard SQL gate.
--
-- Implications:
--   * Admin and camera-thumbnails can read photos in delayed rollos (good).
--   * A determined guest can open devtools, find the signed URL, and view
--     the original before reveal time.
--
-- If you later need a real gate, generate tiny public preview thumbnails
-- at upload time and keep the originals locked.

drop policy if exists "photos visible after reveal" on public.photos;
drop policy if exists "photos visible to anyone"   on public.photos;

create policy "photos visible to anyone"
  on public.photos for select
  to public
  using (true);

-- Verification: should list one SELECT policy with qual = true
select policyname, cmd, qual
from pg_policies
where schemaname = 'public' and tablename = 'photos'
order by policyname;
