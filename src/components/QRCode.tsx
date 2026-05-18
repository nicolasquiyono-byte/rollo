'use client';

import { useEffect, useState } from 'react';
import { qrDataUrl, eventJoinUrl } from '@/lib/utils/qr';

interface Props {
  code: string;
  size?: number;
}

export function QRCodeView({ code, size = 220 }: Props) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    qrDataUrl(eventJoinUrl(code)).then(setSrc);
  }, [code]);

  return (
    <div
      className="flex items-center justify-center rounded-2xl bg-white p-3"
      style={{ width: size, height: size }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`QR ${code}`} className="h-full w-full" />
      ) : (
        <span className="text-rollo-bg text-xs">…</span>
      )}
    </div>
  );
}
