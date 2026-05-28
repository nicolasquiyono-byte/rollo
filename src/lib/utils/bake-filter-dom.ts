import domtoimage from 'dom-to-image-more';
import type { FilterType } from '../../types';
import { filterCss } from './filter-css';
import { formatStampDate, ghostifyStamp, splitStamp } from './format-stamp';

/**
 * Bakes the photo + filter + watermark to a Blob by rendering a hidden DOM
 * node and snapshotting it. Unlike canvas ctx.filter, this resolves SVG
 * url(#...) filters correctly because the browser is rendering real DOM.
 *
 * Requires <SpecialFilterDefs> to be mounted in the page (it already is,
 * since the same SVG defs power the on-screen filters).
 */
export async function bakeFilterToBlobViaDom(
  signedUrl: string,
  filter: FilterType,
  photoId?: string,
  takenAt?: string,
): Promise<Blob> {
  // 1. Preload the image so we know its natural dimensions
  const img = await loadImage(signedUrl);
  const w = img.naturalWidth;
  const h = img.naturalHeight;

  // 2. Build an offscreen container with the photo at native resolution
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = `${w}px`;
  container.style.height = `${h}px`;
  container.style.pointerEvents = 'none';

  const photo = document.createElement('img');
  photo.src = signedUrl;
  photo.crossOrigin = 'anonymous';
  photo.style.width = '100%';
  photo.style.height = '100%';
  photo.style.display = 'block';
  photo.style.filter = filterCss(filter, photoId); // SAME filter as on-screen
  container.appendChild(photo);

  // 3. Watermark as a DOM overlay (matches what user sees)
  if (takenAt) {
    const wm = buildWatermarkNode(takenAt, w, h);
    container.appendChild(wm);
  }

  document.body.appendChild(container);

  try {
    // 4. Wait for the inner image to load before snapshotting
    await loadImage(signedUrl); // already cached, but ensures the node's img is decoded
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

    // 5. Snapshot the DOM to a Blob
    const blob = (await domtoimage.toBlob(container, {
      width: w,
      height: h,
      quality: 0.92,
      bgcolor: '#000',
      cacheBust: false,
    })) as Blob;

    return blob;
  } finally {
    document.body.removeChild(container);
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function buildWatermarkNode(takenAt: string, w: number, h: number): HTMLDivElement {
  const { month, rest } = splitStamp(formatStampDate(takenAt));
  const ghost = ghostifyStamp(rest);
  const size = Math.max(16, Math.min(w, h) * 0.022);
  const monthSize = size * 1.5;
  const padding = size;

  const wm = document.createElement('div');
  wm.style.position = 'absolute';
  wm.style.right = `${padding}px`;
  wm.style.bottom = `${padding}px`;
  wm.style.display = 'flex';
  wm.style.alignItems = 'baseline';
  wm.style.gap = `${size * 0.35}px`;
  wm.style.pointerEvents = 'none';

  const monthEl = document.createElement('span');
  monthEl.textContent = month;
  monthEl.style.font = `400 ${monthSize}px "VT323", ui-monospace, Menlo, monospace`;
  monthEl.style.color = '#FF6B35';
  monthEl.style.textShadow =
    `0 0 ${size * 0.65}px rgba(255,107,53,0.55), ` +
    `0 0 ${size * 0.28}px rgba(255,107,53,0.75), ` +
    `0 0 ${size * 0.1}px rgba(0,0,0,0.9)`;

  const restWrap = document.createElement('span');
  restWrap.style.position = 'relative';
  restWrap.style.font = `700 ${size}px "DSEG14Classic", ui-monospace, Menlo, monospace`;

  const ghostEl = document.createElement('span');
  ghostEl.textContent = ghost;
  ghostEl.style.position = 'absolute';
  ghostEl.style.inset = '0';
  ghostEl.style.color = 'rgba(255,107,53,0.32)';
  ghostEl.style.textShadow = `0 0 ${size * 0.12}px rgba(255,107,53,0.4)`;

  const litEl = document.createElement('span');
  litEl.textContent = rest;
  litEl.style.position = 'relative';
  litEl.style.color = '#FF6B35';
  litEl.style.textShadow =
    `0 0 ${size * 0.65}px rgba(255,107,53,0.55), ` +
    `0 0 ${size * 0.28}px rgba(255,107,53,0.75), ` +
    `0 0 ${size * 0.1}px rgba(0,0,0,0.9)`;

  restWrap.appendChild(ghostEl);
  restWrap.appendChild(litEl);
  wm.appendChild(monthEl);
  wm.appendChild(restWrap);

  return wm;
}
