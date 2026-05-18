import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Countdown } from '@/components/Countdown';
import { QRCodeView } from '@/components/QRCode';
import { es } from '@/lib/i18n/es';

interface Props {
  params: { code: string };
}

export default async function RolloPage({ params }: Props) {
  const supabase = createClient();
  const code = params.code.toUpperCase();

  const { data: rollo } = await supabase
    .from('rollos')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (!rollo) notFound();

  const [{ count: guestsCount }, { count: photosCount }] = await Promise.all([
    supabase.from('guests').select('*', { count: 'exact', head: true }).eq('rollo_id', rollo.id),
    supabase.from('photos').select('*', { count: 'exact', head: true }).eq('rollo_id', rollo.id),
  ]);

  const closes = rollo.closes_at;
  const reveals = rollo.reveals_at;

  return (
    <main className="mx-auto max-w-md px-6 py-10">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-xs uppercase tracking-widest text-rollo-muted">
          ← {es.brand}
        </Link>
        <span className="font-display tracking-widest">{rollo.code}</span>
      </div>

      <h1 className="mt-6 font-display text-3xl">{rollo.name}</h1>
      {rollo.host_name && (
        <p className="text-rollo-muted">
          {es.gallery.by} {rollo.host_name}
        </p>
      )}

      <div className="mt-6 flex gap-6">
        <Stat label={es.event.guests_count(guestsCount ?? 0)} />
        <Stat label={es.event.photos_count(photosCount ?? 0)} />
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4">
        <div className="rounded-2xl bg-rollo-surface p-4">
          <Countdown
            target={closes}
            label={rollo.reveal_type === 'delayed' && reveals ? es.event.reveals_in : es.event.closes_in}
          />
        </div>

        <div className="flex flex-col items-center rounded-2xl bg-rollo-surface p-6">
          <QRCodeView code={rollo.code} />
          <p className="mt-3 font-display text-xl tracking-widest">{rollo.code}</p>
          <p className="text-xs text-rollo-muted">{es.event.share_event}</p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <Link
          href={`/rollo/${rollo.code}/camara`}
          className="rounded-full bg-rollo-accent px-6 py-4 text-center font-semibold text-white"
        >
          {es.event.open_camera}
        </Link>
        <Link
          href={`/rollo/${rollo.code}/galeria`}
          className="rounded-full border border-white/10 px-6 py-4 text-center font-semibold"
        >
          {es.event.open_gallery}
        </Link>
      </div>
    </main>
  );
}

function Stat({ label }: { label: string }) {
  return <p className="text-sm text-rollo-muted">{label}</p>;
}
