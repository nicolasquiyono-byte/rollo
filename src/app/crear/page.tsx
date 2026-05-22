'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { generateEventCode } from '@/lib/utils/qr';
import { getGuestName, setGuestName } from '@/lib/utils/device';
import { ProgressDots } from './ProgressDots';
import { Step1Name } from './Step1Name';
import { Step2Cover } from './Step2Cover';
import { Step3Date } from './Step3Date';
import { Step4Reveal } from './Step4Reveal';
import { Step5Filter } from './Step5Filter';
import { Step6Guests } from './Step6Guests';
import type { FilterType, RevealType } from '@/types';

interface FormData {
  name: string;
  coverImageUrl: string | null;
  endsAt: string; // ISO
  revealType: RevealType;
  filter: FilterType;
  maxGuests: number;
  shotLimit: number;
  photosVisibleToAll: boolean;
}

const TOTAL_STEPS = 6;
const DOT_COUNT = 7; // 6 editable steps + loading (decorative dot 7)

function defaultEndsAt(): string {
  return new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
}

export default function CrearWizard() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [maxReached, setMaxReached] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hostName, setHostName] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    coverImageUrl: null,
    endsAt: defaultEndsAt(),
    revealType: 'delayed',
    filter: 'vintage',
    maxGuests: 5,
    shotLimit: 24,
    photosVisibleToAll: true,
  });

  useEffect(() => {
    setHostName(getGuestName());
  }, []);

  const isStepValid = (s: number): boolean => {
    switch (s) {
      case 1: // name
        return formData.name.trim().length > 0;
      case 2: // date
        return new Date(formData.endsAt).getTime() > Date.now();
      case 3: // reveal
      case 4: // filter
      case 5: // cover (optional, gradient default)
      case 6: // guests
        return true;
      default:
        return false;
    }
  };

  function patch<K extends keyof FormData>(key: K, value: FormData[K]) {
    setFormData((prev) => ({ ...prev, [key]: value }));
  }

  function next() {
    if (!isStepValid(step)) return;
    if (step === TOTAL_STEPS) {
      void submit();
      return;
    }
    const nextStep = step + 1;
    setStep(nextStep);
    setMaxReached((m) => Math.max(m, nextStep));
  }

  function back() {
    if (step === 1) {
      router.back();
      return;
    }
    setStep((s) => s - 1);
  }

  function jump(target: number) {
    if (target <= maxReached) setStep(target);
  }

  async function submit() {
    setSubmitting(true);
    setError(null);
    const submitStart = Date.now();
    try {
      const code = generateEventCode();
      const closesAtIso = formData.endsAt;
      const revealsAtIso =
        formData.revealType === 'delayed'
          ? new Date(new Date(closesAtIso).getTime() + 5 * 60 * 1000).toISOString()
          : null;

      // If a host name is in localStorage we preserve it. Otherwise fall back to the first word of the event name.
      const resolvedHost = hostName || formData.name.split(' ')[0] || null;
      if (resolvedHost && !hostName) setGuestName(resolvedHost);

      const { data: created, error: rpcErr } = await supabase.rpc('create_rollo', {
        p_code: code,
        p_name: formData.name.trim(),
        p_host_name: resolvedHost,
        p_shot_limit: formData.shotLimit,
        p_reveal_type: formData.revealType,
        p_closes_at: closesAtIso,
        p_reveals_at: revealsAtIso,
        p_cover_image_url: formData.coverImageUrl,
        p_filter: formData.filter,
        p_max_guests: formData.maxGuests,
        p_photos_visible_to_all: formData.photosVisibleToAll,
      });

      if (rpcErr) throw rpcErr;
      const result = created as { code: string; admin_token: string } | null;
      if (!result?.admin_token) throw new Error('create_rollo no devolvió admin_token');

      // Hold the loading screen for at least 1s so it doesn't flash.
      const elapsed = Date.now() - submitStart;
      if (elapsed < 1000) await new Promise((r) => setTimeout(r, 1000 - elapsed));

      router.push(`/rollo/${result.code}/admin?key=${result.admin_token}`);
    } catch (err) {
      // Supabase PostgrestError is a plain object (not an Error instance), so
      // surface its message/code/details/hint explicitly instead of falling
      // through to the generic "no pudimos crear" string that hides the cause.
      console.error('[crear] submit failed', err);
      let msg = 'No pudimos crear el rollo. Intenta de nuevo.';
      if (err && typeof err === 'object') {
        const e = err as { message?: string; code?: string; details?: string; hint?: string };
        if (e.message) {
          msg = e.code ? `${e.code}: ${e.message}` : e.message;
          if (e.hint) msg += ` (${e.hint})`;
        }
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setError(msg);
      setSubmitting(false);
    }
  }

  if (submitting) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-rollo-bg text-white">
        <div className="flex flex-col items-center gap-4 animate-fade-in">
          <Loader2 size={32} className="animate-spin text-white/80" />
          <p className="font-display text-xl">Preparando tu rollo…</p>
        </div>
      </main>
    );
  }

  const valid = isStepValid(step);

  return (
    <main
      className="flex min-h-dvh flex-col bg-rollo-bg text-white"
      style={{
        paddingTop: 'max(env(safe-area-inset-top), 16px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
        paddingLeft: 'env(safe-area-inset-left)',
        paddingRight: 'env(safe-area-inset-right)',
      }}
    >
      <header className="flex items-center justify-between px-5 py-2">
        <button
          onClick={back}
          aria-label="Atrás"
          className="grid h-10 w-10 place-items-center rounded-full text-white/70 transition hover:bg-white/5 hover:text-white"
        >
          <ArrowLeft size={20} />
        </button>
        <span className="text-xs uppercase tracking-[0.2em] text-white/40">
          Paso {step} / {TOTAL_STEPS}
        </span>
        {step === 5 ? (
          <button
            onClick={() => {
              patch('coverImageUrl', null);
              next();
            }}
            className="text-sm text-white/60 transition hover:text-white"
          >
            Saltar
          </button>
        ) : (
          <span className="w-10" aria-hidden />
        )}
      </header>

      <section
        key={step}
        className="flex flex-1 items-center justify-center px-5 py-8 animate-fade-in"
      >
        <div className="w-full max-w-xl">
          {/* New order: 1 name → 2 date → 3 reveal → 4 filter → 5 cover → 6 guests.
              Filenames keep their old numbering for now; the component bound to each
              `step ===` case is what matters. */}
          {step === 1 && (
            <Step1Name
              name={formData.name}
              hostName={hostName}
              onChange={(v) => patch('name', v)}
            />
          )}
          {step === 2 && (
            <Step3Date endsAt={formData.endsAt} onChange={(v) => patch('endsAt', v)} />
          )}
          {step === 3 && (
            <Step4Reveal
              revealType={formData.revealType}
              endsAt={formData.endsAt}
              onChange={(v) => patch('revealType', v)}
            />
          )}
          {step === 4 && (
            <Step5Filter
              filter={formData.filter}
              onChange={(v) => patch('filter', v)}
            />
          )}
          {step === 5 && (
            <Step2Cover
              eventName={formData.name}
              hostName={hostName}
              coverImageUrl={formData.coverImageUrl}
              onChange={(v) => patch('coverImageUrl', v)}
            />
          )}
          {step === 6 && (
            <Step6Guests
              maxGuests={formData.maxGuests}
              shotLimit={formData.shotLimit}
              photosVisibleToAll={formData.photosVisibleToAll}
              onChange={(updates) => setFormData((prev) => ({ ...prev, ...updates }))}
            />
          )}
        </div>
      </section>

      {error && (
        <p className="px-5 pb-3 text-center text-sm text-rollo-accent animate-fade-in">{error}</p>
      )}

      <footer className="flex items-center justify-between gap-4 px-5 pt-2">
        <ProgressDots
          total={DOT_COUNT}
          current={step}
          maxReached={maxReached}
          onJump={jump}
        />
        <button
          onClick={next}
          disabled={!valid}
          className="rounded-full bg-white px-7 py-3 text-sm font-medium text-black transition active:scale-95 disabled:opacity-40"
        >
          {step === TOTAL_STEPS ? 'Crear rollo' : 'Siguiente'}
        </button>
      </footer>
    </main>
  );
}
