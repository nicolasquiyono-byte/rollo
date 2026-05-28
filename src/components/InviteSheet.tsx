'use client';

import { useEffect, useState } from 'react';
import { Download, Link2 } from 'lucide-react';
import { BottomSheet } from '@/components/BottomSheet';
import { qrDataUrl } from '@/lib/utils/qr';

interface Props {
  open: boolean;
  onClose: () => void;
  code: string;
  name: string;
}

export function InviteSheet({ open, onClose, code, name }: Props) {
  const [shareUrl, setShareUrl] = useState('');
  const [qrUrl, setQrUrl] = useState<string | null>(null);

  // Build the join URL on the client (avoids SSR mismatch on window.origin).
  useEffect(() => {
    if (typeof window !== 'undefined') {
      setShareUrl(`${window.location.origin}/unirse?code=${code}`);
    }
  }, [code]);

  // Generate the QR data URL whenever the share URL changes.
  useEffect(() => {
    if (!shareUrl) return;
    let cancelled = false;
    qrDataUrl(shareUrl).then((url) => {
      if (!cancelled) setQrUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [shareUrl]);

  async function handleShareLink() {
    if (!shareUrl) return;
    const text = `Mira las fotos del rollo "${name}": ${shareUrl}`;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title: name, text, url: shareUrl });
        return;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    // Fallback: copy to clipboard.
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // ignore
    }
  }

  function handleSaveQr() {
    if (!qrUrl) return;
    const a = document.createElement('a');
    a.href = qrUrl;
    a.download = `rollo-${code}-qr.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="px-6 pt-2 pb-4">
        <h2 className="font-display text-3xl leading-tight">
          Invita a tus invitados
        </h2>
        <p className="mt-3 text-sm text-white/60">
          Échale un vistazo a tu mundo a través de su lente. Invita a tus
          invitados para hacer este rollo inolvidable.
        </p>

        <div className="my-7 h-px bg-white/10" />

        <div className="flex justify-center">
          {qrUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrUrl}
              alt={`QR del rollo ${code}`}
              className="h-64 w-64 rounded-3xl bg-white p-4"
            />
          ) : (
            <div className="h-64 w-64 animate-pulse rounded-3xl bg-white/10" />
          )}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={handleShareLink}
            className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-sm font-medium text-white transition active:scale-95"
          >
            <Link2 size={16} />
            Compartir enlace
          </button>
          <button
            onClick={handleSaveQr}
            disabled={!qrUrl}
            className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 py-3 text-sm font-medium text-white transition active:scale-95 disabled:opacity-40"
          >
            <Download size={16} />
            Guardar QR
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
