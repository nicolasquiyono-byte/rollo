'use client';

import { useEffect, useRef } from 'react';

interface Props {
  onResult: (text: string) => void;
  onError?: (err: unknown) => void;
}

export function QRScanner({ onResult, onError }: Props) {
  const containerId = 'rollo-qr-scanner';
  const startedRef = useRef(false);

  useEffect(() => {
    let scanner: { stop: () => Promise<void>; clear: () => void } | null = null;
    let cancelled = false;

    (async () => {
      if (startedRef.current) return;
      startedRef.current = true;
      const { Html5Qrcode } = await import('html5-qrcode');
      if (cancelled) return;
      const instance = new Html5Qrcode(containerId);
      scanner = instance as unknown as { stop: () => Promise<void>; clear: () => void };
      try {
        await instance.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 240 },
          (decoded) => onResult(decoded),
          () => undefined,
        );
      } catch (err) {
        onError?.(err);
      }
    })();

    return () => {
      cancelled = true;
      scanner?.stop().catch(() => undefined).finally(() => scanner?.clear());
    };
  }, [onResult, onError]);

  return <div id={containerId} className="w-full overflow-hidden rounded-xl bg-black" />;
}
