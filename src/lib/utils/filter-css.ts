import type { FilterType } from '../../types';
import { formatStampDate, ghostifyStamp, splitStamp } from '@/lib/utils/format-stamp';
import { applyBloom, applyColorMatrix, applyCssFilterToCanvas } from '@/lib/utils/filter-pixels';

// SVG color matrices — mirrored from SpecialFilterDefs.tsx so the download
// applies the exact same color science as on-screen. Format: 4×5 matrix
// (R G B A 1, repeated for each output channel).
const COOL_CCD_MATRIX = [
  0.95, 0,    0,    0, 0,
  0,    1.0,  0,    0, 0,
  0,    0,    1.05, 0, 0.04,
  0,    0,    0,    1, 0,
];
const RETRO_TONE_MATRIX = [
  1.10, 0,    0,    0, 0.02,
  0,    0.92, 0,    0, 0.02,
  0,    0,    0.78, 0, 0.08,
  0,    0,    0,    1, 0,
];
const FUJI_TONE_MATRIX = [
  1.05, 0,    0,    0, 0.02,
  0,    1.0,  0,    0, 0.015,
  0,    0,    0.75, 0, 0.05,
  0,    0,    0,    1, 0,
];

/**
 * Bake the full filter stack (color matrix + CSS chain + bloom) onto a canvas
 * already containing the source photo. Matches what the SVG filters do for
 * the on-screen render — so the downloaded JPEG matches the gallery.
 */
export function applyDownloadFilter(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  filter: FilterType,
  photoId?: string,
): void {
  // Step 1: SVG color matrix (cool-ccd / retro-tone / fuji-tone).
  if (filter === 'vintage' || filter === 'retro' || filter === 'special') {
    const matrix =
      filter === 'vintage'
        ? COOL_CCD_MATRIX
        : filter === 'retro'
          ? RETRO_TONE_MATRIX
          : FUJI_TONE_MATRIX;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyColorMatrix(imgData.data, matrix);
    ctx.putImageData(imgData, 0, 0);
  }

  // Step 2: CSS chain (saturate / contrast / brightness / hue / sepia / blur).
  // For vintage we now skip the canvas hue-rotate compensation since the real
  // cool-ccd matrix already provides the cool shift in Step 1.
  const css =
    filter === 'vintage' && photoId
      ? vintageVariationFor(photoId, 'dom')
          .replace('url(#cool-ccd) ', '')
          .replace('url(#ccd-bloom) ', '')
      : filter === 'vintage'
        ? VINTAGE_DOM.replace('url(#cool-ccd) ', '').replace('url(#ccd-bloom) ', '')
        : filterCssForCanvas(filter, photoId);
  if (css !== 'none') applyCssFilterToCanvas(ctx, canvas, css);

  // Step 3: CCD bloom (vintage only) — soft halation on highlights.
  if (filter === 'vintage') {
    applyBloom(ctx, canvas, 3, 0.35);
  }
}

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
  saturate: 1.28,
  contrast: 1.18,
  brightness: 1.02,
  hueRotateBase: 0,
  blur: 0.4,
};
const VINTAGE_CANVAS_BASE_HUE = 4;

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

