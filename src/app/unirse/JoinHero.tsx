'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDeviceId, getGuestName, setGuestName } from '@/lib/utils/device';
import { diffParts, formatCountdown } from '@/lib/utils/countdown';
import { es } from '@/lib/i18n/es';
import type { Rollo } from '@/types';

interface Props {
  rollo: Rollo;
}

export function JoinHero({ rollo }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [storedName, setStoredName] = useState<string | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState('');

  useEffect(() => {
    const stored = getGuestName();
    setStoredName(stored);
    if (stored) setNameInput(stored);
  }, []);

  useEffect(() => {
    const update = () => {
      const parts = diffParts(rollo.closes_at);
      if (parts.done) {
        setCountdown('Cerrado');
        return;
      }
      setCountdown(`Quedan ${formatCountdown(parts, es.countdown)}`);
    };
    update();
    const id = setInterval(update, 30_000);
    return () => clearInterval(id);
  }, [rollo.closes_at]);

  async function register(guestName: string) {
    setSubmitting(true);
    setError(null);
    try {
      const deviceId = getDeviceId();
      setGuestName(guestName);
      const { error: upErr } = await supabase
        .from('guests')
        .upsert(
          { rollo_id: rollo.id, name: guestName, device_id: deviceId },
          { onConflict: 'rollo_id,device_id' },
        );
      if (upErr) throw upErr;
      router.push(`/rollo/${rollo.code}/camara`);
    } catch (err) {
      console.error('[JoinHero] register failed', err);
      setError('No pudimos registrarte. Intenta de nuevo.');
      setSubmitting(false);
    }
  }

  function handleJoin() {
    setShowSheet(true);
  }

  function handleNameSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    void register(trimmed);
  }

  const closed = new Date(rollo.closes_at).getTime() <= Date.now();

  return (
    <main className="relative h-dvh w-full overflow-hidden text-white">
      {rollo.cover_image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={rollo.cover_image_url}
          alt=""
          className="absolute inset-0 h-full w-full animate-fade-in-slow object-cover"
        />
      ) : (
        <div className="noise-bg absolute inset-0 h-full w-full" />
      )}

      <div className="hero-gradient absolute inset-0" />

      <div
        className="relative z-10 flex h-full flex-col px-6"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 24px)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 32px)',
        }}
      >
        <header className="flex items-center justify-between text-xs uppercase tracking-[0.2em] text-white/60 animate-fade-in">
          <span>{es.brand}</span>
          <span className="font-display text-sm tracking-widest text-white/80">{rollo.code}</span>
        </header>

        <section className="flex flex-1 flex-col items-center justify-center text-center">
          <h1
            className="max-w-[18ch] font-display text-5xl font-normal leading-[1.05] tracking-tight animate-fade-in md:text-6xl"
            style={{ animationDelay: '120ms' }}
          >
            {rollo.name}
          </h1>

          {rollo.host_name && (
            <p
              className="mt-6 text-sm text-white/70 animate-fade-in"
              style={{ animationDelay: '240ms' }}
            >
              Te invita <span className="text-white/90">{rollo.host_name}</span>
            </p>
          )}

          <div
            className="mt-10 flex items-center gap-6 text-sm text-white/80 animate-fade-in"
            style={{ animationDelay: '360ms' }}
          >
            <span className="flex items-center gap-2">
              <ClockIcon />
              {countdown || '…'}
            </span>
            <span className="h-1 w-1 rounded-full bg-white/30" aria-hidden />
            <span className="flex items-center gap-2">
              <CameraIcon />
              {rollo.shot_limit} disparos
            </span>
          </div>
        </section>

        <footer
          className="space-y-3 animate-fade-in"
          style={{ animationDelay: '480ms' }}
        >
          {error && <p className="text-center text-xs text-rollo-accent">{error}</p>}

          {closed ? (
            <button
              onClick={() => router.push(`/rollo/${rollo.code}/galeria`)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-medium text-black shadow-lg shadow-black/20 transition active:scale-[0.99]"
            >
              <span>Ver tu rollo</span>
              <ArrowUpRightIcon />
            </button>
          ) : (
            <>
              <button
                onClick={handleJoin}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-4 text-base font-medium text-black shadow-lg shadow-black/20 transition active:scale-[0.99] disabled:opacity-50"
              >
                <span>Abrir en la app</span>
                <ArrowUpRightIcon />
              </button>

              <button
                onClick={handleJoin}
                disabled={submitting}
                className="w-full rounded-2xl border border-white/30 py-4 text-base font-medium text-white transition active:scale-[0.99] hover:bg-white/5 disabled:opacity-50"
              >
                {submitting ? 'Entrando…' : 'Continuar en navegador'}
              </button>

              <p className="pt-1 text-center text-xs text-white/50">
                <button
                  onClick={handleJoin}
                  className="underline underline-offset-2 transition hover:text-white/80"
                >
                  ¿Ya tienes la app? Ábrela directo
                </button>
              </p>
            </>
          )}
        </footer>
      </div>

      {showSheet && (
        <div className="absolute inset-0 z-20 flex items-end bg-black/70 backdrop-blur-sm animate-fade-in-slow">
          <form
            onSubmit={handleNameSubmit}
            className="w-full rounded-t-[28px] bg-rollo-bg px-6 pt-8"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 32px)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-6 h-1 w-10 rounded-full bg-white/20" />
            <h2 className="font-display text-3xl">¿Cómo te llamas?</h2>
            <p className="mt-2 text-sm text-white/60">
              Tu nombre aparecerá junto a las fotos que tomes en {rollo.name}.
            </p>
            <input
              autoFocus
              required
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              placeholder="Tu nombre"
              className="mt-6 w-full rounded-2xl border border-white/10 bg-rollo-surface px-4 py-4 text-base outline-none transition focus:border-white/40"
            />
            <button
              type="submit"
              disabled={!nameInput.trim() || submitting}
              className="mt-3 w-full rounded-2xl bg-white py-4 font-medium text-black transition active:scale-[0.99] disabled:opacity-50"
            >
              {submitting ? 'Entrando…' : 'Entrar al rollo'}
            </button>
            <button
              type="button"
              onClick={() => setShowSheet(false)}
              className="mt-2 w-full py-3 text-sm text-white/60 hover:text-white"
            >
              Cancelar
            </button>
          </form>
        </div>
      )}
    </main>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function ArrowUpRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
