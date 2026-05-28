'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Camera as CameraIcon, Download, Lock, QrCode } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { filterCss } from '@/lib/utils/filter-css';
import { diffParts, formatCountdown } from '@/lib/utils/countdown';
import { Grain } from '@/components/Grain';
import { DigitalStamp } from '@/components/DigitalStamp';
import { InviteSheet } from '@/components/InviteSheet';
import { MomentsSheet, type SheetPhoto } from '@/components/MomentsSheet';
import { es } from '@/lib/i18n/es';
import { bakeFilterToBlob } from '@/lib/utils/filter-css';
import type { FilterType } from '@/types';

interface Props {
  rolloId: string;
  code: string;
  name: string;
  coverImageUrl: string | null;
  closesAt: string;
  revealsAt: string | null;
  locked: boolean;
}

type PhotoRow = {
  id: string;
  storage_path: string;
  taken_at: string;
  guest_id: string;
  filter: FilterType | null;
  guests: { name: string } | { name: string }[] | null;
};

export function GalleryHub({
  rolloId,
  code,
  name,
  coverImageUrl,
  closesAt,
  revealsAt,
  locked,
}: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [photos, setPhotos] = useState<SheetPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [peopleCount, setPeopleCount] = useState(0);
  const [active, setActive] = useState<number | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [momentsOpen, setMomentsOpen] = useState(false);
  const [countdown, setCountdown] = useState('');
  const [view, setView] = useState<'all' | 'by-guest'>('all');
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  // Independent fetch of guests + their photo counts so the by-guest tab
  // shows everyone (even if photo URLs aren't loaded yet because the rollo
  // is locked, signed-URL creation failed, etc.).
  const [guestSummaries, setGuestSummaries] = useState<{ id: string; name: string; count: number }[]>([]);

  // Live countdown. When locked (delayed-reveal in the future), target the
  // reveal time so the stat matches the top banner; otherwise target the
  // rollo close time so users see how long they have left to shoot.
  useEffect(() => {
    const target = locked && revealsAt ? revealsAt : closesAt;
    function tick() {
      const parts = diffParts(target);
      if (parts.done) setCountdown(locked ? 'cualquier momento' : 'Cerrado');
      else setCountdown(formatCountdown(parts, es.countdown));
    }
    tick();
    // Use 1s while locked so it ticks visibly down with the banner; once
    // unlocked there's no rush, so back off to 30s.
    const id = setInterval(tick, locked ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [closesAt, revealsAt, locked]);

  // Sign each row's storage path so the <img> tags can load it.
  const hydrate = useCallback(
    async (row: PhotoRow): Promise<SheetPhoto | null> => {
      const { data: signed } = await supabase.storage
        .from('rollo-photos')
        .createSignedUrl(row.storage_path, 60 * 60);
      if (!signed?.signedUrl) return null;
      const guestName = Array.isArray(row.guests) ? row.guests[0]?.name : row.guests?.name;
      return {
        id: row.id,
        url: signed.signedUrl,
        by: guestName ?? null,
        guestId: row.guest_id,
        takenAt: row.taken_at,
        filter: (row.filter ?? 'original') as FilterType,
      };
    },
    [supabase],
  );

  // Initial fetch + realtime INSERT subscription.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('photos')
        .select('id, storage_path, taken_at, guest_id, filter, guests(name)')
        .eq('rollo_id', rolloId)
        .order('taken_at', { ascending: false });
      if (error) console.error('[GalleryHub] fetch error', error);
      if (cancelled || !data) {
        setLoading(false);
        return;
      }
      const rows = await Promise.all((data as PhotoRow[]).map(hydrate));
      const hydrated = rows.filter((p): p is SheetPhoto => !!p);
      if (!cancelled) {
        setPhotos(hydrated);
        setLoading(false);
      }
    })();

    const channel = supabase
      .channel(`hub-photos:${rolloId}`)
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

  // Fetch every guest + their real photo count from the DB (embedded
  // aggregate) so the by-guest tab is accurate even when individual photo
  // URLs failed to sign (locked rollo, storage RLS, etc.). Re-runs when
  // `photos` changes so realtime inserts bump the totals.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: guests, error } = await supabase
        .from('guests')
        .select('id, name, photos(count)')
        .eq('rollo_id', rolloId);
      if (error || !guests || cancelled) return;
      type GuestRow = {
        id: string;
        name: string;
        photos: { count: number }[] | { count: number } | null;
      };
      const summaries = (guests as GuestRow[]).map((g) => {
        const c = Array.isArray(g.photos) ? g.photos[0]?.count ?? 0 : g.photos?.count ?? 0;
        return { id: g.id, name: g.name, count: c };
      });
      const active = summaries.filter((s) => s.count > 0).length;
      setGuestSummaries(summaries);
      setPeopleCount(active > 0 ? active : guests.length);
    })();
    return () => {
      cancelled = true;
    };
  }, [photos, rolloId, supabase]);

  // Group by guest for the by-guest view.
  const guestGroups = useMemo(() => {
    const map = new Map<string, { name: string; photos: SheetPhoto[] }>();
    for (const p of photos) {
      const g = map.get(p.guestId);
      if (g) g.photos.push(p);
      else map.set(p.guestId, { name: p.by ?? 'Anónimo', photos: [p] });
    }
    return Array.from(map.entries())
      .map(([id, { name, photos: ps }]) => ({ id, name, count: ps.length, photos: ps }))
      .sort((a, b) => new Date(b.photos[0].takenAt).getTime() - new Date(a.photos[0].takenAt).getTime());
  }, [photos]);

  // Photos shown in the lightbox cycle through the currently-visible set.
  const visiblePhotos = useMemo(() => {
    if (view === 'by-guest' && selectedGuestId) {
      return guestGroups.find((g) => g.id === selectedGuestId)?.photos ?? [];
    }
    return photos;
  }, [view, selectedGuestId, photos, guestGroups]);

  const lightboxPhoto = active !== null ? visiblePhotos[active] ?? null : null;

  return (
    <>
      <Hero
        name={name}
        coverImageUrl={coverImageUrl}
        photosCount={photos.length}
        peopleCount={peopleCount}
        countdown={countdown}
        locked={locked}
        closesAt={closesAt}
        view={view}
        onSwitchView={(v) => {
          setView(v);
          setSelectedGuestId(null);
          setActive(null);
        }}
        // Per UX decision: the gallery's back arrow always lands you in the
        // camera so you can keep shooting. router.back() was unreliable
        // (no history on direct loads) and the alternative — going home —
        // forced the user to re-find the rollo.
        onBack={() => router.push(`/rollo/${code}/camara`)}
        onTakePhoto={() => router.push(`/rollo/${code}/camara`)}
        onShowInvite={() => setInviteOpen(true)}
        onShowMoments={() => setMomentsOpen(true)}
      />

      <main className="mx-auto max-w-2xl px-4 pb-16">
        {loading ? (
          <div className="mt-6 grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-rollo-surface" />
            ))}
          </div>
        ) : view === 'by-guest' && !selectedGuestId ? (
          // By-guest tab always shows everyone via guestSummaries (works
          // even when photo URLs aren't loaded). Falls back to placeholders
          // only if no guests exist at all.
          guestSummaries.length > 0 ? (
            <GuestSummaryCards
              summaries={guestSummaries}
              photoGroups={guestGroups}
              fallbackCover={coverImageUrl}
              locked={locked}
              onPick={(id) => setSelectedGuestId(id)}
            />
          ) : locked ? (
            <LockedPlaceholders coverImageUrl={coverImageUrl} />
          ) : (
            <p className="py-12 text-center text-rollo-muted">{es.gallery.empty}</p>
          )
        ) : photos.length === 0 ? (
          // Flat view, no photos. Locked → placeholders, unlocked → empty.
          locked ? (
            <LockedPlaceholders coverImageUrl={coverImageUrl} />
          ) : (
            <p className="py-12 text-center text-rollo-muted">{es.gallery.empty}</p>
          )
        ) : (
          <>
            {view === 'by-guest' && selectedGuestId && (
              <button
                onClick={() => setSelectedGuestId(null)}
                className="mt-4 text-sm text-rollo-muted hover:text-rollo-ink"
              >
                ← {es.gallery.back_to_list}
              </button>
            )}
            <PhotoGrid
              photos={visiblePhotos}
              locked={locked}
              onOpen={(i) => setActive(i)}
            />
          </>
        )}
      </main>

      {lightboxPhoto && (
        <Lightbox
          photos={visiblePhotos}
          activeIndex={active!}
          locked={locked}
          revealsAt={revealsAt}
          onClose={() => setActive(null)}
          onPrev={() => setActive((i) => (i === null ? null : (i - 1 + visiblePhotos.length) % visiblePhotos.length))}
          onNext={() => setActive((i) => (i === null ? null : (i + 1) % visiblePhotos.length))}
        />
      )}

      <InviteSheet open={inviteOpen} onClose={() => setInviteOpen(false)} code={code} name={name} />
      <MomentsSheet open={momentsOpen} onClose={() => setMomentsOpen(false)} photos={photos} />
    </>
  );
}

