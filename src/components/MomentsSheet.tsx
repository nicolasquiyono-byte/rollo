'use client';

import { useEffect, useMemo, useState } from 'react';
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

const MAX_SELECT = 5;
type Tab = 'all' | 'by-guest';

export function MomentsSheet({ open, onClose, photos }: Props) {
  const [tab, setTab] = useState<Tab>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [openGuestId, setOpenGuestId] = useState<string | null>(null);

  // Clear selection whenever the sheet opens or closes.
  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setTab('all');
      setOpenGuestId(null);
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

  function toggle(photoId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) {
        next.delete(photoId);
      } else if (next.size < MAX_SELECT) {
        next.add(photoId);
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
      }
      setSelected(next);
    }
  }

  async function bakeSelected(): Promise<{ blob: Blob; name: string }[]> {
    const items = photos.filter((p) => selected.has(p.id));
    const out: { blob: Blob; name: string }[] = [];
    for (const p of items) {
      try {
        const blob = await bakeFilterToBlob(p.url, p.filter, p.id, p.takenAt);
        out.push({ blob, name: `rollo-${p.id}.jpg` });
      } catch (e) {
        console.warn('[MomentsSheet] bake failed for', p.id, e);
      }
    }
    return out;
  }

  async function handleSave() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    try {
      const baked = await bakeSelected();
      for (const { blob, name } of baked) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        // Small delay between downloads so the browser groups them properly.
        await new Promise((r) => setTimeout(r, 200));
      }
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function handleShare() {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    try {
      const baked = await bakeSelected();
      const files = baked.map(
        ({ blob, name }) => new File([blob], name, { type: 'image/jpeg' }),
      );
      const nav = navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
        share?: (data: ShareData) => Promise<void>;
      };
      if (nav.share && nav.canShare && nav.canShare({ files })) {
        try {
          await nav.share({ files });
          onClose();
          return;
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
        }
      }
      // Fallback to sequential download if Web Share unavailable.
      await handleSave();
    } finally {
      setBusy(false);
    }
  }

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
            ? 'Procesando…'
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
