'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Lock } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { bakeFilterToBlob, filterCss } from '@/lib/utils/filter-css';
import { formatStampDate, ghostifyStamp, splitStamp } from '@/lib/utils/format-stamp';
import { Grain } from '@/components/Grain';
import { es } from '@/lib/i18n/es';
import type { FilterType } from '@/types';

type View = 'all' | 'by-guest';
const VIEW_KEY = 'rollo:gallery-view';

interface GalleryPhoto {
  id: string;
  url: string;
  by: string | null;
  guestId: string;
  takenAt: string;
  path: string;
  filter: FilterType;
}

interface GuestGroup {
  id: string;
  name: string;
  count: number;
  cover: GalleryPhoto;
}

interface Props {
  rolloId: string;
  bucket?: string;
  locked?: boolean;
}

type PhotoRow = {
  id: string;
  storage_path: string;
  taken_at: string;
  guest_id: string;
  filter: FilterType | null;
  guests: { name: string } | { name: string }[] | null;
};

export function Gallery({ rolloId, bucket = 'rollo-photos', locked = false }: Props) {
  const supabase = createClient();
  const [photos, setPhotos] = useState<GalleryPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('all');
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [active, setActive] = useState<number | null>(null);

  // Hydrate view preference from localStorage on mount (avoids SSR mismatch).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const stored = window.localStorage.getItem(VIEW_KEY);
    if (stored === 'all' || stored === 'by-guest') setView(stored);
  }, []);

  const switchView = useCallback((next: View) => {
    setView(next);
    setSelectedGuestId(null);
    setActive(null);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(VIEW_KEY, next);
    }
  }, []);

  const hydrate = useCallback(
    async (row: PhotoRow): Promise<GalleryPhoto | null> => {
      const { data: signed } = await supabase.storage
        .from(bucket)
        .createSignedUrl(row.storage_path, 60 * 60);
      if (!signed?.signedUrl) return null;
      const guestName = Array.isArray(row.guests) ? row.guests[0]?.name : row.guests?.name;
      return {
        id: row.id,
        url: signed.signedUrl,
        by: guestName ?? null,
        guestId: row.guest_id,
        takenAt: row.taken_at,
        path: row.storage_path,
        filter: (row.filter ?? 'original') as FilterType,
      };
    },
    [bucket, supabase],
  );

  // Initial fetch + realtime subscription.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('photos')
        .select('id, storage_path, taken_at, guest_id, filter, guests(name)')
        .eq('rollo_id', rolloId)
        .order('taken_at', { ascending: false });
      if (error) console.error('[Gallery] fetch error', error);
      if (cancelled || !data) {
        setLoading(false);
        return;
      }
      const rows = await Promise.all((data as PhotoRow[]).map(hydrate));
      const hydrated = rows.filter((p): p is GalleryPhoto => !!p);
      if (!cancelled) {
        setPhotos(hydrated);
        setLoading(false);
      }
    })();

    const channel = supabase
      .channel(`photos:${rolloId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photos', filter: `rollo_id=eq.${rolloId}` },
        async (payload) => {
          const row = payload.new as {
            id: string;
            storage_path: string;
            taken_at: string;
            guest_id: string;
            filter: FilterType | null;
          };
          const { data: guestRow } = await supabase
            .from('guests')
            .select('name')
            .eq('id', row.guest_id)
            .maybeSingle();
          const hydrated = await hydrate({
            id: row.id,
            storage_path: row.storage_path,
            taken_at: row.taken_at,
            guest_id: row.guest_id,
            filter: row.filter,
            guests: guestRow ? { name: guestRow.name } : null,
          });
          if (hydrated && !cancelled) {
            setPhotos((prev) => (prev.some((p) => p.id === hydrated.id) ? prev : [hydrated, ...prev]));
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [rolloId, hydrate, supabase]);

  // Photos currently in the lightbox cycle (all photos vs. just one guest's).
  const visiblePhotos = useMemo(() => {
    if (view === 'by-guest' && selectedGuestId) {
      return photos.filter((p) => p.guestId === selectedGuestId);
    }
    return photos;
  }, [view, selectedGuestId, photos]);

  // Group photos by guest for the cards view. Sorted by count desc.
  const guestGroups = useMemo<GuestGroup[]>(() => {
    if (view !== 'by-guest') return [];
    const map = new Map<string, { name: string; photos: GalleryPhoto[] }>();
    for (const p of photos) {
      const g = map.get(p.guestId);
      if (g) g.photos.push(p);
      else map.set(p.guestId, { name: p.by ?? 'Anónimo', photos: [p] });
    }
    return Array.from(map.entries())
      .map(([id, { name, photos: ps }]) => ({ id, name, count: ps.length, cover: ps[0] }))
      .sort((a, b) => new Date(b.cover.takenAt).getTime() - new Date(a.cover.takenAt).getTime());
  }, [view, photos]);

  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse bg-rollo-surface" />
        ))}
      </div>
    );
  }

  if (!photos.length) {
    return <p className="py-12 text-center text-rollo-muted">{es.gallery.empty}</p>;
  }

  const selectedGuest = selectedGuestId
    ? guestGroups.find((g) => g.id === selectedGuestId) ?? null
    : null;
  const showToggle = selectedGuestId === null;
  const lightboxPhoto = active !== null ? visiblePhotos[active] ?? null : null;

  return (
    <>
      {showToggle && (
        <div className="mb-4 inline-flex rounded-full bg-rollo-surface p-1 text-sm">
          <ToggleButton active={view === 'all'} onClick={() => switchView('all')}>
            {es.gallery.view_all}
          </ToggleButton>
          <ToggleButton active={view === 'by-guest'} onClick={() => switchView('by-guest')}>
            {es.gallery.view_by_guest}
          </ToggleButton>
        </div>
      )}

      {selectedGuest && (
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => setSelectedGuestId(null)}
            className="text-sm text-rollo-muted hover:text-rollo-ink"
          >
            ← {es.gallery.back_to_list}
          </button>
          <p className="font-display text-lg">{selectedGuest.name}</p>
          <span className="text-xs text-rollo-muted">
            {es.gallery.photos_count(selectedGuest.count)}
          </span>
        </div>
      )}

      {/* All-photos grid (default or via toggle) */}
      {view === 'all' && (
        <PhotoGrid photos={photos} locked={locked} onOpen={(i) => setActive(i)} />
      )}

      {/* By-guest cards */}
      {view === 'by-guest' && selectedGuestId === null && (
        <GuestCards groups={guestGroups} locked={locked} onSelect={(id) => setSelectedGuestId(id)} />
      )}

      {/* Single guest's photos */}
      {view === 'by-guest' && selectedGuestId !== null && (
        <PhotoGrid photos={visiblePhotos} locked={locked} onOpen={(i) => setActive(i)} />
      )}

      {lightboxPhoto && !locked && (
        <Lightbox
          photos={visiblePhotos}
          activeIndex={active!}
          onClose={() => setActive(null)}
          onPrev={() => setActive((i) => (i === null ? null : (i - 1 + visiblePhotos.length) % visiblePhotos.length))}
          onNext={() => setActive((i) => (i === null ? null : (i + 1) % visiblePhotos.length))}
        />
      )}
    </>
  );
}

function ToggleButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-4 py-2 transition ${
        active ? 'bg-rollo-ink text-rollo-bg' : 'text-rollo-muted hover:text-rollo-ink'
      }`}
    >
      {children}
    </button>
  );
}

