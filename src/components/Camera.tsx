// Camera.tsx v3 — adds pinch-to-zoom, zoom presets (0.5×/1×/2×) and a
// flash toggle when the browser supports it.

import { useRef, useEffect, useState, useCallback } from 'react';
import { bakeFilterToBlob, filterCss } from '@/lib/utils/filter-css';
import type { FilterType } from '@/types';

interface CameraProps {
  facing?: 'user' | 'environment';
  disabled?: boolean;
  filter?: FilterType;
  photoId?: string;
  takenAt?: string;
  onCapture?: (data: { blob: Blob; width: number; height: number }) => void;
}

// Browser MediaTrack types don't include torch/zoom yet — use a lax shape.
type TrackCapabilitiesExt = MediaTrackCapabilities & {
  torch?: boolean;
  zoom?: { min: number; max: number; step: number };
};

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 4;
const ZOOM_PRESETS = [0.5, 1, 2] as const;

export default function Camera({
  facing = 'environment',
  disabled = false,
  filter = 'original',
  photoId,
  takenAt,
  onCapture,
}: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedData, setCapturedData] = useState<{ blob: Blob; width: number; height: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  // ---- Zoom / flash state -------------------------------------------------
  const [zoom, setZoom] = useState(1);
  const [zoomRange, setZoomRange] = useState<{ min: number; max: number } | null>(null);
  const [flashOn, setFlashOn] = useState(false);
  const [flashSupported, setFlashSupported] = useState(false);
  // When the hardware supports zoom we apply it via the track; otherwise we
  // fall back to a CSS transform scale on the <video> and a matching crop on
  // capture so the saved photo matches what the user framed.
  const usingNativeZoom = zoomRange !== null;
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);

  const isFrontCamera = facing === 'user';

  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing]);

  const startCamera = async () => {
    try {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: isFrontCamera ? 'user' : 'environment',
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 960, max: 1440 },
          aspectRatio: { ideal: 4 / 3 },
        } as MediaTrackConstraints,
        audio: false,
      };

      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // Reset zoom and flash to defaults whenever we acquire a new stream.
      setZoom(1);
      setFlashOn(false);

      // Probe track capabilities — torch & zoom aren't in the standard type
      // yet but they exist on Chromium-based mobile browsers.
      const track = mediaStream.getVideoTracks()[0];
      if (track && typeof track.getCapabilities === 'function') {
        const caps = track.getCapabilities() as TrackCapabilitiesExt;
        setFlashSupported(caps.torch === true || caps.torch === false);
        if (caps.zoom && caps.zoom.max > caps.zoom.min) {
          setZoomRange({ min: caps.zoom.min, max: caps.zoom.max });
        } else {
          setZoomRange(null);
        }
      } else {
        setFlashSupported(false);
        setZoomRange(null);
      }

      // Front camera tweak (kept from previous version).
      if (isFrontCamera && track) {
        try {
          await track.applyConstraints({
            // @ts-expect-error imageStabilization isn't typed
            advanced: [{ imageStabilization: false }],
          });
        } catch {
          // ignore
        }
      }

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('[Camera] Error:', error);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    setFlashOn(false);
    setZoom(1);
  };

  // ---- Zoom / flash actions -----------------------------------------------

  const applyZoom = useCallback(
    async (value: number) => {
      const clamped = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, value));
      setZoom(clamped);
      if (!stream || !zoomRange) return;
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      const native = Math.max(zoomRange.min, Math.min(zoomRange.max, clamped));
      try {
        await track.applyConstraints({
          // @ts-expect-error zoom isn't in the standard constraint type
          advanced: [{ zoom: native }],
        });
      } catch (e) {
        console.warn('[Camera] native zoom failed', e);
      }
    },
    [stream, zoomRange],
  );

  const toggleFlash = useCallback(async () => {
    if (!stream || !flashSupported) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const next = !flashOn;
    try {
      await track.applyConstraints({
        // @ts-expect-error torch isn't typed
        advanced: [{ torch: next }],
      });
      setFlashOn(next);
    } catch (e) {
      console.warn('[Camera] flash toggle failed', e);
    }
  }, [stream, flashSupported, flashOn]);

  // ---- Pinch gesture ------------------------------------------------------

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchRef.current = {
        startDist: Math.sqrt(dx * dx + dy * dy),
        startZoom: zoom,
      };
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchRef.current) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const ratio = dist / pinchRef.current.startDist;
      void applyZoom(pinchRef.current.startZoom * ratio);
    }
  }

  function handleTouchEnd() {
    pinchRef.current = null;
  }

  // ---- Capture -----------------------------------------------------------

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current || disabled || isProcessing) return;

    setIsProcessing(true);

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      const width = video.videoWidth;
      const height = video.videoHeight;
      canvas.width = width;
      canvas.height = height;

      // When we use CSS-scaled zoom (native isn't available), the saved image
      // would otherwise not be zoomed at all. Crop a center rect proportional
      // to the zoom factor so the photo matches the live preview.
      if (!usingNativeZoom && zoom > 1) {
        const sw = width / zoom;
        const sh = height / zoom;
        const sx = (width - sw) / 2;
        const sy = (height - sh) / 2;
        context.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
      } else {
        context.drawImage(video, 0, 0, width, height);
      }

      const originalBlob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create blob'));
        }, 'image/jpeg', 0.95);
      });

      const originalUrl = URL.createObjectURL(originalBlob);
      const previewBlob = await bakeFilterToBlob(
        originalUrl,
        filter,
        photoId,
        takenAt,
        0.95,
      );
      URL.revokeObjectURL(originalUrl);

      const previewUrl = URL.createObjectURL(previewBlob);
      setCapturedImage(previewUrl);
      setCapturedData({ blob: originalBlob, width, height });
    } catch (error) {
      console.error('[Camera] Error al capturar:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmPhoto = () => {
    if (capturedData && onCapture) {
      onCapture(capturedData);
    }
    if (capturedImage) URL.revokeObjectURL(capturedImage);
    setCapturedImage(null);
    setCapturedData(null);
  };

  const retakePhoto = () => {
    if (capturedImage) URL.revokeObjectURL(capturedImage);
    setCapturedImage(null);
    setCapturedData(null);
  };

  // CSS scale to apply to the video element when native zoom isn't available
  // (or for sub-1× zoom, which most hardware can't do). For values <1 we keep
  // it at 1 because shrinking the video looks broken — we just snap back.
  const cssScale = usingNativeZoom ? 1 : zoom < 1 ? 1 : zoom;
  const videoTransform = [
    isFrontCamera ? 'scaleX(-1)' : '',
    cssScale !== 1 ? `scale(${cssScale})` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <>
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="absolute inset-0 h-full w-full object-cover"
        style={{
          transform: videoTransform || undefined,
          display: capturedImage ? 'none' : 'block',
          filter: filterCss(filter, photoId),
        }}
      />

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Flash button — bottom-left, paired with the shutter so it doesn't
          collide with the page-level top-right stack (QR / flip camera). */}
      {!capturedImage && flashSupported && (
        <button
          onClick={toggleFlash}
          aria-label={flashOn ? 'Apagar flash' : 'Encender flash'}
          className={`absolute left-5 z-20 grid h-11 w-11 place-items-center rounded-full backdrop-blur-lg transition active:scale-90 ${
            flashOn ? 'bg-white text-black' : 'bg-black/40 text-white'
          }`}
          style={{ bottom: 'max(env(safe-area-inset-bottom, 0px) + 40px, 40px)' }}
        >
          <FlashIcon active={flashOn} />
        </button>
      )}

      {/* Zoom preset pills — just above the shutter */}
      {!capturedImage && (
        <div
          className="absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/40 p-1 backdrop-blur-lg"
          style={{ bottom: 'max(env(safe-area-inset-bottom, 0px) + 105px, 105px)' }}
        >
          {ZOOM_PRESETS.map((preset) => {
            const isActive = Math.abs(zoom - preset) < 0.05;
            return (
              <button
                key={preset}
                onClick={() => void applyZoom(preset)}
                className={`grid h-9 w-9 place-items-center rounded-full text-xs font-semibold transition ${
                  isActive ? 'bg-white text-black' : 'text-white/80'
                }`}
              >
                {preset === 1 ? '1×' : preset < 1 ? `.${String(preset).split('.')[1]}` : `${preset}×`}
              </button>
            );
          })}
        </div>
      )}

      {capturedImage && (
        <div className="absolute inset-0 z-30 bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={capturedImage}
            alt="Preview"
            className="h-full w-full object-cover"
            style={{ transform: isFrontCamera ? 'scaleX(-1)' : 'none' }}
          />

          <div
            className="absolute inset-x-0 flex justify-center gap-4"
            style={{ bottom: 'max(env(safe-area-inset-bottom, 0px) + 30px, 30px)' }}
          >
            <button
              onClick={retakePhoto}
              className="flex h-14 items-center gap-2 rounded-full bg-white/20 px-6 text-white backdrop-blur-lg transition active:scale-95"
            >
              <span className="text-2xl">↻</span>
              <span className="font-medium">Tomar otra</span>
            </button>

            <button
              onClick={confirmPhoto}
              className="flex h-14 items-center gap-2 rounded-full bg-white px-6 text-black transition active:scale-95"
            >
              <span className="text-2xl">✓</span>
              <span className="font-medium">Usar esta foto</span>
            </button>
          </div>
        </div>
      )}

      {!capturedImage && (
        <button
          onClick={capturePhoto}
          disabled={disabled || isProcessing}
          aria-label="Tomar foto"
          className="absolute left-1/2 z-20 h-[70px] w-[70px] -translate-x-1/2 rounded-full border-4 border-white bg-white shadow-lg shadow-black/40 transition-all duration-150 active:scale-90 active:border-[6px] disabled:opacity-50"
          style={{ bottom: 'max(env(safe-area-inset-bottom, 0px) + 30px, 30px)' }}
        >
          {isProcessing && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-black border-t-transparent" />
            </div>
          )}
        </button>
      )}
    </>
  );
}

function FlashIcon({ active }: { active: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill={active ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}
