// One-shot generator for PWA icons. Run via puppeteer from the parent dir
// (where the dependency lives). Re-run after any branding change.
//
//   cd /Users/nicolasquiyono/Desktop/VIGIL/prueba-claude
//   node rollo-app/scripts/generate-pwa-icons.mjs
//
// Output: rollo-app/public/icon-192.png, icon-512.png

import puppeteer from 'puppeteer';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, '..', 'public');

const SIZES = [192, 512];

const html = (size) => `<!DOCTYPE html>
<html><head><style>
  html, body { margin: 0; padding: 0; width: ${size}px; height: ${size}px; }
  .icon {
    width: 100%;
    height: 100%;
    background: #E85D04;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #FFFFFF;
    font-family: Georgia, 'Times New Roman', serif;
    font-weight: 500;
    /* Maskable: keep text inside safe zone (centered ~70% of canvas) */
    font-size: ${Math.round(size * 0.22)}px;
    letter-spacing: ${Math.round(size * 0.005)}px;
    text-transform: uppercase;
  }
</style></head>
<body><div class="icon">Rollo</div></body></html>`;

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  for (const size of SIZES) {
    const page = await browser.newPage();
    await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
    await page.setContent(html(size), { waitUntil: 'domcontentloaded' });
    const buf = await page.screenshot({ omitBackground: false, type: 'png' });
    const out = resolve(PUBLIC_DIR, `icon-${size}.png`);
    await writeFile(out, buf);
    console.log(`wrote ${out} (${buf.length} bytes)`);
    await page.close();
  }
  await browser.close();
})();
