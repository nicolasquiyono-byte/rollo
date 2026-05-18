import { es } from '@/lib/i18n/es';

interface Props {
  used: number;
  limit: number;
}

export function ShotCounter({ used, limit }: Props) {
  const left = Math.max(0, limit - used);
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-1">
        {Array.from({ length: limit }).map((_, i) => (
          <span
            key={i}
            className={`h-2 w-2 rounded-full ${i < used ? 'bg-rollo-muted' : 'bg-rollo-accent'}`}
          />
        ))}
      </div>
      <span className="text-sm text-rollo-muted">
        {left > 0 ? es.event.shots_left(left) : es.event.no_shots_left}
      </span>
    </div>
  );
}
