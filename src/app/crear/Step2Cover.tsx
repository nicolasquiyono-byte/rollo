'use client';

import { useRef, useState } from 'react';
import imageCompression from 'browser-image-compression';
import { Upload, Camera, Sparkles, X, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface Props {
  eventName: string;
  hostName: string | null;
  coverImageUrl: string | null;
  onChange: (next: string | null) => void;
}

// 6 stock options. All verified live as of this commit. If any breaks,
// swap the ID for another from images.unsplash.com.
const STOCK_PHOTOS = [
  { id: 'wedding-elegant', src: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=900&h=1200&q=80', label: 'Boda elegante' },
  { id: 'party-casual', src: 'https://images.unsplash.com/photo-1530023367847-a683933f4172?auto=format&fit=crop&w=900&h=1200&q=80', label: 'Brindis' },
  { id: 'family-celebration', src: 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&h=1200&q=80', label: 'Celebración' },
  { id: 'sunset-romantic', src: 'https://images.unsplash.com/photo-1500485035595-cbe6f645feb1?auto=format&fit=crop&w=900&h=1200&q=80', label: 'Atardecer' },
  { id: 'decoration-lights', src: 'https://images.unsplash.com/photo-1467810563316-b5476525c0f9?auto=format&fit=crop&w=900&h=1200&q=80', label: 'Luces' },
  { id: 'flowers-decoration', src: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=900&h=1200&q=80', label: 'Decoración' },
];

export function Step2Cover({ eventName, hostName, coverImageUrl, onChange }: Props) {
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.7,
        maxWidthOrHeight: 1200,
        useWebWorker: true,
        fileType: 'image/jpeg',
        initialQuality: 0.85,
      });
      const path = `wizard-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.jpg`;
      const { error: upErr } = await supabase.storage
        .from('rollo-covers')
        .upload(path, compressed, { contentType: 'image/jpeg', upsert: false });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from('rollo-covers').getPublicUrl(path);
      onChange(data.publicUrl);
    } catch (err) {
      console.error('[Step2Cover] upload failed', err);
      setError(err instanceof Error ? err.message : 'No pudimos subir la imagen.');
    } finally {
      setUploading(false);
    }
  }

  function clear() {
    onChange(null);
  }

  const isStock = coverImageUrl && STOCK_PHOTOS.some((p) => p.src === coverImageUrl);
  const isUploaded = coverImageUrl && !isStock;
  const isGradient = coverImageUrl === null;

  return (
    <div className="flex flex-col items-center text-center animate-fade-in">
      <h1 className="font-display text-3xl leading-tight md:text-4xl">
        Elige una foto de portada
      </h1>
      <p className="mt-3 max-w-md text-sm text-white/60">
        Esta imagen será el fondo de tu invitación. Tus invitados la verán al unirse al rollo.
      </p>

      {/* Live invitation preview */}
      <div className="mt-8 relative w-full max-w-xs overflow-hidden rounded-3xl border-2 border-white/10">
        {coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={coverImageUrl}
            src={coverImageUrl}
            alt=""
            className="aspect-[3/4] w-full animate-fade-in object-cover"
          />
        ) : (
          <div className="noise-bg aspect-[3/4] w-full" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/30 to-black/85" />
        <div className="absolute inset-x-0 bottom-0 p-5 text-center text-white">
          <p className="font-display text-2xl leading-tight">
            {eventName || 'Tu evento'}
          </p>
          {hostName && (
            <p className="mt-1 text-xs text-white/70">Te invita {hostName}</p>
          )}
        </div>
        {coverImageUrl && (
          <button
            onClick={clear}
            aria-label="Quitar imagen"
            className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur transition active:scale-95"
          >
            <X size={16} />
          </button>
        )}
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wider text-white/30">
        Así se verá tu invitación
      </p>

      {/* Upload / Camera / Gradient row */}
      <div className="mt-6 grid w-full max-w-md grid-cols-3 gap-2">
        <ActionCard
          icon={<Upload size={18} />}
          label="Subir foto"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
        />
        <ActionCard
          icon={<Camera size={18} />}
          label="Tomar foto"
          onClick={() => cameraInputRef.current?.click()}
          disabled={uploading}
        />
        <ActionCard
          icon={<Sparkles size={18} />}
          label="Gradiente"
          active={isGradient}
          onClick={clear}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />

      {uploading && (
        <p className="mt-4 flex items-center justify-center gap-2 text-sm text-white/70">
          <Loader2 size={14} className="animate-spin" />
          Subiendo y comprimiendo…
        </p>
      )}
      {error && <p className="mt-3 text-xs text-rollo-accent">{error}</p>}
      {isUploaded && !uploading && (
        <p className="mt-3 text-xs text-white/40">Foto cargada · puedes reemplazarla cuando quieras</p>
      )}

      {/* Stock gallery */}
      <div className="mt-8 w-full max-w-md">
        <p className="mb-3 text-left text-xs uppercase tracking-wider text-white/40">
          O usa una sugerencia
        </p>
        <div className="grid grid-cols-3 gap-2">
          {STOCK_PHOTOS.map((p) => {
            const selected = coverImageUrl === p.src;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onChange(p.src)}
                className={`relative aspect-square overflow-hidden rounded-xl border-2 transition active:scale-95 ${
                  selected ? 'border-white' : 'border-white/10 hover:border-white/30'
                }`}
                aria-label={p.label}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.src} alt={p.label} className="h-full w-full object-cover" loading="lazy" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ActionCard({
  icon,
  label,
  onClick,
  disabled,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-2 rounded-2xl border px-3 py-4 text-xs transition active:scale-95 disabled:opacity-40 ${
        active
          ? 'border-white bg-white/5 text-white'
          : 'border-white/15 text-white/70 hover:border-white/40 hover:text-white'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
