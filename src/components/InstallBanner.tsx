'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

// `BeforeInstallPromptEvent` isn't in lib.dom.d.ts (still a draft spec).
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: readonly string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISSED_KEY = 'rollo:install-dismissed';

export function InstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.localStorage.getItem(DISMISSED_KEY)) return;
    // Already installed (running standalone) → no banner.
    if (window.matchMedia?.('(display-mode: standalone)').matches) return;

    function onPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setDeferred(null);
    }
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (!deferred) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    setDeferred(null);
    if (outcome === 'dismissed') window.localStorage.setItem(DISMISSED_KEY, '1');
  }

  function dismiss() {
    window.localStorage.setItem(DISMISSED_KEY, '1');
    setDeferred(null);
  }

  return (
    <div
      className="fixed inset-x-3 z-40 flex items-center gap-3 rounded-2xl bg-[#E85D04] px-4 py-3 text-white shadow-2xl shadow-black/40 animate-fade-in"
      style={{ bottom: 'max(env(safe-area-inset-bottom), 12px)' }}
      role="dialog"
      aria-label="Instalar Rollo"
    >
      <div className="flex-1 text-sm leading-tight">
        <p className="font-medium">Instala Rollo en tu dispositivo</p>
        <p className="text-xs text-white/85">Acceso directo + funciona offline.</p>
      </div>
      <button
        onClick={install}
        className="shrink-0 rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-[#E85D04] transition active:scale-95"
      >
        Instalar
      </button>
      <button
        onClick={dismiss}
        aria-label="Descartar"
        className="shrink-0 rounded-full p-1 text-white/80 transition hover:text-white"
      >
        <X size={16} />
      </button>
    </div>
  );
}
