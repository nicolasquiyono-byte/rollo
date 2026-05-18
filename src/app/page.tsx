import Link from 'next/link';
import { InstallBanner } from '@/components/InstallBanner';
import { es } from '@/lib/i18n/es';

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-10">
      <header className="flex items-center justify-between">
        <span className="font-display text-2xl tracking-wider">{es.brand}</span>
        <span className="text-xs uppercase tracking-widest text-rollo-muted">MX · LATAM</span>
      </header>

      <section className="mt-16">
        <h1 className="font-display text-4xl leading-tight">{es.home.hero}</h1>
        <p className="mt-4 text-rollo-muted">{es.home.sub}</p>

        <div className="mt-10 flex flex-col gap-3">
          <Link
            href="/crear"
            className="rounded-full bg-rollo-accent px-6 py-4 text-center font-semibold text-white"
          >
            {es.home.cta_create}
          </Link>
          <Link
            href="/unirse"
            className="rounded-full border border-rollo-ink/20 px-6 py-4 text-center font-semibold text-rollo-ink"
          >
            {es.home.cta_join}
          </Link>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-xl">{es.home.how_title}</h2>
        <ol className="mt-4 space-y-3 text-rollo-muted">
          {es.home.steps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-rollo-surface text-xs text-rollo-ink">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </section>

      <InstallBanner />
    </main>
  );
}
