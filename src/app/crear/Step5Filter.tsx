'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { FILTER_CSS } from '@/lib/utils/filter-css';
import type { FilterType } from '@/types';

interface Props {
  filter: FilterType;
  onChange: (next: FilterType) => void;
}

// Local event photos for the camera-filter carousel. JPG q85 keeps them
// under ~550KB each (~1.4MB total) while preserving the film-grain look.
const SAMPLE_PHOTOS = [
  '/filter-examples/filter-example-1.jpg',
  '/filter-examples/filter-example-2.jpg',
  '/filter-examples/filter-example-3.jpg',
];

const FILTERS: Record<FilterType, { label: string; description: string; css: string }> = {
  original: {
    label: 'Original',
    description: 'Colores fieles a la realidad. Tonos crisp que conservan el momento tal cual fue.',
    css: FILTER_CSS.original,
  },
  vintage: {
    label: 'Vintage',
    description:
      'Perfecto para bodas y celebraciones. Los tonos cálidos hacen los momentos especiales más emotivos.',
    css: FILTER_CSS.vintage,
  },
  bw: {
    label: 'B&N',
    description: 'Atemporal. El blanco y negro pone el foco en los protagonistas.',
    css: FILTER_CSS.bw,
  },
  special: {
    label: 'Special',
    description:
      'Estética diaria estilo Japón/Korea. Flash compacto, sombras suaves y blacks levantados — como un diario íntimo.',
    css: FILTER_CSS.special,
  },
  retro: {
    label: '2010',
    description:
      'Tumblr 2010 / Indie Sleaze. Powershot + flash, crema en luces, sombras blue-purple, vignette y grano.',
    css: FILTER_CSS.retro,
  },
};

const ORDER: FilterType[] = ['original', 'vintage', 'special', 'retro', 'bw'];

export function Step5Filter({ filter, onChange }: Props) {
  const active = FILTERS[filter];
  const [carouselIndex, setCarouselIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setCarouselIndex((i) => (i + 1) % SAMPLE_PHOTOS.length);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  const heroSrc = SAMPLE_PHOTOS[carouselIndex];

  return (
    <div className="flex flex-col items-center text-center animate-fade-in">
      <h1 className="font-display text-3xl leading-tight md:text-4xl">
        ¿Qué cámara quieres usar?
      </h1>
      <p className="mt-3 max-w-md text-sm text-white/60">
        Elige el estilo que más te guste.{' '}
        <span className="italic text-white/40">
          *Las fotos originales se guardan por defecto.
        </span>
      </p>

      <div className="relative mt-8 aspect-[4/5] w-full max-w-xs overflow-hidden rounded-3xl border-2 border-white/10 bg-rollo-surface">
        {/* Cross-fade between carousel images. Filter changes use a CSS transition
            (no remount) so swapping filter doesn't trigger the fade. */}
        <AnimatePresence>
          <motion.img
            key={carouselIndex}
            src={heroSrc}
            alt={`Preview ${active.label}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 h-full w-full object-cover transition-[filter] duration-200"
            style={{ filter: active.css }}
          />
        </AnimatePresence>
        {/* Carousel position dots */}
        <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-1.5">
          {SAMPLE_PHOTOS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === carouselIndex ? 'w-5 bg-white' : 'w-1.5 bg-white/40'
              }`}
            />
          ))}
        </div>
      </div>

      <p className="mt-5 max-w-xs text-xs text-white/60">{active.description}</p>

      <div className="mt-6 flex w-full max-w-md justify-center gap-3">
        {ORDER.map((key) => {
          const opt = FILTERS[key];
          const isActive = key === filter;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onChange(key)}
              className={`flex flex-col items-center gap-2 transition ${
                isActive ? 'opacity-100' : 'opacity-60 hover:opacity-90'
              }`}
            >
              <div
                className={`h-14 w-14 overflow-hidden rounded-xl border-2 ${
                  isActive ? 'border-white' : 'border-white/15'
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={heroSrc}
                  alt=""
                  className="h-full w-full object-cover transition-[filter] duration-200"
                  style={{ filter: opt.css }}
                />
              </div>
              <span className="text-[10px] uppercase tracking-wider">{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
