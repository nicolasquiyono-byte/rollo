import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { AdminDashboard } from './AdminDashboard';
import type { Rollo } from '@/types';

interface Props {
  params: { code: string };
  searchParams: { key?: string };
}

export default async function AdminPage({ params, searchParams }: Props) {
  const code = params.code.toUpperCase();
  const token = searchParams.key;
  if (!token) notFound();

  const supabase = createClient();
  const { data: rolloRow, error } = await supabase
    .rpc('get_rollo_by_admin_token', { p_token: token })
    .single();
  if (error || !rolloRow) notFound();

  const rollo = rolloRow as Rollo;
  if (rollo.code !== code) notFound();

  const [{ count: guestsCount }, { count: photosCount }] = await Promise.all([
    supabase.from('guests').select('*', { count: 'exact', head: true }).eq('rollo_id', rollo.id),
    supabase.from('photos').select('*', { count: 'exact', head: true }).eq('rollo_id', rollo.id),
  ]);

  return (
    <AdminDashboard
      rollo={rollo}
      token={token}
      initial={{ guestsCount: guestsCount ?? 0, photosCount: photosCount ?? 0 }}
    />
  );
}
