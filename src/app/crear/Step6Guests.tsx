'use client';

import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { User, Film, Infinity as InfinityIcon } from 'lucide-react';

interface Props {
  maxGuests: number;
  shotLimit: number;
  photosVisibleToAll: boolean;
  onChange: (patch: Partial<{ maxGuests: number; shotLimit: number; photosVisibleToAll: boolean }>) => void;
}

// Single-select tiers. 0 is the in-app sentinel for "ilimitados" (the DB
// column max_guests is `int not null default 5` — no schema change needed).
const GUEST_TIERS = [5, 10, 25, 50, 100, 150, 200, 0];
const SHOT_OPTIONS = [5, 10, 16, 24, 36];

const EASE_IN_OUT_CUBIC = [0.25, 0.1, 0.25, 1] as const;
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;

function guestLabel(value: number): string {
  return value === 0 ? '∞' : String(value);
}

export function Step6Guests({ maxGuests, shotLimit, photosVisibleToAll, onChange }: Props) {
  const filmRollControls = useAnimation();

  function selectShots(n: number) {
    if (n === shotLimit) return;
    filmRollControls.start({ x: [0, -2, 2, -1, 0], transition: { duration: 0.2 } });
    onChange({ shotLimit: n });
  }

  return (
    <div className="flex flex-col text-center animate-fade-in">
      <h1 className="font-display text-3xl leading-tight md:text-4xl">
        ¿Cuántos invitados?
      </h1>
      <p className="mt-3 max-w-md mx-auto text-sm text-white/60">
        Asegúrate de que todos tengan oportunidad de capturar su foto favorita.
      </p>

      {/* SECTION 1: Guest tier */}
      <section className="mt-10">
        <p className="text-xs uppercase tracking-wider text-white/40">Hasta</p>
        <div className="mt-2 flex items-baseline justify-center gap-3">
          <div className="relative flex h-14 min-w-[3ch] items-baseline justify-center overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.span
                key={maxGuests}
                initial={{ y: 30, opacity: 0, scale: 0.8 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -30, opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.4, ease: EASE_IN_OUT_CUBIC }}
                className="font-display text-5xl tracking-tight leading-none"
              >
                {guestLabel(maxGuests)}
              </motion.span>
            </AnimatePresence>
          </div>
          <span className="text-lg text-white/70">invitados</span>
        </div>

        <div className="mt-6 flex justify-center gap-2">
          {GUEST_TIERS.map((tier) => {
            const isSelected = maxGuests === tier;
            return (
              <motion.button
                key={tier}
                type="button"
                onClick={() => onChange({ maxGuests: tier })}
                whileTap={{ scale: 0.92 }}
                animate={{
                  scale: isSelected ? 1 : 0.95,
                  borderColor: isSelected ? '#60A5FA' : '#4B5563',
                  backgroundColor: isSelected ? 'rgba(96,165,250,0.12)' : 'rgba(0,0,0,0)',
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 30, mass: 0.8 }}
                className="grid h-14 w-14 place-items-center rounded-full border-2"
                aria-label={tier === 0 ? 'Invitados ilimitados' : `Hasta ${tier} invitados`}
              >
                <motion.span
                  animate={{
                    scale: isSelected ? 1 : 0.6,
                    opacity: isSelected ? 1 : 0,
                  }}
                  transition={{ type: 'spring', stiffness: 400, damping: 22 }}
                  className="flex items-center justify-center text-white"
                >
                  {tier === 0 ? <InfinityIcon size={22} /> : <User size={20} />}
                </motion.span>
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* SECTION 2: Shot limit */}
      <section className="mt-10 mx-auto w-full max-w-md">
        <p className="text-left text-xs uppercase tracking-wider text-white/40">
          Disparos por persona
        </p>

        <motion.div
          animate={filmRollControls}
          className="mt-3 flex h-[100px] items-center justify-between rounded-[32px] bg-[#1F2937] px-6"
        >
          <Film size={22} className="text-white/60" />
          <div className="relative flex h-14 min-w-[4ch] items-center justify-center overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.span
                key={shotLimit}
                initial={{ y: 25, opacity: 0, filter: 'blur(4px)' }}
                animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }}
                exit={{ y: -25, opacity: 0, filter: 'blur(4px)' }}
                transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
                className="font-display text-5xl tracking-tight leading-none text-white"
              >
                {shotLimit}
              </motion.span>
            </AnimatePresence>
          </div>
          {/* Decorative-only — not a button, no interaction. */}
          <span
            aria-hidden
            className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-lg shadow-black/30"
          >
            <span className="h-2 w-2 rounded-full bg-black" />
          </span>
        </motion.div>

        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {SHOT_OPTIONS.map((n) => {
            const active = n === shotLimit;
            return (
              <motion.button
                key={n}
                type="button"
                onClick={() => selectShots(n)}
                whileTap={{ scale: 0.95 }}
                animate={{
                  borderColor: active ? '#60A5FA' : 'rgba(0,0,0,0)',
                  backgroundColor: active ? 'rgba(0,0,0,0)' : '#1F2937',
                  scale: active ? 1.04 : 1,
                }}
                transition={{ duration: 0.2 }}
                className="rounded-[20px] border-2 px-6 py-3 text-base text-white/85"
              >
                {n}
              </motion.button>
            );
          })}
        </div>
      </section>

      {/* SECTION 3: Visibility */}
      <section className="mt-10 mx-auto w-full max-w-md">
        <p className="text-left text-xs uppercase tracking-wider text-white/40">
          Permisos de visibilidad
        </p>
        <div
          className="mt-3 flex items-center justify-between rounded-3xl p-6"
          style={{ background: '#2D3748' }}
        >
          <span className="text-sm text-white/90">Todos pueden ver todas las fotos</span>
          <IosSwitch
            checked={photosVisibleToAll}
            onChange={(v) => onChange({ photosVisibleToAll: v })}
          />
        </div>
        {!photosVisibleToAll && (
          <p className="mt-2 text-left text-[11px] text-white/40">
            (Próximamente: cada invitado solo verá sus propias fotos.)
          </p>
        )}
      </section>
    </div>
  );
}

function IosSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative flex h-8 w-14 items-center rounded-full p-1"
      style={{ justifyContent: checked ? 'flex-end' : 'flex-start' }}
      animate={{ backgroundColor: checked ? '#60A5FA' : '#4B5563' }}
      transition={{ duration: 0.3 }}
    >
      <motion.span
        layout
        className="h-6 w-6 rounded-full bg-white shadow"
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </motion.button>
  );
}
