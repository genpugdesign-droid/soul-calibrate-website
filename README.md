# soul-calibrate-website

Marketing site for MAGI. Static HTML/CSS/JS, no build step.

## Structure

- `index.html` — page markup (hero, problem/company/founders cards, footer)
- `css/style.css` — dark cyberpunk theme (electric blue + electric red on near-black)
- `js/main.js` — scroll-scrubbed background video, sticky-card reveal, header state,
  hero diamond field
- `assets/video/` — drop the hero background video here
- `assets/img/` — image assets
- `app/` — **a copy of a magi HUD build**, embedded by the demo section. Do not
  edit by hand; run `./sync_app.sh` (see below)
- `sync_app.sh` — pulls a build from the preview repo and re-applies the site's
  adaptations

## The demo section

The demo is an iframe over `app/`, which is a copy of a build from
`~/Documents/soulcalibrate/docs/design_preview/hud_v*`. It is the real thing
running, not a mockup rebuilt in this stylesheet — an earlier version was, and
its classes collided with the page's own (`.hl` restyled the hero subheading).
The iframe keeps `hud.css` and `css/style.css` in separate documents so neither
can reach the other.

### Updating it

```sh
./sync_app.sh              # newest hud_v* in the preview repo
./sync_app.sh hud_v18      # a specific build
./sync_app.sh --no-check   # skip the smoke test
```

It copies the build, then re-applies three site adaptations and verifies them:

| adaptation | why |
|---|---|
| session-clip `src` → `assets/video/throw_asset_no_bg.mp4` | the session clips carry no codec box and decode nowhere; the site's clip plays |
| preview harness removed | `toggle REC` / `next state` are review affordances, not product |
| embed CSS | the iframe is the stage, so the frame fills it instead of centring in a viewport it doesn't own |

Each adaptation **fails loudly** if its anchor is missing, so a build that
changes shape stops the sync instead of silently producing a broken embed.

It also refuses any build whose `hud.js` wires the harness buttons unguarded —
removing the harness would then throw on load and the engine would never start.
That is exactly what happened the first time this was embedded, and it is the
fourth instance of the same bug class (theme button, `cardStatus`, the LIVE
card). Guard it in the preview build, then re-run.

Finally it smoke-tests the copy in headless Chrome: `window.MAGI` alive, fps
ticking, no console errors. A failing check exits non-zero rather than leaving a
demo that renders but does not run.

## Editing content

Every placeholder is bracketed, e.g. `[EDIT: ...]` — search the repo for `EDIT:` to find them all.

## Adding the real background video

Once footage is ready, drop it in `assets/video/` and uncomment/add a `<source>` inside
`#bg-video` in `index.html`:

```html
<source src="assets/video/hero-loop.mp4" type="video/mp4">
```

The scroll-scrub script in `js/main.js` picks it up automatically — no other changes needed.

## Local preview

Open `index.html` directly in a browser, or serve the folder (`python3 -m http.server`) so
relative asset paths resolve the same way they will in production.

## Deploying

The repo has no build step, so GitHub Pages can serve it directly from the `main` branch
(Settings → Pages → Deploy from a branch).


## The hero

The wordmark is the liquid-metal lockup, centred and enlarging on hover. It
carries both the mark and the letterforms, so there is no typed `magi` in the
hero any more.

It is a **video** (`assets/video/magi-liquid-metal.mp4`) so the metal actually
moves. The source is H.264, which has no alpha, and it was rendered as a dark
logo on a light grey field — the inverse of this site. The background is keyed
out in CSS, and the filter order in `.hero-mark` is load-bearing:

| step | why |
|---|---|
| `invert(1)` | light background → near-black, dark logo → bright |
| `hue-rotate(180deg)` | invert flips HUE too; without this the metal comes back sepia |
| `contrast(1.42)` | crushes the remaining background to TRUE black |
| `brightness(1.22)` | lifts the metal — safe only *after* the crush, since 0 × n = 0 |
| `mix-blend-mode: screen` | true black contributes nothing, so the background vanishes |

Two things this depends on, both easy to break:

- **`.hero-title` must not create a stacking context.** An element only blends
  with the backdrop inside its nearest stacking context, so centring the h1
  with a transform — or giving it a `z-index` — makes the video screen against
  an empty box and the knocked-out background returns as a visible rectangle.
  The hero centres it with `place-items: center` for exactly this reason.
- **The key assumes a flat background.** It works because the source's field is
  a single light grey. A gradient or textured background would not knock out
  cleanly.

`assets/img/magi-liquid-metal.webp` is the static version of the same lockup.
It is no longer referenced, kept as a fallback if the video is ever dropped.

Behind it, `.hero-diamonds` is a field of slowly drifting diamonds generated in
`main.js` — count, lane, size, drift, opacity and duration randomised per
diamond so it never visibly repeats, with negative animation delays so the page
opens on a field already in motion. Under `prefers-reduced-motion` it becomes a
still constellation rather than disappearing.

This replaced a CRT-styled loader video (`assets/video/loader.mp4`) that sat
dead centre. That file and the `#fisheye` SVG filter that warped it are both
still in the repo but no longer referenced — the video is recoverable if the
treatment is ever wanted back.


## Typography

`Unbounded` is the brand face and sets the whole site, self-hosted from
`assets/fonts/Unbounded-Variable.ttf`. It is the **variable** file (weights
200–900) rather than the eight static cuts: one request instead of eight, and
weight becomes a continuous axis rather than four fixed steps.

Two caveats worth knowing:

- **It is a 777KB TTF.** There was no `fontTools` available to build a `woff2`,
  which would cut it by roughly two thirds. `font-display: swap` is set so the
  page renders in the fallback rather than blocking on it, but converting this
  is the single biggest win available on load time.
- **Monospace survives in a few places**, and the reason is structural rather
  than stylistic: `pre`, `code`, `.ascii-static`, `.beat` and everything
  matching `[class*="hud-"]` need a fixed advance width. Proportional digits
  make the HUD's readouts shift sideways every time a value changes, and ASCII
  art built on a character grid collapses outright. Everything else is
  Unbounded.

## Hero layout

- The subheading sits **centred under the lockup** inside `.hero-stack`, so it
  reads as the mark's caption rather than as copy in a corner. It is typed out
  on `load` by `main.js` — the copy is *not* duplicated in the script, it is
  read out of the DOM as (text, class) segments and re-emitted a character at a
  time, so `index.html` stays the source of truth and the highlight span
  survives. Under `prefers-reduced-motion` the finished line is left as
  authored.
- `.hero-baseline` puts the entry point and the attribution on **one row**.
  They were previously two separately positioned corners that happened to be
  near the same height; they are now aligned by construction.
- The entry point is a **ring**, not a bracketed rectangle. It echoes the
  pentacle in the lockup, survives being small, and the copy names the act
  (`BEGIN`) rather than the input device (`scroll_to_begin`).
- `Forged by` is set in caps via `text-transform`, so the markup stays sentence
  case and the styling stays reversible.
