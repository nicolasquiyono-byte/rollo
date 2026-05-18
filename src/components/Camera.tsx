'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { es } from '@/lib/i18n/es';
import { compressImage } from '@/lib/utils/compress';

interface Capture {
  blob: Blob;
  width: number;
  height: number;
  previewUrl: string;
}

interface Props {
  disabled?: boolean;
  facing: 'user' | 'environment';
  onCapture: (capture: Capture) => Promise<void> | void;
}

export function Camera({ disabled, facing, onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startGenRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Capture | null>(null);
  const [busy, setBusy] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(async () => {
    const myGen = ++startGenRef.current;
    const isStale = () => myGen !== startGenRef.current;
    console.log('[Camera] start()', {
      gen: myGen,
      facing,
      secure: typeof window !== 'undefined' && window.isSecureContext,
    });
    setError(null);
    stop();
    if (!navigator.mediaDevices?.getUserMedia) {
      console.error('[Camera] navigator.mediaDevices.getUserMedia unavailable');
      setError(es.camera.not_supported);
      return;
    }

    const requestStream = async (constraints: MediaStreamConstraints, label: string) => {
      console.log(`[Camera] getUserMedia (${label})`, constraints);
      const s = await navigator.mediaDevices.getUserMedia(constraints);
      const track = s.getVideoTracks()[0];
      console.log('[Camera] stream obtained', {
        label,
        videoTracks: s.getVideoTracks().length,
        trackLabel: track?.label,
        settings: track?.getSettings?.(),
      });
      return s;
    };

    let stream: MediaStream;
    try {
      try {
        stream = await requestStream(
          { video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false },
          `facingMode=${facing}`,
        );
      } catch (firstErr) {
        const name = (firstErr as { name?: string }).name;
        console.warn('[Camera] first attempt failed, retrying with video:true', { name, firstErr });
        if (name === 'NotAllowedError') throw firstErr;
        stream = await requestStream({ video: true, audio: false }, 'video=true (fallback)');
      }
    } catch (err) {
      if (isStale()) {
        console.log('[Camera] error from stale start() ignored', { gen: myGen });
        return;
      }
      const name = (err as { name?: string }).name ?? 'UnknownError';
      const message = (err as Error).message ?? String(err);
      console.error('[Camera] getUserMedia failed', { name, message, err });
      switch (name) {
        case 'NotAllowedError':
        case 'PermissionDeniedError':
          setError(es.camera.permission_denied);
          break;
        case 'NotFoundError':
        case 'DevicesNotFoundError':
          setError('No encontramos ninguna cámara en tu dispositivo.');
          break;
        case 'NotReadableError':
        case 'TrackStartError':
          setError('Otra app está usando la cámara. Ciérrala y reintenta.');
          break;
        case 'OverconstrainedError':
        case 'ConstraintNotSatisfiedError':
          setError(`Tu cámara no soporta esa configuración (${message}).`);
          break;
        default:
          setError(`No pudimos abrir la cámara: ${name} — ${message}`);
      }
      return;
    }

    if (isStale()) {
      console.log('[Camera] stale stream discarded', { gen: myGen, current: startGenRef.current });
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;
    if (!videoRef.current) {
      console.error('[Camera] videoRef.current is null after stream acquired');
      setError('El elemento <video> no está montado.');
      return;
    }
    videoRef.current.srcObject = stream;
    console.log('[Camera] srcObject set, calling play()');
    try {
      await videoRef.current.play();
      if (isStale()) {
        console.log('[Camera] play() resolved on stale gen, ignoring', { gen: myGen });
        return;
      }
      console.log('[Camera] play() resolved', {
        videoWidth: videoRef.current.videoWidth,
        videoHeight: videoRef.current.videoHeight,
        readyState: videoRef.current.readyState,
        paused: videoRef.current.paused,
      });
    } catch (playErr) {
      const name = (playErr as { name?: string }).name;
      if (name === 'AbortError' || isStale()) {
        console.log('[Camera] play() aborted (superseded by a newer start)', { gen: myGen, name });
        return;
      }
      console.error('[Camera] video.play() rejected', playErr);
      setError(`No pudimos reproducir el video: ${(playErr as Error).message ?? 'autoplay bloqueado'}.`);
    }
  }, [facing, stop]);

  useEffect(() => {
    start();
    return stop;
  }, [start, stop]);

  const snap = async () => {
    console.log('[Camera] snap click', { disabled, hasVideo: !!videoRef.current });
    const video = videoRef.current;
    if (!video) {
      setError('La cámara no está lista.');
      return;
    }
    if (disabled) {
      console.warn('[Camera] disabled, ignoring snap');
      return;
    }
    if (!video.videoWidth || !video.videoHeight) {
      console.warn('[Camera] video metadata not ready', {
        w: video.videoWidth,
        h: video.videoHeight,
        readyState: video.readyState,
      });
      setError('La cámara aún no carga. Espera un segundo.');
      return;
    }
    try {
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.drawImage(video, 0, 0);
      const raw = await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, 'image/jpeg', 0.95),
      );
      if (!raw) throw new Error('canvas.toBlob returned null');
      console.log('[Camera] raw blob', raw.size, 'bytes');
      const compressed = await compressImage(raw);
      console.log('[Camera] compressed', compressed.size, 'bytes', `${compressed.width}x${compressed.height}`);
      setPreview({
        blob: compressed.blob,
        width: compressed.width,
        height: compressed.height,
        previewUrl: URL.createObjectURL(compressed.blob),
      });
    } catch (err) {
      console.error('[Camera] snap failed', err);
      setError('No pudimos capturar la foto. Revisa la consola.');
    }
  };

  const confirm = async () => {
    if (!preview) return;
    console.log('[Camera] confirm click');
    setBusy(true);
    try {
      await onCapture(preview);
      console.log('[Camera] onCapture resolved');
      URL.revokeObjectURL(preview.previewUrl);
      setPreview(null);
    } catch (err) {
      console.error('[Camera] confirm failed', err);
      setError('No pudimos subir la foto. Revisa la consola.');
    } finally {
      setBusy(false);
    }
  };

  const retake = () => {
    if (preview) URL.revokeObjectURL(preview.previewUrl);
    setPreview(null);
  };

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-rollo-bg p-6 text-center text-rollo-ink">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full bg-black">
      <video
        ref={videoRef}
        playsInline
        muted
        className={`h-full w-full object-cover ${preview ? 'invisible' : ''}`}
      />
      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.previewUrl}
          alt="preview"
          className="absolute inset-0 h-full w-full object-contain"
        />
      )}

      {/* Capture button (or confirm/retake when preview is shown) */}
      <div
        className="absolute inset-x-0 z-10 flex items-center justify-center gap-6"
        style={{ bottom: 'max(env(safe-area-inset-bottom), 30px)' }}
      >
        {preview ? (
          <>
            <button
              onClick={retake}
              className="rounded-full bg-black/40 px-5 py-3 text-sm text-white backdrop-blur transition active:scale-95"
            >
              {es.camera.retake}
            </button>
            <button
              onClick={confirm}
              disabled={busy}
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition active:scale-95 disabled:opacity-60"
            >
              {busy ? es.camera.uploading : es.camera.confirm}
            </button>
          </>
        ) : (
          <button
            onClick={snap}
            disabled={disabled}
            className="grid h-20 w-20 place-items-center rounded-full bg-white shadow-xl shadow-black/30 ring-4 ring-[#E85D04] transition active:scale-90 disabled:opacity-50"
            aria-label={es.camera.capture}
          />
        )}
      </div>
    </div>
  );
}
