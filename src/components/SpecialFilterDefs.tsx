/**
 * Inline SVG filter defs used by photo filters that need split-tone color
 * remapping (more than what CSS filter() primitives can do alone).
 *
 *   #fuji-tone   — used by `special` filter
 *                  Warm cream highlights + cyan-lifted shadows (Japanese diary).
 *
 *   #retro-tone  — used by `retro` filter
 *                  Magenta/cream highlights + blue-purple crushed shadows
 *                  (2010 Tumblr / Indie Sleaze / Canon Powershot).
 *
 * Mounted once in the root layout. CSS references via `filter: url(#id)`.
 */
export function SpecialFilterDefs() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: 'absolute', width: 0, height: 0 }}
    >
      <defs>
        {/* SPECIAL — diary look split tone */}
        <filter id="fuji-tone" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="
              1.05 0    0    0    0.02
              0    1.0  0    0    0.015
              0    0    0.75 0    0.05
              0    0    0    1    0
            "
          />
        </filter>

        {/* VINTAGE — Sony Cybershot / Powershot outdoor cool CCD tones.
            R reduced (less orange skin, less warm cast), B boosted + lifted
            in shadows (cyan-blue tint in darks), highlights stay cleaner cool.
            Pixel breakdown:
              Black (0,0,0)     → (0, 0, 0.04)        cyan-lifted shadows
              Shadow (0.15)     → (0.143, 0.15, 0.198) clearly blue-cyan darks
              Mid (0.5)         → (0.475, 0.50, 0.54)  slightly cool mids
              Highlight (1,1,1) → (0.95, 1.0, 1.0)     clean cool whites
              Skin (0.85,0.7,0.6) → (0.808, 0.7, 0.67) less orange skin
        */}
        <filter id="cool-ccd" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="
              0.95 0    0    0    0
              0    1.0  0    0    0
              0    0    1.05 0    0.04
              0    0    0    1    0
            "
          />
        </filter>

        {/* CCD bloom — soft halation around bright areas, like a Cybershot
            CCD overexposing windows / lamps slightly. Halved intensity vs the
            initial version: tighter stdDeviation (3→2) so the bloom radius is
            smaller, and a feColorMatrix scales the blurred copy's RGB by 0.5
            before screen-blend, so the bloom adds only ~half the brightness it
            would otherwise. Result: highlights still glow subtly, no dreamy
            Orton-effect haze. */}
        <filter
          id="ccd-bloom"
          colorInterpolationFilters="sRGB"
          x="-10%" y="-10%" width="120%" height="120%"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
          <feColorMatrix
            in="blur"
            values="0.35 0    0    0 0
                    0    0.35 0    0 0
                    0    0    0.35 0 0
                    0    0    0    1 0"
            result="weakBlur"
          />
          <feBlend in="weakBlur" in2="SourceGraphic" mode="screen" />
        </filter>

        {/* RETRO — 2010 golden-Tumblr / Indie Sleaze, warm cream wash
            Warm/peach overall (cream highlights, golden midtones) with a
            subtle rosy bias. B channel cut for the sepia warmth, R/G kept
            close together so highlights go cream (not pink). Black lift
            keeps the washed-out low-contrast film look.
            Pixel breakdown:
              Black (0,0,0)     → (0.02, 0.02, 0.08) lifted, faint warm gray
              Shadow (0.15)     → (0.19, 0.16, 0.20) warm muted shadows
              Mid (0.5)         → (0.57, 0.48, 0.47) warm peach mids
              Highlight (1,1,1) → (1.00, 0.94, 0.86) cream/peach highlights
        */}
        <filter id="retro-tone" colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="
              1.10 0    0    0    0.02
              0    0.92 0    0    0.02
              0    0    0.78 0    0.08
              0    0    0    1    0
            "
          />
        </filter>
      </defs>
    </svg>
  );
}
