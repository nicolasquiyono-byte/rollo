'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { filterCss } from '@/lib/utils/filter-css';
import { Grain } from '@/components/Grain';
import type { FilterType, Guest } from '@/types';

interface Photo {
  id: string;
  url: string;
  takenAt: string;
  filter: FilterType;
}

interface Props {
  guest: Guest;
  shotLimit: number;
  rolloId: string;
  onClose: () => void;
}

export function GuestPhotosModal({ guest, shotLimit, rolloId, onClose }: Props) {
  const supabase = createClient();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('photos')
        .select('id, storage_path, taken_at, filter')
        .eq('rollo_id', rolloId)
        .eq('guest_id', guest.id)
        .order('taken_at', { ascending: true });
      if (error) console.error('[Admin] guest photos fetch', error);
      if (cancelled) return;
      if (!data) {
        setPhotos([]);
        return;
      }
      const hydrated = await Promise.all(
        data.map(async (p) => {
          const { data: signed } = await supabase.storage
            .from('rollo-photos')
            .createSignedUrl(p.storage_path, 60 * 60);
          return {
            id: p.id,
            url: signed?.signedUrl ?? '',
            takenAt: p.taken_at,
            filter: (p.filter ?? 'original') as FilterType,
          };
        }),
      );
      if (!cancelled) setPhotos(hydrated.filter((p) => p.url));
    })();

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      document.removeEventListener('keydown', onKey);
    };
  }, [guest.id, rolloId, supabase, onClose]);

  const lightboxPhoto = active !== null && photos ? photos[active] : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-rollo-bg">
      <header className="flex items-center justify-between border-b border-white/5 p-4">
        <button onClick={onClose} className="text-sm text-rollo-muted" aria-label="Volver">
          ← Atrás
        </button>
        <div className="text-center">
          <p className="font-display text-lg">{guest.name}</p>
          <p className="text-xs text-rollo-muted">
            {photos?.length ?? 0} fotos · {guest.shots_used}/{shotLimit} disparos
          </p>
        </div>
        <button onClick={onClose} className="px-2 text-2xl leading-none text-rollo-muted" aria-label="Cerrar">
          ×
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        {photos === null ? (
          <div className="grid grid-cols-3 gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse bg-rollo-surface" />
            ))}
          </div>
        ) : photos.length === 0 ? (
          <p className="py-16 text-center text-rollo-muted">
            {guest.name} aún no ha tomado fotos.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {photos.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setActive(i)}
                className="relative aspect-square overflow-hidden bg-rollo-surface"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt=""
                  className="h-full w-full object-cover"
                  style={{ filter: filterCss(p.filter, p.id) }}
                  loading="lazy"
                />
                <Grain filter={p.filter} opacity={0.55} />
              </button>
            ))}
          </div>
        )}
      </div>

      {lightboxPhoto && photos && (
        <div
          className="absolute inset-0 z-10 flex flex-col bg-black/95"
          onClick={() => setActive(null)}
          role="dialog"
        >
          <div className="flex items-center justify-between p-4 text-rollo-ink" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setActive(null)} className="text-sm">Cerrar</button>
            <span className="text-xs text-rollo-muted">{(active ?? 0) + 1} / {photos.length}</span>
            <a
              href={lightboxPhoto.url}
              download={`rollo-${lightboxPhoto.id}.jpg`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm underline"
            >
              Descargar
            </a>
          </div>
          <div className="flex flex-1 items-center justify-center px-4">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActive((i) => (i === null ? null : (i - 1 + photos.length) % photos.length));
              }}
              className="px-3 text-rollo-ink/60"
              aria-label="anterior"
            >
              ‹
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxPhoto.url}
              alt=""
              className="max-h-full max-w-full object-contain"
              style={{ filter: filterCss(lightboxPhoto.filter, lightboxPhoto.id) }}
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                setActive((i) => (i === null ? null : (i + 1) % photos.length));
              }}
              className="px-3 text-rollo-ink/60"
              aria-label="siguiente"
            >
              ›
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
