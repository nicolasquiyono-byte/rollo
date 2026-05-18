'use client';

import { useMemo } from 'react';

interface Props {
  endsAt: string; // ISO
  onChange: (iso: string) => void;
}

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function isoToLocalInput(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputToIso(local: string): string {
  return new Date(local).toISOString();
}

function nowLocalInput(): string {
  return isoToLocalInput(new Date().toISOString());
}

function humanReadable(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function Step3Date({ endsAt, onChange }: Props) {
  const localValue = useMemo(() => isoToLocalInput(endsAt), [endsAt]);
  const minValue = useMemo(() => nowLocalInput(), []);
  const isValid = new Date(endsAt).getTime() > Date.now();

  return (
    <div className="flex flex-col items-center text-center animate-fade-in">
      <h1 className="font-display text-3xl leading-tight md:text-4xl">
        ¿Cuándo termina tu evento?
      </h1>
      <p className="mt-3 max-w-md text-sm text-white/60">
        El rollo abre ahora; los invitados podrán tomar fotos hasta el cierre.
      </p>

      <div className="mt-10 w-full max-w-md">
        <input
          type="datetime-local"
          value={localValue}
          min={minValue}
          onChange={(e) => {
            if (!e.target.value) return;
            onChange(localInputToIso(e.target.value));
          }}
          className="w-full rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-center text-lg outline-none transition focus:border-white/40 [color-scheme:dark]"
        />

        <p
          className={`mt-4 font-display text-xl ${isValid ? 'text-white' : 'text-rollo-accent'}`}
        >
          {humanReadable(endsAt)}
        </p>
        {!isValid && (
          <p className="mt-1 text-xs text-rollo-accent">
            La fecha debe ser en el futuro.
          </p>
        )}
      </div>

      <div className="mt-6 flex gap-2 text-xs text-white/60">
        {[2, 6, 12, 24, 48].map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => onChange(new Date(Date.now() + h * 3600 * 1000).toISOString())}
            className="rounded-full border border-white/15 px-3 py-1.5 hover:border-white/40 hover:text-white"
          >
            +{h}h
          </button>
        ))}
      </div>
    </div>
  );
}
