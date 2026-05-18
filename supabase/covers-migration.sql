-- ============================================================
-- Cover images migration: dedicated public bucket
-- ============================================================
-- Why: covers are hero images, semantically public. Photos stay in
-- the private 'rollo-photos' bucket so reveal_type/reveals_at logic
-- continues to gate access. getPublicUrl() returns a path that only
-- works against buckets marked public:true.

-- 1. Bucket público para covers
insert into storage.buckets (id, name, public)
values ('rollo-covers', 'rollo-covers', true)
on conflict (id) do update set public = true;

-- 2. Policies (idempotentes)
drop policy if exists "anyone can upload to rollo-covers" on storage.objects;
drop policy if exists "anyone can read rollo-covers"      on storage.objects;
drop policy if exists "anyone can update rollo-covers"    on storage.objects;

create policy "anyone can upload to rollo-covers"
  on storage.objects for insert
  to public
  with check (bucket_id = 'rollo-covers');

create policy "anyone can read rollo-covers"
  on storage.objects for select
  to public
  using (bucket_id = 'rollo-covers');

create policy "anyone can update rollo-covers"
  on storage.objects for update
  to public
  using (bucket_id = 'rollo-covers')
  with check (bucket_id = 'rollo-covers');

-- 3. Backfill: las URLs de covers viejos apuntan al bucket privado y nunca
--    cargarán. Las nullificamos para que el JoinHero caiga al gradient
--    de fallback en lugar de mostrar imagen rota. Si quieres conservar
--    los archivos físicos, primero descárgalos manualmente del dashboard.
update public.rollos
set cover_image_url = null
where cover_image_url like '%/object/public/rollo-photos/covers/%';

-- 4. Verificación
select 'covers bucket exists & public' as label,
       coalesce((select public::text from storage.buckets where id = 'rollo-covers'), 'MISSING') as value
union all
select 'storage policies for rollo-covers', count(*)::text
  from pg_policies
  where schemaname = 'storage' and tablename = 'objects' and policyname like '%rollo-covers%'
union all
select 'rollos with broken cover urls (should be 0 after backfill)', count(*)::text
  from public.rollos
  where cover_image_url like '%/object/public/rollo-photos/covers/%';
