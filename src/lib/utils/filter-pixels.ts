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

/**
 * Apply an SVG-style 4×5 color matrix to image pixel data.
 * Matrix rows: [Rr Rg Rb Ra Roffset, Gr Gg Gb Ga Goffset, Br Bg Bb Ba Boffset, Ar Ag Ab Aa Aoffset]
 * Offsets are 0–1 (SVG spec); we scale to 0–255 internally.
 */
export function applyColorMatrix(data: Uint8ClampedArray, m: number[]): void {
  if (m.length !== 20) throw new Error('Color matrix must have 20 values (4×5)');
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    data[i] = clamp(m[0] * r + m[1] * g + m[2] * b + m[3] * a + m[4] * 255);
    data[i + 1] = clamp(m[5] * r + m[6] * g + m[7] * b + m[8] * a + m[9] * 255);
    data[i + 2] = clamp(m[10] * r + m[11] * g + m[12] * b + m[13] * a + m[14] * 255);
    data[i + 3] = clamp(m[15] * r + m[16] * g + m[17] * b + m[18] * a + m[19] * 255);
  }
}

/**
 * Random luminance grain (uniform noise added to RGB). `strength` is 0–1,
 * where 0.05 ≈ subtle film grit, 0.10 ≈ heavy 35 mm grain. Adds the same
 * delta to R/G/B per pixel so the grain reads as monochrome (not coloured).
 */
export function applyGrain(data: Uint8ClampedArray, strength: number): void {
  const range = strength * 255;
  for (let i = 0; i < data.length; i += 4) {
    const n = (Math.random() - 0.5) * range;
    data[i] = clamp(data[i] + n);
    data[i + 1] = clamp(data[i + 1] + n);
    data[i + 2] = clamp(data[i + 2] + n);
  }
}

/**
 * Coloured "chroma" sensor noise — independent R and B perturbation with
 * suppressed G, matching the magenta/cyan speckle of cheap early-2000s
 * CCDs. `strength` is 0–1.
 */
export function applyChromaNoise(data: Uint8ClampedArray, strength: number): void {
  const range = strength * 255;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(data[i] + (Math.random() - 0.5) * range * 1.5);
    data[i + 1] = clamp(data[i + 1] + (Math.random() - 0.5) * range * 0.4);
    data[i + 2] = clamp(data[i + 2] + (Math.random() - 0.5) * range * 1.5);
  }
}

/**
 * Radial vignette — darkens corners with a colored multiply gradient.
 * `intensity` 0–1 controls the corner darkness. `tint` is the corner color
 * (default near-black with a slight purple cast for a cinematic feel).
 */
export function applyVignette(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  intensity = 0.55,
  tint = 'rgba(15, 10, 25, 1)',
): void {
  const w = canvas.width;
  const h = canvas.height;
  const innerR = Math.min(w, h) * 0.45;
  const outerR = Math.max(w, h) * 0.75;
  const grad = ctx.createRadialGradient(w / 2, h / 2, innerR, w / 2, h / 2, outerR);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, tint);
  const prevOp = ctx.globalCompositeOperation;
  const prevAlpha = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = intensity;
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = prevOp;
  ctx.globalAlpha = prevAlpha;
}

/**
 * CCD-style highlight bloom: clones the canvas, blurs it heavily, scales it
 * down (so only the brighter areas glow visibly), and screen-blends it onto
 * the original. Mirrors what the SVG `#ccd-bloom` filter does in the DOM.
 */
export function applyBloom(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  blurRadius: number,
  scale: number,
): void {
  const w = canvas.width;
  const h = canvas.height;
  const orig = ctx.getImageData(0, 0, w, h);
  const blurred = new ImageData(new Uint8ClampedArray(orig.data), w, h);
  // Blur, then scale RGB down so the bloom is subtle (matches SVG matrix×0.35).
  applyBlur(blurred, blurRadius);
  const bd = blurred.data;
  for (let i = 0; i < bd.length; i += 4) {
    bd[i] = bd[i] * scale;
    bd[i + 1] = bd[i + 1] * scale;
    bd[i + 2] = bd[i + 2] * scale;
  }
  // Screen blend: out = 255 - (255-base) * (255-overlay) / 255.
  const od = orig.data;
  for (let i = 0; i < od.length; i += 4) {
    od[i] = 255 - ((255 - od[i]) * (255 - bd[i])) / 255;
    od[i + 1] = 255 - ((255 - od[i + 1]) * (255 - bd[i + 1])) / 255;
    od[i + 2] = 255 - ((255 - od[i + 2]) * (255 - bd[i + 2])) / 255;
  }
  ctx.putImageData(orig, 0, 0);
}
