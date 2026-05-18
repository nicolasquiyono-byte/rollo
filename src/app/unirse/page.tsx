import { createClient } from '@/lib/supabase/server';
import { JoinHero } from './JoinHero';
import { JoinByCode } from './JoinByCode';
import type { Rollo } from '@/types';

interface Props {
  searchParams: { code?: string };
}

export default async function JoinPage({ searchParams }: Props) {
  const code = searchParams.code?.toUpperCase();

  if (!code) {
    return <JoinByCode />;
  }

  const supabase = createClient();
  const { data: rolloRow } = await supabase
    .from('rollos')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (!rolloRow) {
    return <JoinByCode initialCode={code} initialError="No encontramos ese rollo. Verifica el código." />;
  }

  return <JoinHero rollo={rolloRow as Rollo} />;
}
