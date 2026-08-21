# soul-calibrate-website

Marketing site for MAGI. Static HTML/CSS/JS, no build step.

## Structure

- `index.html` — page markup (hero, problem/company/founders cards, footer)
- `css/style.css` — dark cyberpunk theme (electric blue + electric red on near-black)
- `js/main.js` — scroll-scrubbed background video, sticky-card reveal, header state
- `assets/video/` — drop the hero background video here
- `assets/img/` — image assets

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