// Two-font digital timestamp: month name in VT323 (pixel/terminal) +
// numbers/colons/AM-PM in DSEG14 (with the unlit-segment ghost layer).
// `size` is the pixel font-size for the DSEG14 part; the pixel month is
// rendered slightly larger so its lowercase x-height matches the LCD chars.
function DigitalStamp({ takenAt, size }: { takenAt: string; size: number }) {
  const { month, rest } = splitStamp(formatStampDate(takenAt));
  const litShadow = [
    '0 0 1px rgba(0,0,0,0.9)',
    '0 0 4px rgba(255,107,53,0.9)',
    '0 0 10px rgba(255,107,53,0.6)',
    '0 0 18px rgba(255,107,53,0.35)',
  ].join(', ');
  return (
    <span
      className="inline-flex shrink-0 items-baseline gap-[0.35em] leading-none"
      style={{ color: '#FF6B35', fontSize: `${size}px` }}
    >
      <span
        style={{
          fontFamily: 'var(--font-pixel), ui-monospace, monospace',
          fontSize: `${size * 1.5}px`,
          textShadow: litShadow,
        }}
      >
        {month}
      </span>
      <span
        className="relative tracking-tight"
        style={{ fontFamily: '"DSEG14Classic", ui-monospace, monospace' }}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{ opacity: 0.32, textShadow: '0 0 2px rgba(255,107,53,0.5)' }}
        >
          {ghostifyStamp(rest)}
        </span>
        <span style={{ textShadow: litShadow }}>{rest}</span>
      </span>
    </span>
  );
}

