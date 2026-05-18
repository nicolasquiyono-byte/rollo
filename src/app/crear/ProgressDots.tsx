'use client';

interface Props {
  total: number;
  current: number;
  maxReached: number;
  onJump: (step: number) => void;
}

export function ProgressDots({ total, current, maxReached, onJump }: Props) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => {
        const stepNum = i + 1;
        const isCurrent = stepNum === current;
        const reachable = stepNum <= maxReached;
        return (
          <button
            key={i}
            onClick={() => reachable && onJump(stepNum)}
            disabled={!reachable}
            aria-label={`Paso ${stepNum}`}
            className={`h-1.5 rounded-full transition-all ${
              isCurrent
                ? 'w-8 bg-white'
                : reachable
                  ? 'w-1.5 bg-white/60 hover:bg-white/80'
                  : 'w-1.5 bg-white/20'
            }`}
          />
        );
      })}
    </div>
  );
}
