'use client';

import { useEffect, useMemo, useRef } from 'react';

interface Props {
  name: string;
  hostName: string | null;
  onChange: (next: string) => void;
}

export function Step1Name({ name, hostName, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const suggestions = useMemo(() => {
    const generic = ['Nuestro aniversario', 'Nuestra pequeña fiesta'];
    if (!hostName) return generic;
    return [
      `Fiesta de ${hostName}`,
      `Cumpleaños de ${hostName}`,
      `Boda de ${hostName}`,
      ...generic,
    ];
  }, [hostName]);

  return (
    <div className="flex flex-col items-center text-center animate-fade-in">
      <h1 className="font-display text-3xl leading-tight md:text-4xl">
        ¿Cómo se llama tu evento?
      </h1>
      <p className="mt-3 max-w-md text-sm text-white/60">
        Elige el título perfecto para tu rollo. Será visible para todos los invitados.
      </p>

      <div className="mt-10 w-full max-w-md">
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Nombre del evento"
          className="w-full border-b border-white/20 bg-transparent pb-3 text-center text-2xl outline-none transition focus:border-white"
        />
      </div>

      <div className="mt-8 flex w-full max-w-md flex-col items-center gap-2">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className="rounded-full border border-white/15 px-5 py-2 text-sm text-white/70 transition hover:border-white/40 hover:text-white"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