// -------------------- Hero (top section with cover + stats + actions) ------

function Hero({
  name,
  coverImageUrl,
  photosCount,
  peopleCount,
  countdown,
  locked,
  closesAt,
  view,
  onSwitchView,
  onBack,
  onTakePhoto,
  onShowInvite,
  onShowMoments,
}: {
  name: string;
  coverImageUrl: string | null;
  photosCount: number;
  peopleCount: number;
  countdown: string;
  locked: boolean;
  closesAt: string;
  view: 'all' | 'by-guest';
  onSwitchView: (v: 'all' | 'by-guest') => void;
  onBack: () => void;
  onTakePhoto: () => void;
  onShowInvite: () => void;
  onShowMoments: () => void;
}) {
  // The camera button is disabled only when the rollo is closed for
  // shooting (closes_at passed). Being "locked" just means the gallery
  // is waiting on reveal_at — users can still take photos during that
  // window if it overlaps the shooting period, or shoot whenever closes_at
  // is in the future.
  const closedForShooting = new Date(closesAt).getTime() <= Date.now();
  return (
    <header
      // `isolation: isolate` creates a new stacking context so the absolute-
      // positioned cover image inside doesn't escape behind the page body.
      className="relative w-full overflow-hidden"
      style={{ isolation: 'isolate' }}
    >
      {/* Cover image as backdrop. Falls back to brand gradient when missing. */}
      <div className="absolute inset-0 z-0">
        {coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverImageUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="noise-bg h-full w-full" />
        )}
        {/* Lighter top so the cover shows; ramps to opaque at the bottom so
            text and buttons are legible. */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/55 to-black" />
      </div>

      {/* Top-left back button. z-20 (above the z-10 content div) — the
          content div spans the full header even though it pads itself
          down, so without a higher z-index its transparent padding
          intercepts clicks on this absolutely-positioned button. */}
      <button
        onClick={onBack}
        aria-label="Atrás"
        className="absolute left-4 z-20 grid h-11 w-11 place-items-center rounded-2xl bg-black/30 text-white backdrop-blur transition active:scale-95"
        style={{ top: 'max(env(safe-area-inset-top, 0px) + 16px, 16px)' }}
      >
        <ArrowLeft size={20} />
      </button>

      {/* Title + stats + CTAs. Shorter top padding than before so the grid
          peeks above the fold; the cover is still visible (~38% of screen). */}
      <div className="relative z-10 px-5 pb-5 pt-[38vw] sm:pt-56">
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-white sm:text-5xl">
          {name}
        </h1>

        <div className="mt-5 flex items-end gap-6 text-white/85">
          <Stat label="Momentos" value={String(photosCount)} />
          <Stat label="Restantes" value={countdown || '…'} mono />
          <Stat label="Personas" value={String(peopleCount)} chevron />
        </div>

        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={onTakePhoto}
            disabled={closedForShooting}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-white py-4 text-base font-medium text-black shadow-lg shadow-black/20 transition active:scale-[0.99] disabled:opacity-50"
          >
            <CameraIcon size={20} />
          </button>
          <button
            onClick={onShowInvite}
            aria-label="Invitar invitados"
            className="grid h-[52px] w-[52px] place-items-center rounded-full bg-white/15 text-white backdrop-blur transition active:scale-95"
          >
            <QrCode size={20} />
          </button>
          <button
            onClick={onShowMoments}
            disabled={locked || photosCount === 0}
            aria-label="Guardar momentos"
            className="grid h-[52px] w-[52px] place-items-center rounded-full bg-white/15 text-white backdrop-blur transition active:scale-95 disabled:opacity-40"
          >
            {locked ? <Lock size={18} /> : <Download size={20} />}
          </button>
        </div>

        {/* View toggle: Todas / Por invitado — full width below the action row */}
        <div className="mt-4 flex w-full rounded-full bg-white/10 p-1 text-sm backdrop-blur">
          <ViewTab active={view === 'all'} onClick={() => onSwitchView('all')}>
            {es.gallery.view_all}
          </ViewTab>
          <ViewTab active={view === 'by-guest'} onClick={() => onSwitchView('by-guest')}>
            {es.gallery.view_by_guest}
          </ViewTab>
        </div>
      </div>
    </header>
  );
}

