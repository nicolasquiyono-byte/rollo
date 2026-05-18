import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Gallery } from '@/components/Gallery';
import { ShareActions } from './ShareActions';
import { BackLink } from './BackLink';
import { LockedBanner } from './LockedBanner';
import { es } from '@/lib/i18n/es';

interface Props {
  params: { code: string };
}

export default async function GaleriaPage({ params }: Props) {
  const supabase = createClient();
  const code = params.code.toUpperCase();
  const { data: rollo } = await supabase
    .from('rollos')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (!rollo) notFound();

  const locked =
    rollo.reveal_type === 'delayed' &&
    (!rollo.reveals_at || new Date(rollo.reveals_at) > new Date());

  return (
    <>
      {locked && rollo.reveals_at && <LockedBanner revealsAt={rollo.reveals_at} />}

      <main className="mx-auto max-w-2xl px-4 pb-24 pt-6">
        <div className="flex items-center justify-between px-2">
          <BackLink fallback={`/rollo/${rollo.code}`} label={rollo.name} />
          <span className="font-display tracking-widest">{rollo.code}</span>
        </div>

        <h1 className="mt-4 px-2 font-display text-2xl">{es.gallery.title}</h1>

        <div className="mt-6">
          <Gallery rolloId={rollo.id} locked={locked} />
        </div>
      </main>

      <ShareActions rolloId={rollo.id} code={rollo.code} name={rollo.name} locked={locked} />
    </>
  );
}
