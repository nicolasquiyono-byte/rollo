'use client';

import { useEffect, useMemo, useState } from 'react';
import JSZip from 'jszip';
import { Check, Download, Share2 } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { bakeFilterToBlob, filterCss } from '@/lib/utils/filter-css';
import { Grain } from '@/components/Grain';
import type { FilterType } from '@/types';

export interface SheetPhoto {
  id: string;
  url: string;
  by: string | null;
  guestId: string;
  takenAt: string;
  filter: FilterType;
}

interface Props {
  open: boolean;
  onClose: () => void;
  photos: SheetPhoto[];
}

// Hard safety cap to avoid OOM on huge rollos. The "soft" UX cap is 10
// (below SHARE_THRESHOLD the user gets Photos via the share sheet;
// above it the bundle is delivered as a ZIP to Files).
const MAX_SELECT = 50;
const SHARE_THRESHOLD = 10;
type Tab = 'all' | 'by-guest';

export function MomentsSheet({ open, onClose, photos }: Props) {
  const [tab, setTab] = useState<Tab>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [openGuestId, setOpenGuestId] = useState<string | null>(null);
  // Cache of baked blobs keyed by photo id. We start the bake the moment
  // the user selects a photo so that by the time they tap Save/Share, the
  // share API can be called synchronously inside the user gesture — iOS
  // Safari requires that to route the files to Photos via the share sheet
  // (otherwise the gesture is lost and the share silently fails).
  const [bakedCache, setBakedCache] = useState<Map<string, Blob>>(new Map());
  // Toggled on the moment the user crosses SHARE_THRESHOLD so we can show
  // a one-shot popup explaining the ZIP fallback. Resets when the sheet
  // is closed so it can appear again on the next visit.
  const [zipNoticeOpen, setZipNoticeOpen] = useState(false);
  const [zipNoticeShown, setZipNoticeShown] = useState(false);

  // Clear selection + cache whenever the sheet opens or closes.
  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setTab('all');
      setOpenGuestId(null);
      setBakedCache(new Map());
      setZipNoticeOpen(false);
      setZipNoticeShown(false);
    }
  }, [open]);

  // Group by guest for the by-guest tab.
  const guestGroups = useMemo(() => {
    const map = new Map<string, { name: string; photos: SheetPhoto[] }>();
    for (const p of photos) {
      const g = map.get(p.guestId);
      if (g) g.photos.push(p);
      else map.set(p.guestId, { name: p.by ?? 'Anónimo', photos: [p] });
    }
    return Array.from(map.entries()).map(([id, { name, photos: ps }]) => ({
      id,
      name,
      photos: ps,
    }));
  }, [photos]);

  // Photos visible in the current tab/guest view (drives "select all" too).
  const visiblePhotos = useMemo(() => {
    if (tab === 'all') return photos;
    if (openGuestId) {
      return guestGroups.find((g) => g.id === openGuestId)?.photos ?? [];
    }
    return [];
  }, [tab, openGuestId, photos, guestGroups]);

  const allSelected =
    visiblePhotos.length > 0 && visiblePhotos.every((p) => selected.has(p.id));

  // Kick off a background bake for a photo if we don't already have it
  // cached. The Save/Share path will pick up the cached blob and call
  // navigator.share inside the user's gesture (no awaits in between).
  function ensureBaked(photoId: string) {
    if (bakedCache.has(photoId)) return;
    const p = photos.find((x) => x.id === photoId);
    if (!p) return;
    bakeFilterToBlob(p.url, p.filter, p.id, p.takenAt)
      .then((blob) => {
        setBakedCache((prev) => {
          if (prev.has(photoId)) return prev;
          const next = new Map(prev);
          next.set(photoId, blob);
          return next;
        });
      })
      .catch((e) => console.warn('[MomentsSheet] bake failed', photoId, e));
  }

  function toggle(photoId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else if (next.size < MAX_SELECT) {
        next.add(photoId);
        ensureBaked(photoId);
        // First time we cross into ZIP territory in this sheet session,
        // pop up the one-shot notice.
        if (next.size === SHARE_THRESHOLD + 1 && !zipNoticeShown) {
          setZipNoticeOpen(true);
          setZipNoticeShown(true);
        }
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      // Respect the MAX_SELECT cap when bulk-selecting.
      const next = new Set<string>();
      for (const p of visiblePhotos) {
        if (next.size >= MAX_SELECT) break;
        next.add(p.id);
        ensureBaked(p.id);
      }
      setSelected(next);
    }
  }

  const selectedPhotos = useMemo(
    () => photos.filter((p) => selected.has(p.id)),
    [photos, selected],
  );
  const readyCount = selectedPhotos.filter((p) => bakedCache.has(p.id)).length;
  const allReady = selectedPhotos.length > 0 && readyCount === selectedPhotos.length;

  // Build File[] from the cache. Synchronous — no awaits — so calling it
  // from a click handler preserves the iOS user gesture for navigator.share.
  function filesFromCache(): File[] {
    return selectedPhotos
      .map((p) => {
        const blob = bakedCache.get(p.id);
        return blob ? new File([blob], `rollo-${p.id}.jpg`, { type: 'image/jpeg' }) : null;
      })
      .filter((f): f is File => f !== null);
  }

  function downloadAnchors(files: File[]) {
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  }

  function tryShareSync(files: File[]): boolean {
    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };
    if (!nav.share || !nav.canShare || !nav.canShare({ files })) return false;
    nav.share({ files })
      .then(() => onClose())
      .catch((e: Error) => {
        if (e.name !== 'AbortError') {
          // Share rejected for non-cancel reasons — fall back to download.
          downloadAnchors(files);
        }
      });
    return true;
  }

  const useZip = selectedPhotos.length > SHARE_THRESHOLD;

  async function downloadAsZip(files: File[]) {
    const zip = new JSZip();
    for (const f of files) zip.file(f.name, f);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rollo-${files.length}-momentos.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // Save flow: ≤10 photos → share sheet (Save Images → Photos).
  // >10 photos → ZIP bundle to Files. Both rely on the pre-baked cache
  // so the click handler stays synchronous when everything is ready.
  function handleSave() {
    if (selected.size === 0 || busy) return;

    if (allReady) {
      const files = filesFromCache();
      if (useZip) {
        setBusy(true);
        downloadAsZip(files)
          .then(() => onClose())
          .finally(() => setBusy(false));
        return;
      }
      if (tryShareSync(files)) return;
      downloadAnchors(files);
      return;
    }

    // Not all photos are baked yet — wait for the rest, then dispatch.
    setBusy(true);
    void (async () => {
      try {
        const files: File[] = [];
        for (const p of selectedPhotos) {
          const cached = bakedCache.get(p.id);
          const blob = cached ?? (await bakeFilterToBlob(p.url, p.filter, p.id, p.takenAt));
          if (!cached) setBakedCache((prev) => new Map(prev).set(p.id, blob));
          files.push(new File([blob], `rollo-${p.id}.jpg`, { type: 'image/jpeg' }));
        }
        if (useZip) {
          await downloadAsZip(files);
          onClose();
          return;
        }
        // Gesture is already lost by now on iOS; share() likely no-ops, so
        // the fallback to multi-anchor download will kick in.
        if (!tryShareSync(files)) downloadAnchors(files);
      } finally {
        setBusy(false);
      }
    })();
  }

  // Compartir uses the same flow — distinction is visual on the button row.
  const handleShare = handleSave;

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="px-5 pt-2 pb-3">
        <h2 className="font-display text-3xl leading-tight">
          Selecciona tus momentos
        </h2>

        {/* Tab switcher: todas / por invitado */}
        <div className="mt-4 inline-flex rounded-full bg-white/5 p-1 text-sm">
          <TabButton
            active={tab === 'all'}
            onClick={() => {
              setTab('all');
              setOpenGuestId(null);
            }}
          >
            Todas
          </TabButton>
          <TabButton
            active={tab === 'by-guest'}
            onClick={() => {
              setTab('by-guest');
              setOpenGuestId(null);
            }}
          >
            Por invitado
          </TabButton>
        </div>

        {/* Select-all (only visible when there's a flat list to act on) */}
        {(tab === 'all' || (tab === 'by-guest' && openGuestId)) && visiblePhotos.length > 0 && (
          <button
            onClick={toggleSelectAll}
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-white/15 px-3 py-1.5 text-sm text-white"
          >
            <span
              className={`grid h-5 w-5 place-items-center rounded ${
                allSelected ? 'bg-white text-black' : 'border border-white/40'
              }`}
            >
              {allSelected && <Check size={14} />}
            </span>
            Seleccionar todas
          </button>
        )}
      </div>

      <div className="px-5 pb-32">
        {tab === 'by-guest' && !openGuestId ? (
          <GuestList groups={guestGroups} onPick={(id) => setOpenGuestId(id)} />
        ) : (
          <>
            {tab === 'by-guest' && openGuestId && (
              <button
                onClick={() => setOpenGuestId(null)}
                className="mb-3 text-sm text-white/60 hover:text-white"
              >
                ← Volver
              </button>
            )}
            <PhotoSelectGrid
              photos={visiblePhotos}
              selected={selected}
              onToggle={toggle}
              maxReached={selected.size >= MAX_SELECT}
            />
          </>
        )}
      </div>

      {/* One-shot centred popup the first time the user crosses the ZIP
          threshold. Share sheets choke past ~10 files on iOS, so beyond
          that we bundle as a ZIP into Files. */}
      {zipNoticeOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-6 animate-fade-in"
          onClick={() => setZipNoticeOpen(false)}
        >
          <div
            className="w-full max-w-xs rounded-3xl bg-rollo-bg p-6 text-center shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl leading-tight">
              Más de {SHARE_THRESHOLD} momentos
            </h3>
            <p className="mt-3 text-sm text-white/70">
              Como seleccionaste más de {SHARE_THRESHOLD} fotos, se descargarán
              juntas como un <span className="font-medium text-white">ZIP en Archivos</span> en
              lugar de guardarse una por una en Fotos.
            </p>
            <button
              type="button"
              onClick={() => setZipNoticeOpen(false)}
              className="mt-5 w-full rounded-full bg-white py-3 text-sm font-semibold text-black transition active:scale-95"
            >
              Entendido
            </button>
          </div>
        </div>
      )}

      {/* Sticky footer with share + save actions */}
      <div
        className="absolute inset-x-0 bottom-0 flex gap-3 border-t border-white/10 bg-rollo-bg/95 p-4 backdrop-blur"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        <button
          onClick={handleShare}
          disabled={selected.size === 0 || busy}
          className="flex flex-1 items-center justify-center gap-2 rounded-2xl border border-white/15 py-3 text-sm font-medium text-white transition active:scale-95 disabled:opacity-40"
        >
          <Share2 size={16} />
          Compartir
        </button>
        <button
          onClick={handleSave}
          disabled={selected.size === 0 || busy}
          className="flex flex-[1.5] items-center justify-center gap-2 rounded-2xl bg-[#9ECBFF] py-3 text-sm font-semibold text-black transition active:scale-95 disabled:opacity-40"
        >
          {busy
            ? useZip
              ? 'Empaquetando…'
              : 'Procesando…'
            : selected.size > 0 && !allReady
              ? `Preparando ${readyCount}/${selected.size}…`
              : useZip
                ? `Descargar ZIP (${selected.size})`
                : `Guardar ${selected.size || 0} momento${selected.size === 1 ? '' : 's'}`}
          <Download size={16} />
        </button>
      </div>
    </BottomSheet>
  );
}

