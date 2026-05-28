// Pixel-level implementation of CSS filter chains. Drop-in replacement for
// canvas `ctx.filter` on browsers where it doesn't reliably apply (notably
// older iOS Safari). Slower (~500ms-2s for a typical photo) but correct
// everywhere.
//
// Supports: saturate, contrast, brightness, hue-rotate, sepia, grayscale, blur.
// Order of operations mirrors what the browser does for `filter:` chains.

interface Spec {
  saturate: number;
  contrast: number;
  brightness: number;
  hueRotate: number;
  blur: number;
  sepia: number;
  grayscale: number;
}

const DEFAULT: Spec = {
  saturate: 1,
  contrast: 1,
  brightness: 1,
  hueRotate: 0,
  blur: 0,
  sepia: 0,
  grayscale: 0,
};

export function parseFilterChain(css: string): Spec {
  const spec = { ...DEFAULT };
  if (!css || css === 'none') return spec;
  for (const m of css.matchAll(/([\w-]+)\(([^)]+)\)/g)) {
    const [, name, valRaw] = m;
    const num = parseFloat(valRaw);
    if (Number.isNaN(num)) continue;
    if (name === 'saturate') spec.saturate = num;
    else if (name === 'contrast') spec.contrast = num;
    else if (name === 'brightness') spec.brightness = num;
    else if (name === 'hue-rotate') spec.hueRotate = num;
    else if (name === 'blur') spec.blur = num;
    else if (name === 'sepia') spec.sepia = num;
    else if (name === 'grayscale') spec.grayscale = num;
  }
  return spec;
}

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

// Luminance coefficients per SVG spec.
const LR = 0.213;
const LG = 0.715;
const LB = 0.072;

function applyPixelMath(d: Uint8ClampedArray, spec: Spec): void {
  const { saturate, contrast, brightness, hueRotate, sepia, grayscale } = spec;
  // Pre-compute hue rotation matrix coefficients (SVG-spec hue-rotate).
  const rad = (hueRotate * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const m = [
    LR + cos * (1 - LR) + sin * -LR,
    LG + cos * -LG + sin * -LG,
    LB + cos * -LB + sin * (1 - LB),
    LR + cos * -LR + sin * 0.143,
    LG + cos * (1 - LG) + sin * 0.14,
    LB + cos * -LB + sin * -0.283,
    LR + cos * -LR + sin * -(1 - LR),
    LG + cos * -LG + sin * LG,
    LB + cos * (1 - LB) + sin * LB,
  ];

  for (let i = 0; i < d.length; i += 4) {
    let r = d[i];
    let g = d[i + 1];
    let b = d[i + 2];

    // Hue-rotate.
    if (hueRotate !== 0) {
      const nr = m[0] * r + m[1] * g + m[2] * b;
      const ng = m[3] * r + m[4] * g + m[5] * b;
      const nb = m[6] * r + m[7] * g + m[8] * b;
      r = nr;
      g = ng;
      b = nb;
    }

    // Saturate.
    if (saturate !== 1) {
      const lum = LR * r + LG * g + LB * b;
      r = lum + (r - lum) * saturate;
      g = lum + (g - lum) * saturate;
      b = lum + (b - lum) * saturate;
    }

    // Sepia.
    if (sepia > 0) {
      const sr = 0.393 * r + 0.769 * g + 0.189 * b;
      const sg = 0.349 * r + 0.686 * g + 0.168 * b;
      const sb = 0.272 * r + 0.534 * g + 0.131 * b;
      r = r * (1 - sepia) + sr * sepia;
      g = g * (1 - sepia) + sg * sepia;
      b = b * (1 - sepia) + sb * sepia;
    }

    // Grayscale.
    if (grayscale > 0) {
      const lum = LR * r + LG * g + LB * b;
      r = r * (1 - grayscale) + lum * grayscale;
      g = g * (1 - grayscale) + lum * grayscale;
      b = b * (1 - grayscale) + lum * grayscale;
    }

    // Brightness.
    if (brightness !== 1) {
      r *= brightness;
      g *= brightness;
      b *= brightness;
    }

    // Contrast.
    if (contrast !== 1) {
      r = (r - 128) * contrast + 128;
      g = (g - 128) * contrast + 128;
      b = (b - 128) * contrast + 128;
    }

    d[i] = clamp(r);
    d[i + 1] = clamp(g);
    d[i + 2] = clamp(b);
  }
}

// Single-pass horizontal+vertical box blur — fine for the sub-1px blur radii
// our filters use. For larger radii a separable gaussian would be better.
function applyBlur(imageData: ImageData, radius: number): void {
  if (radius < 0.5) return;
  const r = Math.max(1, Math.round(radius));
  const w = imageData.width;
  const h = imageData.height;
  const src = new Uint8ClampedArray(imageData.data);
  const tmp = new Uint8ClampedArray(imageData.data.length);

  // Horizontal pass.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0, gs = 0, bs = 0, count = 0;
      for (let dx = -r; dx <= r; dx++) {
        const nx = x + dx < 0 ? 0 : x + dx >= w ? w - 1 : x + dx;
        const i = (y * w + nx) * 4;
        rs += src[i];
        gs += src[i + 1];
        bs += src[i + 2];
        count++;
      }
      const i = (y * w + x) * 4;
      tmp[i] = rs / count;
      tmp[i + 1] = gs / count;
      tmp[i + 2] = bs / count;
      tmp[i + 3] = src[i + 3];
    }
  }

  // Vertical pass.
  const dst = imageData.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let rs = 0, gs = 0, bs = 0, count = 0;
      for (let dy = -r; dy <= r; dy++) {
        const ny = y + dy < 0 ? 0 : y + dy >= h ? h - 1 : y + dy;
        const i = (ny * w + x) * 4;
        rs += tmp[i];
        gs += tmp[i + 1];
        bs += tmp[i + 2];
        count++;
      }
      const i = (y * w + x) * 4;
      dst[i] = rs / count;
      dst[i + 1] = gs / count;
      dst[i + 2] = bs / count;
      dst[i + 3] = tmp[i + 3];
    }
  }
}

export function applyCssFilterToCanvas(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  cssFilter: string,
): void {
  if (!cssFilter || cssFilter === 'none') return;
  const spec = parseFilterChain(cssFilter);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyPixelMath(imgData.data, spec);
  if (spec.blur >= 0.5) applyBlur(imgData, spec.blur);
  ctx.putImageData(imgData, 0, 0);
}
