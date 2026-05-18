'use client';

import { useEffect, useState } from 'react';
import { diffParts, formatCountdown } from '@/lib/utils/countdown';
import { es } from '@/lib/i18n/es';

export function Countdown({ target, label }: { target: string; label?: string }) {
  const [parts, setParts] = useState(() => diffParts(target));

  useEffect(() => {
    const id = setInterval(() => setParts(diffParts(target)), 1000);
    return () => clearInterval(id);
  }, [target]);

  return (
    <div className="text-center">
      {label && <p className="text-xs uppercase tracking-wide text-rollo-muted">{label}</p>}
      <p className="font-display text-3xl text-rollo-ink">{formatCountdown(parts, es.countdown)}</p>
    </div>
  );
}