// RETRO: Better CSS approximation of the SVG colorMatrix
// SVG does: R*1.15-0.08, G*0.95-0.07, B*0.9+0.025
// This creates: magenta/pink highlights + crushed blue-purple shadows
// CSS approximation: stronger magenta push + crushed blacks + subtle blue lift
const RETRO_DOM = 'url(#retro-tone) saturate(1.05) contrast(0.95) brightness(1.03) blur(0.3px)';
const RETRO_CANVAS = 'saturate(1.05) contrast(0.95) brightness(1.03) sepia(0.40) hue-rotate(350deg) blur(0.3px)';

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
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function seededRand(seed: number, salt: number): number {
  const x = Math.sin(seed * 9001 + salt * 7919) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function vintageVariationFor(photoId: string, mode: 'dom' | 'canvas'): string {
  const seed = hashString(photoId);
  const baseHue = mode === 'dom' ? VINTAGE_BASE.hueRotateBase : VINTAGE_CANVAS_BASE_HUE;
  const hue = baseHue + seededRand(seed, 1) * 5;
  const bright = VINTAGE_BASE.brightness + seededRand(seed, 2) * 0.05;
  const contrast = VINTAGE_BASE.contrast + seededRand(seed, 3) * 0.06;
  const blur = VINTAGE_BASE.blur + Math.max(0, seededRand(seed, 4)) * 0.4;
  const saturate = VINTAGE_BASE.saturate + seededRand(seed, 5) * 0.07;
  return vintageChainFromValues(contrast, bright, hue, blur, saturate, mode);
}

export function filterCss(filter: FilterType | null | undefined, photoId?: string): string {
  if (!filter) return 'none';
  if (filter === 'vintage' && photoId) return vintageVariationFor(photoId, 'dom');
  return FILTERS[filter]?.dom ?? 'none';
}

export function filterCssForCanvas(filter: FilterType | null | undefined, photoId?: string): string {
  if (!filter) return 'none';
  if (filter === 'vintage' && photoId) return vintageVariationFor(photoId, 'canvas');
  return FILTERS[filter]?.canvas ?? 'none';
}

export const FILTER_CSS: Record<FilterType, string> = {
  original: FILTERS.original.dom,
  vintage: FILTERS.vintage.dom,
  bw: FILTERS.bw.dom,
  special: FILTERS.special.dom,
  retro: FILTERS.retro.dom,
};

function drawTimestampWatermark(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  takenAt: string,
): void {
  const { month, rest } = splitStamp(formatStampDate(takenAt));
  const ghost = ghostifyStamp(rest);
  const size = Math.max(16, Math.min(canvas.width, canvas.height) * 0.022);
  const monthSize = size * 1.5;
  const padding = size;
  const dsegFont = `700 ${size}px "DSEG14Classic", ui-monospace, "Menlo", monospace`;
  const pixelFont = `400 ${monthSize}px "VT323", ui-monospace, "Menlo", monospace`;
  const gap = size * 0.35;

  ctx.save();
  ctx.filter = 'none';
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.font = pixelFont;
  const monthW = ctx.measureText(month).width;
  ctx.font = dsegFont;
  const restW = ctx.measureText(rest).width;
  const totalW = monthW + gap + restW;
  const xMonth = canvas.width - padding - totalW;
  const xRest = xMonth + monthW + gap;
  const y = canvas.height - padding;

  // DSEG14 ghost segments
  ctx.font = dsegFont;
  ctx.shadowColor = 'rgba(255,107,53,0.4)';
  ctx.shadowBlur = Math.max(2, size * 0.12);
  ctx.fillStyle = 'rgba(255,107,53,0.32)';
  ctx.fillText(ghost, xRest, y);

  // DSEG14 lit text (3 passes)
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

  // VT323 pixel month (3 passes)
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
 * REVERTED: Back to ctx.filter approach but with better CSS approximations.
 * The DOM rendering approach had timing/rendering issues.
 * 
 * For now, we accept that SVG filters look slightly different in downloads
 * until we find a more reliable way to render them in canvas.
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

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');

      if (!ctx) {
        reject(new Error('Canvas 2D context unavailable'));
        return;
      }

      // Draw the original image first.
      ctx.drawImage(img, 0, 0);

      // Apply the full filter stack (SVG color matrix + CSS chain + bloom)
      // so the downloaded JPEG matches what the user sees on screen. Uses
      // pixel manipulation throughout — ctx.filter is unreliable on iOS.
      applyDownloadFilter(ctx, canvas, filter, photoId);

      // Add timestamp watermark on top of the filtered image.
      if (takenAt) drawTimestampWatermark(ctx, canvas, takenAt);

      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('canvas.toBlob returned null'));
        },
        'image/jpeg',
        quality,
      );
    };

    img.onerror = () => reject(new Error(`Failed to load image: ${signedUrl}`));
    img.src = signedUrl;
  });
}