function TabButton({
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
      className={`rounded-full px-4 py-1.5 transition ${
        active ? 'bg-white text-black' : 'text-white/70'
      }`}
    >
      {children}
    </button>
  );
}

function GuestList({
  groups,
  onPick,
}: {
  groups: { id: string; name: string; photos: SheetPhoto[] }[];
  onPick: (id: string) => void;
}) {
  if (!groups.length) {
    return <p className="py-8 text-center text-sm text-white/50">Aún no hay fotos.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {groups.map((g) => {
        const cover = g.photos[0];
        return (
          <button
            key={g.id}
            onClick={() => onPick(g.id)}
            className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-white/5 transition active:scale-[0.98]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover.url}
              alt={g.name}
              className="h-full w-full object-cover"
              style={{ filter: filterCss(cover.filter, cover.id) }}
            />
            <Grain filter={cover.filter} opacity={0.45} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 p-3 text-left">
              <p className="font-display text-base leading-tight">{g.name}</p>
              <p className="text-xs text-white/70">{g.photos.length} momentos</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function PhotoSelectGrid({
  photos,
  selected,
  onToggle,
  maxReached,
}: {
  photos: SheetPhoto[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  maxReached: boolean;
}) {
  if (!photos.length) {
    return <p className="py-8 text-center text-sm text-white/50">Aún no hay fotos.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      {photos.map((p) => {
        const isSelected = selected.has(p.id);
        const disabled = !isSelected && maxReached;
        return (
          <button
            key={p.id}
            onClick={() => !disabled && onToggle(p.id)}
            disabled={disabled}
            className={`relative aspect-[3/4] overflow-hidden rounded-2xl transition ${
              isSelected ? 'ring-2 ring-white' : 'ring-0'
            } ${disabled ? 'opacity-50' : ''}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.url}
              alt=""
              className="h-full w-full object-cover"
              style={{ filter: filterCss(p.filter, p.id) }}
            />
            <Grain filter={p.filter} opacity={0.45} />
            {p.by && (
              <span className="absolute left-2 top-2 max-w-[80%] truncate font-display text-xs italic text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.7)]">
                {p.by}
              </span>
            )}
            <span
              className={`absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md ${
                isSelected
                  ? 'bg-white text-black'
                  : 'border border-white/60 bg-black/30'
              }`}
            >
              {isSelected && <Check size={14} />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
