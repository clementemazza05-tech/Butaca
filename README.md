# BUTACA · landing

Landing page for BUTACA, a "see the view from your seat" 3D seat picker for cinemas. It's one continuous, scroll-driven shot: scroll moves the camera.

Static site: `index.html`, `css/`, `js/`, `assets/`. No build step, no server code.

## Run locally

Any static server that supports HTTP range requests works (video seeking needs them):

```bash
npx serve .
```

Then open `http://localhost:3000`. Add `?debug` to see the measured screen rect, the silhouette head line and the current time. Add `?frames` to force the mobile key-frame fallback.

Deploy the folder as-is to Netlify, Vercel, GitHub Pages, S3 or similar.

## Assets

The originals stay untouched at the repo root (`clip-original.mp4`, `logo-silla-original.jpg`). Everything derived lives in `assets/`.

Scrub encodes (all-intra `-g 1`, so every frame is a keyframe and seeks are instant; no audio):

```bash
ffmpeg -i clip-original.mp4 -vf scale=1280:-2 -c:v libx264 -g 1 -crf 23 -an -movflags +faststart assets/clip-butaca.mp4
```

```bash
ffmpeg -i clip-original.mp4 -vf scale=960:-2 -c:v libx264 -g 1 -crf 23 -an -movflags +faststart assets/clip-butaca-mobile.mp4
```

Posters and fallback frames (frame indices 0, 47, 95, 142, 190, 238 of 239):

```bash
ffmpeg -i clip-original.mp4 -vf "select=eq(n\,0)" -frames:v 1 -q:v 3 assets/poster-01.jpg
```

```bash
ffmpeg -i clip-original.mp4 -vf "select=eq(n\,238)" -frames:v 1 -q:v 3 assets/poster-02.jpg
```

```bash
for i in 1 2 3 4 5 6; do n=$(( (i-1)*238/5 )); ffmpeg -i clip-original.mp4 -vf "select=eq(n\,$n),scale=960:-2" -frames:v 1 -q:v 4 assets/frames/f$i.jpg; done
```

Logo: `assets/logo-silla.png` (512 px, transparent) was keyed from the original with a soft color-distance matte against the #101012 background, then un-premultiplied so the edges don't halo. It was checked on dark and white backgrounds. `logo-silla-96.png`, `favicon.ico`, `favicon-16/32.png` and `apple-touch-icon.png` are generated from it.

## Retiming the film

Everything lives at the top of `js/main.js`.

- **`BEATS`**: every time is in *video seconds*. Each beat has `in`, `out`, `fade` and `stagger` (extra delay per `.rv` child, in DOM order). `scrim` is a list of `[second, opacity]` keyframes for the darkening layer behind copy. `countUp` sets when the stat numbers run.
- **`HOLD`** (0.12): the last 12 % of the film's scroll keeps the video parked on its last frame. Times past the clip's end (~9.96 s) fall into the hold, so the whole timeline runs to ~11.3 s. The sheet holds until `vista.out` (10.75 s), then `fadeOut` takes the stage to black so the next section reads as the next scene.
- Film length is `.film { height: 500vh }` (350vh under 768 px) in `css/styles.css`.

## Tuning the title over the red screen

- **`SCREEN`** holds the red screen's bounding box, measured from the source frames as `[time, x0 %, x1 %, y0 %, y1 %]` of the 1920×1080 frame, every 0.5 s from 0 to 4 s:

  | t (s) | x | y |
  |---|---|---|
  | 0 | 27.0–73.0 % | 19.4–63.5 % |
  | 1 | 26.2–73.8 % | 18.3–63.9 % |
  | 2 | 24.7–75.3 % | 15.7–64.3 % |
  | 3 | 22.3–77.8 % | 11.3–64.8 % |
  | 4 | 18.0–82.0 % | 4.1–65.6 % |

- JS interpolates the rect for the current time, maps it into `object-fit: cover` viewport pixels, and writes `--sx/--sy/--sw/--sh`. It also writes the title variables `--tx`, `--title-top`, `--title-s` and `--sub-top`. The title moves by transform only, so there is no layout shift.
- The title aims for 88 % of the screen width, capped so the title and subtitle stay above **`HEAD_Y`** (47.5 % of frame height, the top of the silhouette's head). On narrow phones it is capped at 92 % of the viewport width.
- **`PIN`** places the "H14 · tu butaca" marker over the seat in the last shot.

## How the engine works

- The stage is sticky inside a tall `.film` section, which is the pin. A GSAP tween with ScrollTrigger (`scrub: 0.5`) drives a virtual time `T`. A ticker loop seeks `video.currentTime` toward it, never stacking seeks. Lenis smooths wheel scrolling.
- The video source is set from JS (mobile file under 768 px), and seeking is bound after `loadedmetadata`.
- **Fallbacks:**
  - On phones, if the median seek takes over 160 ms, or the video errors, it switches to the six key frames with crossfade and push-in scale.
  - If the CDN scripts fail, a native scroll and rAF driver takes over.
  - With `prefers-reduced-motion` or no JS, there's no pinning: poster frames with stacked text.

## Placeholders to replace before launch

- Contact: `hola@butaca.example`, `+54 9 11 0000-0000`, legal links (`#`).
- Snippet URL `https://butaca.example/visor.js` (decorative).
- Metrics show `+XX %` and are labeled `[dato a validar]`. The stats in the sheet are marked "Valores de demo".
- The demo form is front-end only. Hook `initForm()` in `js/main.js` to your CRM or form endpoint.
- `og:image` is relative. Make it an absolute URL once there's a domain.

## Screenshots

`docs/screens/`: 1440×900 (`d-*`) and 390×844 (`m-*`) at timeline seconds 0, 1.5, 3, 5, 7, 9, 10.4 (sheet holding) and 11.3 (faded to black), plus the post-film sections. `debug-*` show the measured screen rect.
