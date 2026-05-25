'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { getDeviceId, getGuestName, setGuestName } from '@/lib/utils/device';
import { es } from '@/lib/i18n/es';
import { QRScanner } from '@/components/QRScanner';

interface Props {
  initialCode?: string;
  initialError?: string;
}

export function JoinByCode({ initialCode = '', initialError }: Props) {
  const router = useRouter();
  const supabase = createClient();
  const [code, setCode] = useState(initialCode);
  const [name, setName] = useState('');
  const [scanning, setScanning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);

  useEffect(() => {
    const stored = getGuestName();
    if (stored) setName(stored);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const normalized = code.trim().toUpperCase();
      const { data: rollo } = await supabase
        .from('rollos')
        .select('*')
        .eq('code', normalized)
        .maybeSingle();
      if (!rollo) {
        setError(es.join.not_found);
        return;
      }
      // If the rollo is already closed, skip the camera flow and send the
      // user straight to the gallery to view the photos.
      if (new Date(rollo.closes_at) < new Date()) {
        router.push(`/rollo/${normalized}/galeria`);
        return;
      }
      const deviceId = getDeviceId();
      setGuestName(name);
      await supabase
        .from('guests')
        .upsert(
          { rollo_id: rollo.id, name, device_id: deviceId },
          { onConflict: 'rollo_id,device_id' },
        );
      router.push(`/rollo/${normalized}/camara`);
    } catch (err) {
      console.error('[JoinByCode]', err);
      setError(es.errors.generic);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 pb-10 pt-12 animate-fade-in">
      <header className="mb-12 text-xs uppercase tracking-[0.2em] text-white/40">
        {es.brand}
      </header>

      <h1 className="font-display text-4xl leading-tight">{es.join.title}</h1>
      <p className="mt-3 text-sm text-white/60">{es.join.sub}</p>

      {scanning ? (
        <div className="mt-8">
          <QRScanner
            onResult={(text) => {
              try {
                const url = new URL(text);
                const c = url.searchParams.get('code');
                if (c) setCode(c.toUpperCase());
              } catch {
                setCode(text.trim().toUpperCase());
              }
              setScanning(false);
            }}
          />
          <button
            type="button"
            className="mt-4 w-full rounded-2xl border border-white/10 py-3 text-sm text-white/70"
            onClick={() => setScanning(false)}
          >
            {es.camera.close}
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-10 space-y-5">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-white/40">
              {es.join.code_label}
            </span>
            <input
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={es.join.code_placeholder}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-rollo-surface px-4 py-4 text-center font-display text-3xl tracking-[0.3em] outline-none transition focus:border-white/40"
            />
          </label>

          <button
            type="button"
            onClick={() => setScanning(true)}
            className="w-full rounded-2xl border border-white/10 py-3 text-sm text-white/80 transition hover:bg-white/5"
          >
            {es.join.scan_qr}
          </button>

          <label className="block pt-2">
            <span className="text-xs uppercase tracking-wide text-white/40">
              {es.join.name_label}
            </span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={es.join.name_placeholder}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-rollo-surface px-4 py-4 text-base outline-none transition focus:border-white/40"
            />
          </label>

          {error && <p className="text-sm text-rollo-accent">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-2xl bg-white py-4 font-medium text-black transition active:scale-[0.99] disabled:opacity-60"
          >
            {busy ? es.join.joining : es.join.submit}
          </button>
        </form>
      )}
    </main>
  );
}
