'use client';

import { Sparkles, Clock } from 'lucide-react';
import type { RevealType } from '@/types';

interface Props {
  revealType: RevealType;
  endsAt: string;
  onChange: (next: RevealType) => void;
}

export function Step4Reveal({ revealType, endsAt, onChange }: Props) {
  const revealDate = new Date(new Date(endsAt).getTime() + 5 * 60 * 1000);
  const revealText = revealDate.toLocaleString('es-MX', {
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <div className="flex flex-col items-center text-center animate-fade-in">
      <h1 className="font-display text-3xl leading-tight md:text-4xl">
        ¿Cuándo revelamos las fotos?
      </h1>

      <div className="mt-10 grid w-full max-w-md gap-3">
        <RevealCard
          active={revealType === 'instant'}
          icon={<Sparkles size={24} />}
          title="Durante el evento"
          description="Revela las fotos en tiempo real mientras se capturan. Ideal para verlas y compartirlas al instante."
          onClick={() => onChange('instant')}
        />
        <RevealCard
          active={revealType === 'delayed'}
          icon={<Clock size={24} />}
          title="Al terminar"
          description={`Las fotos se revelan el ${revealText}. La espera hace el momento más especial.`}
          onClick={() => onChange('delayed')}
        />
      </div>
    </div>
  );
}

function RevealCard({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-start gap-4 rounded-2xl border-2 p-5 text-left transition ${
        active
          ? 'border-white bg-white/5'
          : 'border-white/10 bg-white/[0.03] hover:border-white/30'
      }`}
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
          active ? 'bg-white text-black' : 'bg-white/10 text-white'
        }`}
      >
        {icon}
      </span>
      <span className="flex-1">
        <p className="font-display text-lg">{title}</p>
        <p className="mt-1 text-sm text-white/60">{description}</p>
      </span>
    </button>
  );
}
