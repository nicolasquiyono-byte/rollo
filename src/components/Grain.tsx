import type { FilterType } from '@/types';

// LUMINANCE GRAIN — monochrome fractal noise, all surfaces with film filters.
// Encoded inline so it ships with the bundle (no extra HTTP request).
const NOISE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'>
  <filter id='n'>
    <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch' seed='3'/>
    <feColorMatrix type='saturate' values='0'/>
  </filter>
  <rect width='100%' height='100%' filter='url(#n)' opacity='0.85'/>
</svg>`;
const NOISE_BG = `url("data:image/svg+xml;utf8,${encodeURIComponent(NOISE_SVG)}")`;

// CHROMA NOISE — colored fractal noise emulating CCD sensor chroma noise from
// early-2000s compact cameras. Red and blue channels boosted, green suppressed
// (matches the typical magenta/cyan speckle pattern of cheap CCD sensors in low
// light). Higher baseFrequency than luminance grain for a finer pattern.
const CHROMA_NOISE_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>
  <filter id='c'>
    <feTurbulence type='fractalNoise' baseFrequency='1.4' numOctaves='2' stitchTiles='stitch' seed='5'/>
    <feColorMatrix values='1.3 0 0 0 0  0 0.4 0 0 0  0 0 1.3 0 0  0 0 0 1 0'/>
  </filter>
  <rect width='100%' height='100%' filter='url(#c)' opacity='0.8'/>
</svg>`;
const CHROMA_NOISE_BG = `url("data:image/svg+xml;utf8,${encodeURIComponent(CHROMA_NOISE_SVG)}")`;

// Filters that get the luminance grain overlay.
const FILTERS_WITH_GRAIN: FilterType[] = ['special', 'retro', 'vintage'];
// Filters that additionally get colored sensor noise (chroma grain).
// Vintage added at lower intensity than retro for a subtle CCD feel.
const FILTERS_WITH_CHROMA_NOISE: FilterType[] = ['retro', 'vintage'];
// Filters that get a subtle vignette overlay on top.
const FILTERS_WITH_VIGNETTE: FilterType[] = ['retro'];

interface Props {
  filter: FilterType | null | undefined;
  /**
   * Noise opacity. Defaults to 0.55 — visible film grain without dominating
   * the underlying image. Lower for subtler grain (e.g. 0.45 in small thumbs).
   */
  opacity?: number;
}

/**
 * Film texture overlay: monochrome grain + (for some filters) a subtle vignette.
 * Returns null for filters that don't need any overlay, so this can be dropped
 * into any surface unconditionally.
 *
 * NOTE on naming: kept as `Grain` for backward-compat with existing imports, but
 * it now also renders the vignette for filters in FILTERS_WITH_VIGNETTE.
 */
export function Grain({ filter, opacity = 0.55 }: Props) {
  const needsGrain = filter ? FILTERS_WITH_GRAIN.includes(filter) : false;
  const needsChromaNoise = filter ? FILTERS_WITH_CHROMA_NOISE.includes(filter) : false;
  const needsVignette = filter ? FILTERS_WITH_VIGNETTE.includes(filter) : false;

  if (!needsGrain && !needsChromaNoise && !needsVignette) return null;

  // Per-filter grain intensity:
  //   retro   → +55% (heavy cinematic film grain — chunkier than digital)
  //   vintage → +10% (visible film texture across the image)
  //   special → as-passed (caller decides)
  const grainOpacity =
    filter === 'retro' ? Math.min(opacity * 1.55, 1)
    : filter === 'vintage' ? Math.min(opacity * 1.4, 1)
    : opacity;

  return (
    <>
      {needsGrain && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: NOISE_BG,
            backgroundSize: '200px 200px',
            backgroundRepeat: 'repeat',
            mixBlendMode: 'overlay',
            opacity: grainOpacity,
          }}
        />
      )}
      {needsChromaNoise && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: CHROMA_NOISE_BG,
            // Smaller tile = finer chroma pattern (typical CCD noise grain size).
            backgroundSize: '120px 120px',
            backgroundRepeat: 'repeat',
            // `screen` lifts dark areas — chroma noise is most visible in shadows
            // on real CCDs. Low opacity so it's a tint, not a wash.
            // Per-filter: retro is the "loud" preset; vintage gets a softer dose
            // to stay clean enough that grading still reads.
            mixBlendMode: 'screen',
            opacity: filter === 'retro' ? 0.18 : 0.14,
          }}
        />
      )}
      {needsVignette && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            // Cinematic-tight vignette: center stays clean to ~40%, then
            // ramps into a darker corner (alpha 0.75) for more film/movie
            // feel without crushing the subject.
            background:
              'radial-gradient(ellipse at center, transparent 40%, rgba(15,10,25,0.75) 100%)',
            mixBlendMode: 'multiply',
          }}
        />
      )}
    </>
  );
}
