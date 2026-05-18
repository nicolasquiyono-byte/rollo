'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { es } from '@/lib/i18n/es';
import { bakeFilterToBlob } from '@/lib/utils/filter-css';
import type { FilterType } from '@/types';

export function ShareActions({
  rolloId,
  code,
  name,
  locked = false,
}: {
  rolloId: string;
  code: string;
  name: string;
  locked?: boolean;
}) {
  const supabase = createClient();
  const [downloading, setDownloading] = useState(false);
  // Defer URL construction to the client so SSR and first hydration produce
  // the same empty href — eliminates the hydration mismatch from window.location.origin.
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => {
    setShareUrl(`${window.location.origin}/unirse?code=${code}`);
  }, [code]);

  const whatsappHref = shareUrl
    ? `https://wa.me/?text=${encodeURIComponent(`Mira las fotos del rollo "${name}": ${shareUrl}`)}`
    : '#';

  async function downloadAll() {
    setDownloading(true);
    try {
      const { data: rows } = await supabase
        .from('photos')
        .select('id, storage_path, filter, taken_at')
        .eq('rollo_id', rolloId)
        .order('taken_at', { ascending: true });
      if (!rows?.length) return;
      for (const row of rows as {
        id: string;
        storage_path: string;
        filter: FilterType | null;
        taken_at: string;
      }[]) {
        const { data: signed } = await supabase.storage
          .from('rollo-photos')
          .createSignedUrl(row.storage_path, 60 * 60);
        if (!signed?.signedUrl) continue;
        const filter = (row.filter ?? 'original') as FilterType;
        const filename = `${code}-${row.id}.jpg`;
        try {
          // Always bake via canvas so the digital timestamp watermark is
          // burned into the JPEG — even original-filter photos.
          const blob = await bakeFilterToBlob(signed.signedUrl, filter, row.id, row.taken_at);
          const objectUrl = URL.createObjectURL(blob);
          triggerDownload(objectUrl, filename);
          URL.revokeObjectURL(objectUrl);
        } catch (err) {
          console.warn('[ShareActions] bake failed, falling back to original (no watermark)', err);
          triggerDownload(signed.signedUrl, filename);
        }
        await new Promise((r) => setTimeout(r, 250));
      }
    } finally {
      setDownloading(false);
    }
  }

  function triggerDownload(href: string, filename: string) {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-2xl gap-3 border-t border-white/5 bg-rollo-bg/95 p-4 backdrop-blur">
      <button
        onClick={downloadAll}
        disabled={downloading || locked}
        className="flex-1 rounded-full border border-white/10 py-3 text-center text-sm disabled:opacity-40"
        title={locked ? 'Disponible cuando se revele el rollo' : undefined}
      >
        {locked ? 'Aún bloqueadas' : downloading ? 'Descargando…' : es.gallery.download_all}
      </button>
      <a
        href={whatsappHref}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          if (!shareUrl) e.preventDefault();
        }}
        aria-disabled={!shareUrl}
        className="flex-1 rounded-full bg-[#25D366] py-3 text-center text-sm font-semibold text-black"
      >
        {es.gallery.share_whatsapp}
      </a>
    </div>
  );
}
