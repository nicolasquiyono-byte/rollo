import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { GalleryHub } from '@/components/GalleryHub';
import { LockedBanner } from './LockedBanner';

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
      <GalleryHub
        rolloId={rollo.id}
        code={rollo.code}
        name={rollo.name}
        coverImageUrl={rollo.cover_image_url}
        closesAt={rollo.closes_at}
        locked={locked}
      />
    </>
  );
}
