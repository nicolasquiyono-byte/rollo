'use client';

import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { diffParts, formatCountdown } from '@/lib/utils/countdown';
import { es } from '@/lib/i18n/es';

export function LockedBanner({ revealsAt }: { revealsAt: string }) {
  const [text, setText] = useState('');

  useEffect(() => {
    const update = () => {
      const parts = diffParts(revealsAt);
      if (parts.done) {
        setText('cualquier momento');
        return;
      }
      setText(formatCountdown(parts, es.countdown));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [revealsAt]);

  return (
    <div
      className="sticky top-0 z-30 flex w-full items-center justify-center gap-2 bg-[rgba(232,93,4,0.95)] px-4 text-white shadow-lg shadow-black/30 backdrop-blur"
      style={{ height: 80 }}
    >
      <Lock size={18} />
      <span className="text-sm font-medium">
        Las fotos se revelan en <span className="font-display tracking-wide">{text || '…'}</span>
      </span>
    </div>
  );
}
