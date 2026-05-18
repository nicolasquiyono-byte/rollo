'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Countdown } from '@/components/Countdown';
import { Grain } from '@/components/Grain';
import { es } from '@/lib/i18n/es';
import { filterCss } from '@/lib/utils/filter-css';
import { GuestPhotosModal } from './GuestPhotosModal';
import type { FilterType, Guest, Rollo } from '@/types';

interface InitialCounts {
  guestsCount: number;
  photosCount: number;
}

interface RecentPhoto {
  id: string;
  url: string;
  by: string | null;
  takenAt: string;
  filter: FilterType;
}

type PhotoRow = {
  id: string;
  storage_path: string;
  taken_at: string;
  guest_id: string;
  filter: FilterType | null;
  guests: { name: string } | { name: string }[] | null;
};

interface Props {
  rollo: Rollo;
  token: string;
  initial: InitialCounts;
}

export function AdminDashboard({ rollo: initialRollo, token, initial }: Props) {
  const supabase = createClient();
  const [rollo, setRollo] = useState(initialRollo);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [stats, setStats] = useState(initial);
  const [recent, setRecent] = useState<RecentPhoto[]>([]);
  const [acting, setActing] = useState<'close' | 'reveal' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);

  // initial loads (guests + recent photos)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [guestsRes, photosRes] = await Promise.all([
        supabase
          .from('guests')
          .select('*')
          .eq('rollo_id', rollo.id)
          .order('joined_at', { ascending: false }),
        supabase
          .from('photos')
          .select('id, storage_path, taken_at, guest_id, filter, guests(name)')
          .eq('rollo_id', rollo.id)
          .order('taken_at', { ascending: false })
          .limit(8),
      ]);
      if (cancelled) return;
      if (guestsRes.data) setGuests(guestsRes.data as Guest[]);
      if (photosRes.data) {
        const hydrated = await Promise.all(
          (photosRes.data as PhotoRow[]).map(async (p) => {
            const { data } = await supabase.storage
              .from('rollo-photos')
              .createSignedUrl(p.storage_path, 60 * 60);
            const name = Array.isArray(p.guests) ? p.guests[0]?.name : p.guests?.name;
            return {
              id: p.id,
              url: data?.signedUrl ?? '',
              by: name ?? null,
              takenAt: p.taken_at,
              filter: (p.filter ?? 'original') as FilterType,
            };
          }),
        );
        setRecent(hydrated.filter((p) => p.url));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rollo.id, supabase]);

  // realtime: guests INSERT + UPDATE
  useEffect(() => {
    const channel = supabase
      .channel(`admin-guests:${rollo.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'guests', filter: `rollo_id=eq.${rollo.id}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const next = payload.new as Guest;
            setGuests((prev) => (prev.some((g) => g.id === next.id) ? prev : [next, ...prev]));
            setStats((s) => ({ ...s, guestsCount: s.guestsCount + 1 }));
          } else if (payload.eventType === 'UPDATE') {
            const next = payload.new as Guest;
            setGuests((prev) => prev.map((g) => (g.id === next.id ? next : g)));
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [rollo.id, supabase]);

  // realtime: photos INSERT
  useEffect(() => {
    const channel = supabase
      .channel(`admin-photos:${rollo.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photos', filter: `rollo_id=eq.${rollo.id}` },
        async (payload) => {
          const row = payload.new as {
            id: string;
            storage_path: string;
            taken_at: string;
            guest_id: string;
            filter: FilterType | null;
          };
          setStats((s) => ({ ...s, photosCount: s.photosCount + 1 }));
          const [{ data: guestRow }, { data: signed }] = await Promise.all([
            supabase.from('guests').select('name').eq('id', row.guest_id).maybeSingle(),
            supabase.storage.from('rollo-photos').createSignedUrl(row.storage_path, 60 * 60),
          ]);
          if (!signed?.signedUrl) return;
          setRecent((prev) =>
            [
              {
                id: row.id,
                url: signed.signedUrl,
                by: guestRow?.name ?? null,
                takenAt: row.taken_at,
                filter: (row.filter ?? 'original') as FilterType,
              },
              ...prev,
            ].slice(0, 8),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [rollo.id, supabase]);

  async function callAction(rpc: 'close_rollo_now' | 'reveal_rollo_now', kind: 'close' | 'reveal', confirmMsg: string) {
    if (!confirm(confirmMsg)) return;
    setActing(kind);
    setError(null);
    const { data, error: rpcErr } = await supabase.rpc(rpc, { p_token: token }).single();
    if (rpcErr) {
      console.error(`[Admin] ${rpc} failed`, rpcErr);
      setError(rpcErr.message);
    } else if (data) {
      setRollo(data as Rollo);
    }
    setActing(null);
  }

  const closeNow = () =>
    callAction('close_rollo_now', 'close', '¿Cerrar el rollo ahora? Los invitados no podrán seguir tomando fotos.');
  const revealNow = () =>
    callAction('reveal_rollo_now', 'reveal', '¿Revelar las fotos ahora? Esta acción no se puede deshacer.');

  function copyJoinLink() {
    const url = `${window.location.origin}/unirse?code=${rollo.code}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  const avgPhotos = stats.guestsCount > 0 ? (stats.photosCount / stats.guestsCount).toFixed(1) : '0';
  const isClosed = new Date(rollo.closes_at).getTime() <= Date.now();
  const isRevealed =
    rollo.reveal_type === 'instant' ||
    (rollo.reveals_at !== null && new Date(rollo.reveals_at).getTime() <= Date.now());

  return (
    <main className="mx-auto max-w-2xl px-6 pb-40 pt-8">
      <header className="flex items-center justify-between">
        <Link href={`/rollo/${rollo.code}`} className="text-xs uppercase tracking-widest text-rollo-muted">
          ← Vista invitado
        </Link>
        <span className="rounded-full bg-rollo-accent/10 px-3 py-1 text-xs uppercase tracking-wide text-rollo-accent">
          Admin
        </span>
      </header>

      <h1 className="mt-6 font-display text-3xl">{rollo.name}</h1>
      <p className="mt-1 text-sm text-rollo-muted">
        Código: <span className="font-display tracking-widest text-rollo-ink">{rollo.code}</span>
      </p>

      <section className="mt-8 grid grid-cols-2 gap-3">
        <StatCard label="Invitados" value={stats.guestsCount.toString()} />
        <StatCard label="Fotos" value={stats.photosCount.toString()} />
        <StatCard label="Promedio" value={avgPhotos} unit="por invitado" />
        <StatCard label={isClosed ? 'Cerrado' : 'Cierra en'}>
          {isClosed ? (
            <p className="mt-2 font-display text-2xl text-rollo-muted">—</p>
          ) : (
            <div className="mt-2">
              <Countdown target={rollo.closes_at} />
            </div>
          )}
        </StatCard>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-xl">Invitados ({guests.length})</h2>
        {guests.length === 0 ? (
          <p className="mt-4 text-rollo-muted">Aún nadie se ha unido.</p>
        ) : (
          <ul className="mt-4 divide-y divide-white/5">
            {guests.map((g) => (
              <li key={g.id}>
                <button
                  type="button"
                  onClick={() => setSelectedGuestId(g.id)}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between rounded-xl px-2 py-3 text-left transition hover:bg-rollo-surface/50 focus:bg-rollo-surface/50 focus:outline-none"
                  aria-label={`Ver fotos de ${g.name}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-full bg-rollo-surface text-xs font-medium">
                      {initials(g.name)}
                    </span>
                    <div>
                      <p className="flex items-center gap-1">
                        <span>{g.name}</span>
                        <span aria-hidden className="text-rollo-muted">›</span>
                      </p>
                      <p className="text-xs text-rollo-muted">se unió {formatRelative(g.joined_at)}</p>
                    </div>
                  </div>
                  <span className="text-sm text-rollo-muted">
                    <span className="text-rollo-ink">{g.shots_used}</span> / {rollo.shot_limit}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {recent.length > 0 && (
        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xl">Últimas fotos</h2>
            <Link
              href={`/rollo/${rollo.code}/galeria`}
              className="text-xs text-rollo-muted hover:text-rollo-ink"
            >
              Ver todas →
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-4 gap-1">
            {recent.map((p) => (
              <div key={p.id} className="relative aspect-square overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={p.url}
                  alt=""
                  className="h-full w-full object-cover"
                  style={{ filter: filterCss(p.filter, p.id) }}
                  loading="lazy"
                  title={p.by ? `${es.gallery.by} ${p.by}` : undefined}
                />
                <Grain filter={p.filter} opacity={0.5} />
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="fixed inset-x-0 bottom-0 z-10 mx-auto max-w-2xl border-t border-white/5 bg-rollo-bg/95 p-4 backdrop-blur">
        {error && <p className="mb-2 text-center text-xs text-rollo-accent">Error: {error}</p>}
        <div className="flex flex-col gap-2">
          <Link
            href={`/rollo/${rollo.code}/galeria`}
            className="rounded-full border border-white/10 py-3 text-center text-sm"
          >
            Ver galería completa
          </Link>
          <button
            onClick={copyJoinLink}
            className="rounded-full border border-white/10 py-3 text-sm"
          >
            {copied ? '¡Copiado!' : 'Copiar link de invitación'}
          </button>
          {!isClosed && (
            <button
              onClick={closeNow}
              disabled={acting !== null}
              className="rounded-full bg-rollo-accent py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {acting === 'close' ? 'Cerrando…' : 'Cerrar rollo ahora'}
            </button>
          )}
          {!isRevealed && rollo.reveal_type === 'delayed' && (
            <button
              onClick={revealNow}
              disabled={acting !== null}
              className="rounded-full border border-rollo-accent py-3 text-sm font-semibold text-rollo-accent disabled:opacity-60"
            >
              {acting === 'reveal' ? 'Revelando…' : 'Revelar fotos ahora'}
            </button>
          )}
        </div>
      </footer>

      {selectedGuestId && (() => {
        const g = guests.find((x) => x.id === selectedGuestId);
        if (!g) return null;
        return (
          <GuestPhotosModal
            guest={g}
            shotLimit={rollo.shot_limit}
            rolloId={rollo.id}
            onClose={() => setSelectedGuestId(null)}
          />
        );
      })()}
    </main>
  );
}

function StatCard({
  label,
  value,
  unit,
  children,
}: {
  label: string;
  value?: string;
  unit?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-rollo-surface p-4">
      <p className="text-xs uppercase tracking-wide text-rollo-muted">{label}</p>
      {children ?? (
        <p className="mt-2 font-display text-2xl">
          {value}
          {unit && <span className="ml-1 text-xs text-rollo-muted">{unit}</span>}
        </p>
      )}
    </div>
  );
}

function initials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase())
      .join('') || '?'
  );
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return 'ahora';
  const min = Math.floor(sec / 60);
  if (min < 60) return `hace ${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `hace ${hr}h`;
  const days = Math.floor(hr / 24);
  return `hace ${days}d`;
}
