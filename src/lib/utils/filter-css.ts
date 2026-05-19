import type { FilterType } from '@/types';
import { formatStampDate, ghostifyStamp, splitStamp } from './format-stamp';

// Single source of truth for the photo filters.
//
// Each filter has TWO variants:
//   - `dom`: used in <img style={{filter}}>. Can include SVG url() refs that
//            require <SpecialFilterDefs> to be mounted somewhere in the page
//            (we mount it once in the root layout).
//   - `canvas`: used by `bakeFilterToBlob` for downloads. Pure CSS only —
//               canvas's ctx.filter doesn't reliably resolve url() across
//               browsers, so we use a CSS-only approximation for special.
//
// Photos are stored ORIGINAL; filter is applied at render / export time.

interface FilterDef {
  dom: string;
  canvas: string;
}

// Cool CCD vintage — DOM uses SVG #cool-ccd (color science split tone) and
// #ccd-bloom (halation). Canvas (download) falls back to pure CSS with an
// added cool hue baseline since canvas filter doesn't resolve url() refs.
// Sepia is gone — the cool color shift comes from the SVG colorMatrix.
const VINTAGE_BASE = {
  saturate: 1.35,
  contrast: 1.25,
  brightness: 1.02,
  hueRotateBase: 0,
  blur: 0.6,
};
const VINTAGE_CANVAS_BASE_HUE = 5;

function vintageChainFromValues(
  contrast: number,
  brightness: number,
  hue: number,
  blur: number,
  saturate: number,
  mode: 'dom' | 'canvas',
): string {
  const prefix = mode === 'dom' ? 'url(#cool-ccd) url(#ccd-bloom) ' : '';
  return (
    prefix +
    `saturate(${saturate.toFixed(3)}) contrast(${contrast.toFixed(3)}) ` +
    `brightness(${brightness.toFixed(3)}) hue-rotate(${hue.toFixed(1)}deg) ` +
    `blur(${blur.toFixed(2)}px)`
  );
}

const VINTAGE_DOM = vintageChainFromValues(
  VINTAGE_BASE.contrast, VINTAGE_BASE.brightness, VINTAGE_BASE.hueRotateBase,
  VINTAGE_BASE.blur, VINTAGE_BASE.saturate, 'dom',
);
const VINTAGE_CANVAS = vintageChainFromValues(
  VINTAGE_BASE.contrast, VINTAGE_BASE.brightness, VINTAGE_CANVAS_BASE_HUE,
  VINTAGE_BASE.blur, VINTAGE_BASE.saturate, 'canvas',
);
const BW = 'grayscale(1) contrast(1.1)';
// RETRO: 2010 Tumblr / Indie Sleaze / Canon Powershot. Has two variants:
//   DOM: SVG split tone (magenta highlights + blue-purple crushed shadows)
//        chained with CSS saturate/contrast boost.
//   Canvas: CSS-only approximation (no url() refs work reliably in ctx.filter).
// Higher contrast = harsher, less HDR-ish ("more spontaneous"). 0.3px blur
// softens the modern sharpness, mimicking a 2011 compact-camera lens.
const RETRO_DOM = 'url(#retro-tone) saturate(1.15) contrast(1.2) brightness(1.02) blur(0.3px)';
const RETRO_CANVAS = 'saturate(1.15) contrast(1.2) brightness(1.02) sepia(0.12) hue-rotate(-4deg) blur(0.3px)';

// SPECIAL has two stages because of the SVG split tone:
//   DOM: SVG colorMatrix (split tone — warm cream highlights, cyan-lifted shadows)
//        chained with CSS contrast/saturate/brightness for tonal finishing.
//   Canvas: CSS-only approximation that hits the same ballpark without url().
const SPECIAL_DOM = 'url(#fuji-tone) saturate(0.92) contrast(0.85) brightness(1.04)';
const SPECIAL_CANVAS = 'saturate(0.88) contrast(0.78) brightness(1.05) sepia(0.08) hue-rotate(-3deg)';

const FILTERS: Record<FilterType, FilterDef> = {
  original: { dom: 'none', canvas: 'none' },
  vintage: { dom: VINTAGE_DOM, canvas: VINTAGE_CANVAS },
  bw: { dom: BW, canvas: BW },
  special: { dom: SPECIAL_DOM, canvas: SPECIAL_CANVAS },
  retro: { dom: RETRO_DOM, canvas: RETRO_CANVAS },
};