function ViewTab({
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
      className={`flex-1 rounded-full px-4 py-2 text-center transition ${
        active ? 'bg-white text-black' : 'text-white/80'
      }`}
    >
      {children}
    </button>
  );
}


/**
 * By-guest tab using guest summaries (id + name + count) regardless of
 * whether the photos themselves are visible. When we have hydrated photos
 * for a guest we use the first one as a cover (blurred when locked);
 * otherwise the card is a plain gradient. Cards are tappable only when
 * the rollo isn't locked.
 */
function GuestSummaryCards({
  summaries,
  photoGroups,
  fallbackCover,
  locked,
  onPick,
}: {
  summaries: { id: string; name: string; count: number }[];
  photoGroups: { id: string; name: string; count: number; photos: SheetPhoto[] }[];
  fallbackCover: string | null;
  locked: boolean;
  onPick: (id: string) => void;
}) {
  // Map guest id → cover photo (taken by that guest) for quick lookup.
  const covers = new Map<string, SheetPhoto>();
  for (const g of photoGroups) covers.set(g.id, g.photos[0]);

  return (
    <div className="mt-6 grid grid-cols-2 gap-3">
      {summaries.map((g) => {
        const cover = covers.get(g.id);
        // Locked-but-with-photos is still tappable now: it opens the
        // lightbox so the user can swipe through blurred previews and
        // see the reveal countdown.
        const canOpen = g.count > 0;
        // Pick what backs the card visually:
        //   1. A real photo by the guest (best — actually shows their POV)
        //   2. The rollo's cover image (so we still get a *real* image
        //      blurred instead of a synthetic gradient)
        //   3. Nothing — falls back to the surface color
        const bgUrl = cover?.url ?? fallbackCover ?? null;
        return (
          <button
            key={g.id}
            onClick={canOpen ? () => onPick(g.id) : undefined}
            disabled={!canOpen}
            className={`relative aspect-[3/4] overflow-hidden rounded-2xl bg-rollo-surface transition ${
              canOpen ? 'active:scale-[0.98]' : ''
            }`}
          >
            {bgUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={bgUrl}
                alt=""
                className={`h-full w-full object-cover ${
                  locked ? 'scale-105 opacity-100 blur-md saturate-125' : ''
                }`}
                style={
                  !locked && cover
                    ? { filter: filterCss(cover.filter, cover.id) }
                    : undefined
                }
              />
            )}
            {!locked && cover && <Grain filter={cover.filter} opacity={0.55} />}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/15" />

            {locked && (
              <span
                aria-hidden="true"
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/55 text-white/90 backdrop-blur"
              >
                <Lock size={14} />
              </span>
            )}

            {/* Centred count: big number on top, label below. */}
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <div className="font-display text-5xl leading-none text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]">
                  {g.count}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-white/80">
                  {g.count === 1 ? 'foto' : 'fotos'}
                </div>
              </div>
            </div>

            {/* Footer: guest name + locked subtext when applicable. */}
            <div className="absolute inset-x-0 bottom-0 p-3 text-left">
              <p className="font-display text-base leading-tight text-white">{g.name}</p>
              {locked && g.count > 0 && (
                <p className="text-[11px] text-white/55">aún sin revelar</p>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Blurred placeholder cards for the locked-empty state. Uses the rollo's
 * own cover image (heavily blurred) as the backdrop of every card, so the
 * gallery looks like "the photos exist, you just can't see them yet"
 * instead of a generic grid of color swatches. Each card slightly shifts
 * the cover's position to break the visual repetition.
 */
function LockedPlaceholders({ coverImageUrl }: { coverImageUrl: string | null }) {
  // 6 different background-position offsets so each card frames the same
  // cover image differently — looks less like a wallpaper, more like a
  // grid of distinct (blurred) shots.
  const positions = [
    '20% 30%', '70% 20%', '50% 60%',
    '30% 80%', '80% 70%', '10% 50%',
  ];
  return (
    <div className="mt-6 grid grid-cols-2 gap-3">
      {positions.map((pos, i) => (
        <div
          key={i}
          className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-rollo-surface"
        >
          {coverImageUrl ? (
            <div
              className="absolute inset-0 scale-105 opacity-100 blur-md saturate-125"
              style={{
                backgroundImage: `url(${coverImageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: pos,
              }}
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-rollo-accent/40 to-rollo-gold/30" />
          )}
          <div className="absolute inset-0 bg-black/35" />
          <div className="absolute inset-0 grid place-items-center">
            <Lock size={28} className="text-white/70" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Stat({
  label,
  value,
  mono,
  chevron,
}: {
  label: string;
  value: string;
  mono?: boolean;
  chevron?: boolean;
}) {
  return (
    <div className="flex flex-col items-start">
      <span
        className={
          mono
            ? 'font-display text-[22px] italic leading-none text-white'
            : 'font-display text-[28px] leading-none text-white'
        }
      >
        {value}
      </span>
      <span className="mt-1 flex items-center gap-1 text-[11px] uppercase tracking-wide text-white/70">
        {label}
        {chevron && <span className="text-white/40">›</span>}
      </span>
    </div>
  );
}

// -------------------- Photo grid (2-col with photographer name overlay) ----

function PhotoGrid({
  photos,
  locked,
  onOpen,
}: {
  photos: SheetPhoto[];
  locked: boolean;
  onOpen: (i: number) => void;
}) {
  return (
    <div className="mt-6 grid grid-cols-2 gap-3">
      {photos.map((p, i) => (
        <button
          key={p.id}
          onClick={() => onOpen(i)}
          className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-rollo-surface"
          aria-label={p.by ? `${es.gallery.by} ${p.by}` : 'foto'}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.url}
            alt=""
            className={`h-full w-full object-cover ${
              locked ? 'scale-105 opacity-100 blur-md saturate-125' : ''
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
          {!locked && p.by && (
            <span className="absolute left-3 top-3 max-w-[80%] truncate font-display text-sm italic text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.8)]">
              {p.by}
            </span>
          )}
          {!locked && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-end bg-gradient-to-t from-black/70 to-transparent px-3 pb-2 pt-6">
              <DigitalStamp takenAt={p.takenAt} size={10} />
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

// -------------------- Lightbox (single-photo view, with swipe + download) --

function Lightbox({
  photos,
  activeIndex,
  locked,
  revealsAt,
  onClose,
  onPrev,
  onNext,
}: {
  photos: SheetPhoto[];
  activeIndex: number;
  locked: boolean;
  revealsAt: string | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const current = photos[activeIndex];
  const [downloading, setDownloading] = useState(false);
  const [preparedBlob, setPreparedBlob] = useState<Blob | null>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'ArrowLeft') onPrev();
      else if (e.key === 'ArrowRight') onNext();
      else if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onPrev, onNext, onClose]);

  // Pre-bake so the share/download click is synchronous (iOS gesture).
  // Skip when locked — we don't allow downloads in that state and the bake
  // would just waste CPU on a hidden image.
  useEffect(() => {
    if (!current || locked) return;
    let cancelled = false;
    setPreparedBlob(null);
    bakeFilterToBlob(current.url, current.filter, current.id, current.takenAt)
      .then((blob) => {
        if (!cancelled) setPreparedBlob(blob);
      })
      .catch((err) => console.error('[Lightbox] pre-bake failed', err));
    return () => {
      cancelled = true;
    };
  }, [current, locked]);

  function handleTouchStart(e: React.TouchEvent) {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  function handleTouchEnd(e: React.TouchEvent) {
    if (!touchStart.current) return;
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    touchStart.current = null;
    if (Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      if (dx < 0) onNext();
      else onPrev();
    }
  }

  if (!current) return null;
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/95" onClick={onClose} role="dialog">
      <div
        className="flex items-center justify-between p-4 text-rollo-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="text-sm">
          {es.camera.close}
        </button>
        <span className="text-xs text-rollo-muted">
          {activeIndex + 1} / {photos.length}
        </span>
        {locked ? (
          <span className="flex items-center gap-1.5 text-xs text-white/70">
            <Lock size={12} /> Aún sin revelar
          </span>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (downloading) return;
              if (preparedBlob) {
                shareOrDownloadBlob(preparedBlob, current);
                return;
              }
              setDownloading(true);
              void downloadSingleWithFilter(current).finally(() => setDownloading(false));
            }}
            disabled={downloading}
            className="text-sm text-rollo-ink underline disabled:opacity-50"
          >
            {downloading ? 'Descargando…' : !preparedBlob ? 'Preparando…' : 'Descargar'}
          </button>
        )}
      </div>

      <div
        className="relative flex flex-1 items-center justify-center px-4 touch-pan-y select-none"
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
          className={`max-h-full max-w-full object-contain ${
            locked ? 'blur-xl scale-105 saturate-125' : ''
          }`}
          style={locked ? undefined : { filter: filterCss(current.filter, current.id) }}
        />
        <button onClick={onNext} className="px-3 text-rollo-ink/60 hover:text-rollo-ink" aria-label="siguiente">
          ›
        </button>

        {/* Locked overlay: centred countdown that ticks toward reveals_at */}
        {locked && revealsAt && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <RevealCountdown revealsAt={revealsAt} />
          </div>
        )}
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

function shareOrDownloadBlob(blob: Blob, p: SheetPhoto): void {
  const filename = `rollo-${p.id}.jpg`;
  const file = new File([blob], filename, { type: 'image/jpeg' });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
    share?: (data: ShareData) => Promise<void>;
  };
  if (nav.canShare && nav.share && nav.canShare({ files: [file] })) {
    nav.share({ files: [file] }).catch((err: Error) => {
      if (err.name !== 'AbortError') {
        triggerAnchorDownload(blob, filename);
      }
    });
    return;
  }
  triggerAnchorDownload(blob, filename);
}

function triggerAnchorDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function downloadSingleWithFilter(p: SheetPhoto): Promise<void> {
  try {
    const blob = await bakeFilterToBlob(p.url, p.filter, p.id, p.takenAt);
    triggerAnchorDownload(blob, `rollo-${p.id}.jpg`);
  } catch (err) {
    console.error('[GalleryHub] download failed', err);
  }
}

/**
 * Live countdown card shown over a blurred locked photo in the lightbox.
 * Ticks every second; switches to "Cualquier momento" once the target
 * passes (the page-level locked state should flip too on the next
 * router refresh / focus).
 */
function RevealCountdown({ revealsAt }: { revealsAt: string }) {
  const [text, setText] = useState('');
  useEffect(() => {
    function tick() {
      const parts = diffParts(revealsAt);
      if (parts.done) setText('cualquier momento');
      else setText(formatCountdown(parts, es.countdown));
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [revealsAt]);
  return (
    <div className="rounded-3xl bg-black/55 px-6 py-5 text-center text-white backdrop-blur-md">
      <Lock size={20} className="mx-auto opacity-80" />
      <p className="mt-2 text-xs uppercase tracking-[0.2em] text-white/70">
        Se revela en
      </p>
      <p className="mt-1 font-display text-3xl leading-none">{text || '…'}</p>
    </div>
  );
}