function PhotoGrid({
  photos,
  locked,
  onOpen,
}: {
  photos: GalleryPhoto[];
  locked: boolean;
  onOpen: (i: number) => void;
}) {
  if (!photos.length) {
    return <p className="py-12 text-center text-rollo-muted">{es.gallery.empty}</p>;
  }
  return (
    <div className="grid grid-cols-3 gap-1">
      {photos.map((p, i) => (
        <button
          key={p.id}
          onClick={locked ? undefined : () => onOpen(i)}
          disabled={locked}
          className="relative aspect-square overflow-hidden bg-rollo-surface"
          aria-label={p.by ? `${es.gallery.by} ${p.by}` : 'foto'}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.url}
            alt=""
            className={`h-full w-full object-cover ${
              locked ? 'scale-110 opacity-30 blur-2xl' : ''
            }`}
            style={locked ? undefined : { filter: filterCss(p.filter, p.id) }}
            loading="lazy"
          />
          {!locked && <Grain filter={p.filter} opacity={0.55} />}
          {locked && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Lock size={28} className="text-white/90" />
            </div>
          )}
          {!locked && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-2 pb-1.5 pt-6 leading-tight">
              {p.by ? (
                <span className="truncate text-[10px] font-medium text-white">{p.by}</span>
              ) : (
                <span />
              )}
              <DigitalStamp takenAt={p.takenAt} size={10} />
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

function GuestCards({
  groups,
  locked,
  onSelect,
}: {
  groups: GuestGroup[];
  locked: boolean;
  onSelect: (id: string) => void;
}) {
  if (!groups.length) {
    return <p className="py-12 text-center text-rollo-muted">{es.gallery.empty}</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {groups.map((g) => (
        <button
          key={g.id}
          onClick={() => onSelect(g.id)}
          className="overflow-hidden rounded-2xl bg-rollo-surface text-left transition hover:ring-2 hover:ring-white/10"
        >
          <div className="relative aspect-square">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={g.cover.url}
              alt=""
              className={`h-full w-full object-cover ${
                locked ? 'scale-110 opacity-30 blur-2xl' : ''
              }`}
              style={locked ? undefined : { filter: filterCss(g.cover.filter, g.cover.id) }}
              loading="lazy"
            />
            {!locked && <Grain filter={g.cover.filter} opacity={0.55} />}
            {locked && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                <Lock size={32} className="text-white/90" />
              </div>
            )}
          </div>
          <div className="p-3">
            <p className="truncate font-medium">{g.name}</p>
            <p className="text-xs text-rollo-muted">{es.gallery.photos_count(g.count)}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function Lightbox({
  photos,
  activeIndex,
  onClose,
  onPrev,
  onNext,
}: {
  photos: GalleryPhoto[];
  activeIndex: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const current = photos[activeIndex];
  // Track the touch starting point so the touchend handler can decide whether
  // the gesture was a real horizontal swipe (vs. a tap or vertical scroll).
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  // Keyboard navigation: left/right arrows + Escape (desktop niceness).
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onPrev, onNext, onClose]);

  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStart.current) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    touchStart.current = null;
    // Require ≥50px of horizontal travel AND that horizontal dominates vertical
    // by 1.5×, so a vertical scroll/pull-to-close doesn't trigger a swipe.
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) onNext();
      else onPrev();
    }
  }

  if (!current) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={onClose} role="dialog">
      <div className="flex items-center justify-between p-4 text-rollo-ink" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="text-sm">
          {es.camera.close}
        </button>
        <span className="text-xs text-rollo-muted">
          {activeIndex + 1} / {photos.length}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            void downloadSingleWithFilter(current);
          }}
          className="text-sm text-rollo-ink underline"
        >
          Descargar
        </button>
      </div>

      <div
        className="flex flex-1 items-center justify-center px-4 touch-pan-y select-none"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <button onClick={onPrev} className="px-3 text-rollo-ink/60 hover:text-rollo-ink" aria-label="anterior">
          ‹
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt=""
          draggable={false}
          className="max-h-full max-w-full object-contain"
          style={{ filter: filterCss(current.filter, current.id) }}
        />
        <button onClick={onNext} className="px-3 text-rollo-ink/60 hover:text-rollo-ink" aria-label="siguiente">
          ›
        </button>
      </div>

      <div
        className="flex items-center justify-between gap-3 p-4 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="truncate text-rollo-muted">
          {current.by ? `${es.gallery.by} ${current.by}` : ''}
        </span>
        <DigitalStamp takenAt={current.takenAt} size={12} />
      </div>
    </div>
  );
}

async function downloadSingleWithFilter(p: GalleryPhoto): Promise<void> {
  try {
    console.log('[Download] Starting download with filter:', p.filter);
    const blob = await bakeFilterToBlob(p.url, p.filter, p.id, p.takenAt);
    console.log('[Download] Blob created, size:', blob.size);
    
    // En móvil, usa Web Share API para guardar directo a Fotos
    if (navigator.share && navigator.canShare) {
      const file = new File([blob], `rollo-${p.id}.jpg`, { type: 'image/jpeg' });
      
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: 'Rollo Photo',
          });
          console.log('[Download] Shared successfully via Web Share API');
          return;
        } catch (shareErr) {
          // Si el usuario cancela el share, continuar con download normal
          if ((shareErr as Error).name !== 'AbortError') {
            console.warn('[Download] Web Share failed, falling back to download', shareErr);
          } else {
            return; // Usuario canceló, no hacer nada más
          }
        }
      }
    }
    
    // Fallback: download tradicional para desktop
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = `rollo-${p.id}.jpg`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    console.error('[Gallery] download with filter failed', err);
  }
}

