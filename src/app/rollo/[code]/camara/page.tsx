'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { X, QrCode, RotateCw, Film } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import Camera from '@/components/Camera';
import { QRCodeView } from '@/components/QRCode';
import { getDeviceId, getGuestName } from '@/lib/utils/device';
import { enqueuePhoto, listPending, removePending } from '@/lib/utils/offline-queue';
import { eventJoinUrl } from '@/lib/utils/qr';
import { filterCss } from '@/lib/utils/filter-css';
import { Grain } from '@/components/Grain';
import { es } from '@/lib/i18n/es';
import type { Guest, QueuedPhoto, Rollo } from '@/types';

interface Thumb {
  id: string;
  url: string;
  filter: 'original' | 'vintage' | 'bw';
}

export default function CameraPage() {
  const router = useRouter();
  const { code } = useParams<{ code: string }>();
  const supabase = createClient();

  const [rollo, setRollo] = useState<Rollo | null>(null);
  const [guest, setGuest] = useState<Guest | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [facing, setFacing] = useState<'user' | 'environment'>('environment');
  const [recentThumbs, setRecentThumbs] = useState<Thumb[]>([]);
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    (async () => {
      const normalized = code.toUpperCase();
      const guestName = getGuestName();
      const deviceId = getDeviceId();
      console.log('[Camara] init', { code: normalized, guestName, deviceId });
      if (!guestName) {
        router.replace(`/unirse?code=${normalized}`);
        return;
      }
      const { data: rolloRow, error: rolloErr } = await supabase
        .from('rollos')
        .select('*')
        .eq('code', normalized)
        .maybeSingle();
      if (rolloErr) console.error('[Camara] rollo lookup error', rolloErr);
      if (!rolloRow) {
        router.replace('/unirse');
        return;
      }
      setRollo(rolloRow as Rollo);

      const { data: guestRow, error: guestErr } = await supabase
        .from('guests')
        .select('*')
        .eq('rollo_id', rolloRow.id)
        .eq('device_id', deviceId)
        .maybeSingle();
      if (guestErr) console.error('[Camara] guest lookup error', guestErr);

      let g = guestRow as Guest | null;
      if (!g) {
        console.log('[Camara] no guest row → auto-registering host/visitor');
        const { data: created, error: createErr } = await supabase
          .from('guests')
          .insert({ rollo_id: rolloRow.id, name: guestName, device_id: deviceId })
          .select()
          .single();
        if (createErr) {
          console.error('[Camara] auto-register failed', createErr);
          setStatus('No pudimos registrarte como invitado.');
        } else {
          g = created as Guest;
          console.log('[Camara] auto-registered as guest', g.id);
        }
      }
      setGuest(g);

      // Load this guest's most recent 3 thumbnails
      if (g) {
        const { data: photoRows } = await supabase
          .from('photos')
          .select('id, storage_path, filter')
          .eq('rollo_id', rolloRow.id)
          .eq('guest_id', g.id)
          .order('taken_at', { ascending: false })
          .limit(3);
        if (photoRows) {
          const hydrated = await Promise.all(
            photoRows.map(async (p) => {
              const { data: signed } = await supabase.storage
                .from('rollo-photos')
                .createSignedUrl(p.storage_path, 60 * 60);
              return signed?.signedUrl
                ? { id: p.id, url: signed.signedUrl, filter: (p.filter ?? 'original') as Thumb['filter'] }
                : null;
            }),
          );
          setRecentThumbs(hydrated.filter((t): t is Thumb => !!t));
        }
      }

      void flushPending(rolloRow.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function flushPending(rolloId: string) {
    const pending = await listPending(rolloId);
    for (const item of pending) {
      const path = `rollos/${rolloId}/${item.id}.jpg`;
      const { error } = await supabase.storage
        .from('rollo-photos')
        .upload(path, item.blob, { contentType: 'image/jpeg' });
      if (!error) {
        await supabase.from('photos').insert({
          rollo_id: rolloId,
          guest_id: item.guest_id,
          storage_path: path,
          width: item.width,
          height: item.height,
          size_bytes: item.blob.size,
          filter: item.filter,
          taken_at: item.taken_at,
        });
        await removePending(item.id);
      }
    }
  }

  const shotsUsed = guest?.shots_used ?? 0;
  const shotLimit = rollo?.shot_limit ?? 10;
  const shotsLeft = Math.max(0, shotLimit - shotsUsed);
  const outOfShots = shotsUsed >= shotLimit;

  async function onCapture({ blob, width, height }: { blob: Blob; width: number; height: number }) {
    console.log('[Camara] onCapture', { hasRollo: !!rollo, hasGuest: !!guest, blobSize: blob.size });
    if (!rollo) {
      setStatus('Rollo no cargado.');
      return;
    }
    if (!guest) {
      setStatus('No estás registrado como invitado. Recarga la página.');
      return;
    }
    if (outOfShots) {
      setStatus(es.errors.shot_limit_reached);
      return;
    }
    const id = crypto.randomUUID();
    const path = `rollos/${rollo.id}/${id}.jpg`;
    const takenAt = new Date().toISOString();

    if (!navigator.onLine) {
      console.log('[Camara] offline → enqueue', id);
      const queued: QueuedPhoto = {
        id,
        rollo_id: rollo.id,
        guest_id: guest.id,
        blob,
        width,
        height,
        filter: rollo.filter,
        taken_at: takenAt,
      };
      await enqueuePhoto(queued);
      setStatus(es.camera.queued_offline);
      setGuest({ ...guest, shots_used: guest.shots_used + 1 });
      return;
    }

    console.log('[Camara] uploading to storage', path, blob.size, 'bytes');
    const { error: upErr } = await supabase.storage
      .from('rollo-photos')
      .upload(path, blob, { contentType: 'image/jpeg' });
    if (upErr) {
      console.error('[Camara] storage upload failed', upErr);
      await enqueuePhoto({
        id,
        rollo_id: rollo.id,
        guest_id: guest.id,
        blob,
        width,
        height,
        filter: rollo.filter,
        taken_at: takenAt,
      });
      setStatus(`${es.errors.upload_failed} (${upErr.message})`);
      return;
    }
    console.log('[Camara] storage upload OK');

    const { error: insertErr } = await supabase.from('photos').insert({
      rollo_id: rollo.id,
      guest_id: guest.id,
      storage_path: path,
      width,
      height,
      size_bytes: blob.size,
      filter: rollo.filter,
      taken_at: takenAt,
    });
    if (insertErr) {
      console.error('[Camara] photo row insert failed', insertErr);
      setStatus(`Foto subida pero no registrada (${insertErr.message}).`);
      return;
    }
    const { error: updErr } = await supabase
      .from('guests')
      .update({ shots_used: guest.shots_used + 1 })
      .eq('id', guest.id);
    if (updErr) console.warn('[Camara] guest counter update failed', updErr);
    setGuest({ ...guest, shots_used: guest.shots_used + 1 });
    setStatus(null);

    // Append new thumbnail at the top of the stack
    const { data: signed } = await supabase.storage
      .from('rollo-photos')
      .createSignedUrl(path, 60 * 60);
    if (signed?.signedUrl) {
      setRecentThumbs((prev) =>
        [{ id, url: signed.signedUrl, filter: rollo.filter as Thumb['filter'] }, ...prev].slice(0, 3),
      );
    }
    console.log('[Camara] capture complete');
  }

  function copyJoinLink() {
    if (!rollo) return;
    const url = eventJoinUrl(rollo.code);
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (!rollo) return <div className="grid h-dvh place-items-center text-rollo-muted">…</div>;

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black">
      {/* Camera surface */}
      <Camera 
        disabled={outOfShots} 
        facing={facing} 
        filter={rollo.filter}
        photoId={crypto.randomUUID()}
        takenAt={new Date().toISOString()}
        onCapture={onCapture} 
      />

      {/* Top-left: close */}
      <button
        onClick={() => router.back()}
        aria-label="Cerrar cámara"
        className="absolute z-10 grid h-11 w-11 place-items-center rounded-xl bg-black/30 text-white backdrop-blur transition active:scale-95"
        style={{
          top: 'max(env(safe-area-inset-top), 20px)',
          left: 20,
        }}
      >
        <X size={20} />
      </button>

      {/* Top-right stack: QR + flip */}
      <div
        className="absolute right-5 z-10 flex flex-col gap-2"
        style={{ top: 'max(env(safe-area-inset-top), 20px)' }}
      >
        <button
          onClick={() => setShowQR(true)}
          aria-label="Compartir código del rollo"
          className="grid h-11 w-11 place-items-center rounded-xl bg-black/30 text-white backdrop-blur transition active:scale-95"
        >
          <QrCode size={20} />
        </button>
        <button
          onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
          aria-label="Cambiar cámara"
          className="grid h-11 w-11 place-items-center rounded-xl bg-black/30 text-white backdrop-blur transition active:scale-95"
        >
          <RotateCw size={18} />
        </button>
      </div>

      {/* Top-center: compact shot counter pill (single line, out of the
          bottom-toolbar zone so it doesn't crowd zoom pills / shutter). */}
      <div
        className="absolute left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[rgba(232,93,4,0.92)] px-3 py-1.5 text-white shadow-lg shadow-black/30 backdrop-blur"
        style={{ top: 'max(env(safe-area-inset-top), 20px)' }}
      >
        <Film size={12} className="opacity-80" />
        <span className="font-display text-base font-medium leading-none">{shotsLeft}</span>
        <span className="text-[10px] uppercase tracking-wide opacity-90">fotos</span>
      </div>

      {/* Right side, below the QR/flip stack: smaller thumbnails so they
          don't crowd the bottom toolbar (zoom pills + shutter + flash). */}
      {recentThumbs.length > 0 && (
        <div
          className="absolute right-5 z-10 flex flex-col gap-2"
          style={{ top: 'calc(max(env(safe-area-inset-top), 20px) + 108px)' }}
        >
          {recentThumbs.map((t) => (
            <button
              key={t.id}
              onClick={() => router.push(`/rollo/${rollo.code}/galeria`)}
              aria-label="Ver galería"
              className="relative h-[44px] w-[44px] overflow-hidden rounded-lg border-2 border-white shadow-lg shadow-black/40 transition active:scale-95 animate-fade-in"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={t.url}
                alt=""
                className="h-full w-full object-cover"
                style={{ filter: filterCss(t.filter, t.id) }}
              />
              <Grain filter={t.filter} opacity={0.45} />
            </button>
          ))}
        </div>
      )}

      {/* Status toast */}
      {status && (
        <p className="absolute inset-x-0 bottom-[200px] z-10 mx-auto w-fit max-w-[80%] rounded-full bg-black/70 px-4 py-2 text-center text-xs text-white backdrop-blur">
          {status}
        </p>
      )}

      {/* QR share modal */}
      {showQR && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in-slow"
          onClick={() => setShowQR(false)}
          role="dialog"
        >
          <div
            className="mx-6 w-full max-w-sm rounded-3xl bg-rollo-bg p-8 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-display text-2xl">Escanea para unirte</h2>
            <p className="mt-1 text-sm text-white/60">{rollo.name}</p>

            <div className="mt-6 flex justify-center">
              <QRCodeView code={rollo.code} size={240} />
            </div>

            <p className="mt-6 text-xs uppercase tracking-wide text-white/40">Código</p>
            <p className="font-display text-2xl tracking-[0.3em] text-white">{rollo.code}</p>

            <button
              onClick={copyJoinLink}
              className="mt-6 w-full rounded-2xl border border-white/10 py-3 text-sm transition hover:bg-white/5"
            >
              {copied ? '¡Copiado!' : 'Copiar link'}
            </button>
            <button
              onClick={() => setShowQR(false)}
              className="mt-2 w-full py-3 text-sm text-white/60 hover:text-white"
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
