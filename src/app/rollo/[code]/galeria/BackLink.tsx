'use client';

import { useRouter } from 'next/navigation';

interface Props {
  fallback: string;
  label: string;
}

export function BackLink({ fallback, label }: Props) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) {
          router.back();
        } else {
          router.push(fallback);
        }
      }}
      className="text-xs uppercase tracking-widest text-rollo-muted transition hover:text-rollo-ink"
    >
      ← {label}
    </button>
  );
}