// ---------- Per-photo variation (Powershot album feel) ----------
// Each vintage photo gets deterministic micro-offsets derived from its id, so
// shots in a roll look slightly different from each other (some warmer, some
// cooler, some softer focus) — like an old digicam with imperfect auto-WB.
// Same photo id always yields the same variation (idempotent across reloads).

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
// Deterministic float in [-1, 1) from a seed and a salt (so we get 4
// uncorrelated values from a single seed).
function seededRand(seed: number, salt: number): number {
  const x = Math.sin(seed * 9001 + salt * 7919) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function vintageVariationFor(photoId: string, mode: 'dom' | 'canvas'): string {
  const seed = hashString(photoId);
  // Per-photo variation around the cool CCD base for digicam authenticity:
  //   hue        ±8°    — WB drift around 0° base (DOM) / 5° base (canvas)
  //   brightness ±0.07  — exposure differences (0.95 to 1.09)
  //   contrast   ±0.09  — some harsher / some flatter (1.16 to 1.34)
  //   saturate   ±0.10  — inconsistent color rendering (1.25 to 1.45)
  //   blur       0..0.6 — focus misses on some shots (0.6 to 1.2 px)
  const baseHue = mode === 'dom' ? VINTAGE_BASE.hueRotateBase : VINTAGE_CANVAS_BASE_HUE;
  const hue = baseHue + seededRand(seed, 1) * 8;
  const bright = VINTAGE_BASE.brightness + seededRand(seed, 2) * 0.07;
  const contrast = VINTAGE_BASE.contrast + seededRand(seed, 3) * 0.09;
  const blur = VINTAGE_BASE.blur + Math.max(0, seededRand(seed, 4)) * 0.6;
  const saturate = VINTAGE_BASE.saturate + seededRand(seed, 5) * 0.10;
  return vintageChainFromValues(contrast, bright, hue, blur, saturate, mode);
}

/**
 * Filter string for `<img style={{filter}}>`. May include SVG url() refs.
 * Pass `photoId` for vintage to enable per-photo white-balance / exposure /
 * focus variation (gives a real-album feel instead of mechanically uniform).
 */
export function filterCss(filter: FilterType | null | undefined, photoId?: string): string {
  if (!filter) return 'none';
  if (filter === 'vintage' && photoId) return vintageVariationFor(photoId, 'dom');
  return FILTERS[filter]?.dom ?? 'none';
}

/** Canvas-safe variant (no SVG url() refs). Same per-photo variation for vintage. */
export function filterCssForCanvas(filter: FilterType | null | undefined, photoId?: string): string {
  if (!filter) return 'none';
  if (filter === 'vintage' && photoId) return vintageVariationFor(photoId, 'canvas');
  return FILTERS[filter]?.canvas ?? 'none';
}

// Kept for callers that imported FILTER_CSS by name (Step5Filter wizard preview).
// Returns the DOM variant (which is what previews need to match the gallery look).
export const FILTER_CSS: Record<FilterType, string> = {
  original: FILTERS.original.dom,
  vintage: FILTERS.vintage.dom,
  bw: FILTERS.bw.dom,
  special: FILTERS.special.dom,
  retro: FILTERS.retro.dom,
};

/**
 * Draws the digicam timestamp into the bottom-right of the canvas. Tries VT323
 * (loaded via next/font) but falls back to system monospace if not available
 * yet — both keep the same color + shadow so the look stays consistent.
 */
function drawTimestampWatermark(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  takenAt: string,
): void {
  const { month, rest } = splitStamp(formatStampDate(takenAt));
  const ghost = ghostifyStamp(rest);
  // Font size scales with image dimensions so a 2000px photo doesn't get a
  // microscopic 16px stamp and a 800px photo doesn't get a giant one.
  const size = Math.max(16, Math.min(canvas.width, canvas.height) * 0.022);
  // Pixel font (VT323) is rendered taller to match DSEG14 x-height visually,
  // same ratio as the DOM <DigitalStamp /> component.
  const monthSize = size * 1.5;
  const padding = size;
  const dsegFont = `700 ${size}px "DSEG14Classic", ui-monospace, "Menlo", monospace`;
  const pixelFont = `400 ${monthSize}px "VT323", ui-monospace, "Menlo", monospace`;
  // Tiny gap between month and rest (matches gap-[0.35em] on the DOM side).
  const gap = size * 0.35;

  ctx.save();
  ctx.filter = 'none';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Measure both pieces so we can left-align them as a unit, right-anchored
  // to the canvas edge (since each font has different metrics, measuring
  // each in its own ctx.font is the only way to keep them tight).
  ctx.font = pixelFont;
  const monthW = ctx.measureText(month).width;
  ctx.font = dsegFont;
  const restW = ctx.measureText(rest).width;
  const totalW = monthW + gap + restW;
  const xMonth = canvas.width - padding - totalW;
  const xRest = xMonth + monthW + gap;
  const y = canvas.height - padding;

  // ---- DSEG14 ghost segments (drawn first so glow passes overlap them)
  ctx.font = dsegFont;
  ctx.shadowColor = 'rgba(255,107,53,0.4)';
  ctx.shadowBlur = Math.max(2, size * 0.12);
  ctx.fillStyle = 'rgba(255,107,53,0.32)';
  ctx.fillText(ghost, xRest, y);

  // ---- DSEG14 lit text (rest): 3 passes — wide bloom, tight glow, dark micro
  ctx.fillStyle = '#FF6B35';
  ctx.shadowColor = 'rgba(255,107,53,0.55)';
  ctx.shadowBlur = Math.max(10, size * 0.65);
  ctx.fillText(rest, xRest, y);
  ctx.shadowColor = 'rgba(255,107,53,0.75)';
  ctx.shadowBlur = Math.max(4, size * 0.28);
  ctx.fillText(rest, xRest, y);
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = Math.max(2, size * 0.1);
  ctx.fillText(rest, xRest, y);

  // ---- VT323 pixel month: same 3-pass glow recipe for visual consistency
  ctx.font = pixelFont;
  ctx.fillStyle = '#FF6B35';
  ctx.shadowColor = 'rgba(255,107,53,0.55)';
  ctx.shadowBlur = Math.max(10, size * 0.65);
  ctx.fillText(month, xMonth, y);
  ctx.shadowColor = 'rgba(255,107,53,0.75)';
  ctx.shadowBlur = Math.max(4, size * 0.28);
  ctx.fillText(month, xMonth, y);
  ctx.shadowColor = 'rgba(0,0,0,0.9)';
  ctx.shadowBlur = Math.max(2, size * 0.1);
  ctx.fillText(month, xMonth, y);

  ctx.restore();
}

/**
 * If a `takenAt` ISO string is provided AND VT323 is loaded, await it so the
 * canvas can use the real LCD font. No-op (and silent) when VT323 isn't
 * available — falls back to monospace cleanly.
 */
async function preloadDigitalFont(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load('bold 20px "DSEG14Classic"'),
      document.fonts.load('400 30px "VT323"'),
    ]);
  } catch {
    // fall through to monospace fallback
  }
}

/**
 * NEW APPROACH: Render SVG filters correctly by using an intermediate DOM element.
 * This applies the ACTUAL SVG filters (not CSS approximations) for downloads.
 */
export async function bakeFilterToBlob(
  signedUrl: string,
  filter: FilterType,
  photoId?: string,
  takenAt?: string,
  quality = 0.92,
): Promise<Blob> {
  if (takenAt) await preloadDigitalFont();
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = async () => {
      try {
        const width = img.naturalWidth;
        const height = img.naturalHeight;
        
        // Create a temporary container for SVG-filtered rendering
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.left = '-9999px';
        container.style.top = '-9999px';
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;
        document.body.appendChild(container);
        
        // Create an img element with the DOM filter applied
        const filteredImg = document.createElement('img');
        filteredImg.src = signedUrl;
        filteredImg.crossOrigin = 'anonymous';
        filteredImg.style.width = '100%';
        filteredImg.style.height = '100%';
        filteredImg.style.objectFit = 'contain';
        
        // Apply the DOM filter (with SVG)
        const domFilter = filterCss(filter, photoId);
        if (domFilter !== 'none') {
          filteredImg.style.filter = domFilter;
        }
        
        container.appendChild(filteredImg);
        
        // Wait for the browser to apply the filter
        await new Promise(r => setTimeout(r, 100));
        
        // Now render to canvas
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: false });
        
        if (!ctx) {
          document.body.removeChild(container);
          reject(new Error('Canvas 2D context unavailable'));
          return;
        }
        
        // Draw the filtered image
        ctx.drawImage(filteredImg, 0, 0, width, height);
        
        // Add timestamp watermark
        if (takenAt) {
          drawTimestampWatermark(ctx, canvas, takenAt);
        }
        
        // Clean up DOM
        document.body.removeChild(container);
        
        // Convert to blob
        canvas.toBlob(
          (blob) => {
            if (blob) resolve(blob);
            else reject(new Error('canvas.toBlob returned null'));
          },
          'image/jpeg',
          quality,
        );
      } catch (err) {
        reject(err);
      }
    };
    
    img.onerror = () => reject(new Error(`Failed to load image: ${signedUrl}`));
    img.src = signedUrl;
  });
}
