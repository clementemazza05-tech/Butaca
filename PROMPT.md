# BUTACA: landing page build brief

You are building a production-quality landing page for BUTACA from scratch in this repo. Work autonomously: don't ask questions, make sensible decisions, and list them at the end. If ffmpeg, Playwright or Chromium are missing, install them. Commit your work in small commits and push to the current branch.

## Product
BUTACA is a B2B product that lets movie theaters add a "see the view from your seat" 3D seat picker to their booking flow. Audience: cinema owners and operations managers. Goal: book a demo. Site language: Spanish (Argentina, "vos" tone, short punchy sentences). Single page, HTML + CSS + vanilla JS, no build step. Only external libs: GSAP 3.12.5 + ScrollTrigger 3.12.5 and Lenis 1.1.9 from cdnjs.cloudflare.com (pinned), Google Fonts Anton + Plus Jakarta Sans.

## Assets (in ./assets, keep the originals untouched)
- `clip-original.mp4`: one continuous ~10 s, 1920x1080, 24 fps shot. It has an audio track (remove it).
- `logo-silla-original.jpg`: isometric 3D red cinema chair on a near-black (#0F0F12) background = the logo mark (2048x2048).

### Step 0, before writing any UI
1. ffprobe both files. Encode for smooth scroll scrubbing: `assets/clip-butaca.mp4` (1280 px wide) and `assets/clip-butaca-mobile.mp4` (960 px wide), both with: `ffmpeg -i clip-original.mp4 -vf scale=W:-2 -c:v libx264 -g 1 -crf 23 -an -movflags +faststart out.mp4`.
2. Extract `assets/poster-01.jpg` (first frame), `assets/poster-02.jpg` (last frame) and 6 evenly spaced frames `assets/frames/f1..f6.jpg` for the mobile fallback.
3. Make a transparent PNG of the chair logo (key out the dark background, keep soft edges; check it on dark and white backgrounds) as `assets/logo-silla.png`, crop/resize to a 512 px square, and generate favicon + apple-touch-icon from it. If keying looks bad, keep the original and let it sit on the #0F0F12 page background.
4. Look at the extracted frames yourself and measure the red screen's bounding box (as % of the frame) at t = 0, 1, 2, 3, 4 s so the title alignment is data-driven. Rough numbers at t=0: x 27–73 %, y 17–64 %, widening to ~x 18–82 % by t=4 s.

## What the video contains (verify against your own frames)
- 0–2 s: dark lobby, giant flat blank red screen on the back wall, a lone silhouette in the foreground holding a ticket, then walking out to the right. Red light reflecting on the polished floor.
- ~2–4 s: double doors in the center of the red wall open as the camera pushes forward, revealing the auditorium.
- 4–7 s: the camera passes through the doors; rows of red seats, amber aisle lights, a bright desert-dune screen at the end, haze.
- 7–10 s: the camera moves down the aisle toward a red seat seen from behind, facing the dune screen. It ends close behind the seat.
No text is baked into the video; ALL text is live HTML.

## Creative concept
One continuous scroll-driven shot. Scroll = camera. It must feel like a film, not stacked sections.

## Style
- Palette: dark #0F0F12, "Rojo Butaca" #D90429, white #FFFFFF, "Gris UI" #8D99AE.
- Display: Anton, uppercase only, line-height ~0.9, huge. Everything else Plus Jakarta Sans.
- Pill buttons (999px radius, 44px min height, press scale 0.97). Subtle film-grain overlay (4–6 %), soft vignette, generous spacing, one idea per viewport. Red used sparingly: CTAs, the selected seat, key numerals, screen glow.
- Feeling reference: a huge condensed title filling a glowing flat screen in a dark space, tiny nav pills, a lone silhouette, light spilling on the floor. Do not use yellow or copy any existing brand.

## Scroll engine
- One pinned stage (~500vh desktop, ~350vh mobile). A single `<video>` covers the viewport (object-fit: cover; muted, playsinline, preload="auto"); ScrollTrigger scrubs `video.currentTime` across the full duration (scrub ~0.5 with rAF smoothing). Bind after `loadedmetadata`. Use the mobile file under 768 px.
- Overlay timeline keyed to video seconds with a small JS map so it can be retimed easily (`const BEATS = {...}`). Use opacity + translateY + slight blur, staggered:
  - **A) 0–2.3 s HERO:** "BUTACA" in Anton aligned over the red screen's upper half (above the silhouette's head), width ≈ the screen width, soft red glow, white text. It must track the screen as the camera pushes: drive its scale/position from CSS variables (--screen-x/y/w/h) interpolated by progress between the measured rects, in the object-fit: cover coordinate space. Under it: "Tu sala en tres dimensiones." and a "Scrolleá" hint. As the doors open (~2–3 s) the title scales up and fades out. Add `?debug` that draws the measured screen rect and current time.
  - **B) 2–4.5 s PROBLEMA:** three lines in the dark negative space (left/right of the doorway, or projected onto the floor with CSS perspective + mix-blend-mode: screen, whichever reads best; check contrast): "Hoy tus clientes eligen butaca a ciegas." / "Un mapa gris. Cero idea de qué van a ver." / "Fila A o fila K: el mismo precio, la misma duda."
  - **C) 4.5–7.5 s SOLUCIÓN:** headline "ELEGÍ DONDE TE SENTÁS." sub "Y mirá exactamente qué vas a ver." plus a dark-glass seat-map card on the right (small isometric seats as inline SVG, seat H14 highlighted red).
  - **D) 7.5–10 s LA VISTA:** a bottom sheet rises (glass, rounded top, grabber): red micro-label "VISTA COMPLETA", "FILA H, ASIENTO 14" in Anton, three stat cards with count-up (13,3 m a la pantalla · 45° campo de visión · 3,3 m a la derecha del centro; mark as demo values), buttons "Reservar asiento" (red pill) and "Ver sala 3D" (outline pill with a small hex "3D" icon). Add a slight hold at the end: extend the final ~8 % of scroll with the video parked on its last frame while the sheet finishes.
- Fixed nav of tiny pills: chair logo + BUTACA at left; "Cómo funciona", "Para cines", and a red "Pedí una demo" pill at right.
- Mobile/iOS: if scrubbing is choppy, fall back to the extracted key frames with crossfade + scale. Respect prefers-reduced-motion (no pinning, poster + stacked text).

## Sections after the film (static, dark)
5. **"POR QUÉ A TU CINE":** 3 big cards with huge Anton numerals 01/02/03: "Más reservas confiadas" (la gente compra con la vista en la mano), "Menos reclamos en boletería" (el cliente sabe qué le toca), "Upsell de butacas premium" (mostrá la diferencia entre fila 4 y recliner). Below, 3 metric placeholders labeled "[dato a validar]". Do NOT invent real stats or claims.
6. **"CÓMO SE INTEGRA":** three steps in one line: "Cargás tu sala (plano o fotos)" → "Generamos el visor 3D" → "Lo sumás a tu web o app con un snippet", with a decorative non-functional `<script>` chip.
7. **CTA FINAL:** a large red block echoing the hero screen: "TU PRÓXIMA FUNCIÓN EMPIEZA POR LA BUTACA" with a front-end-only form (nombre del cine, email, cantidad de salas, "Pedí una demo", simple validation + success message). Below it, contact cells as outlined rounded cards (email, WhatsApp, "Hecho en Buenos Aires") with placeholder values.
8. **FOOTER:** minimal, legal links, small chair logo.

## Accessibility & performance
Real h1/h2, live text in the DOM, AA contrast, visible focus rings, skip link, keyboard-reachable CTAs, lazy-load below the fold, width/height on media, no layout shift. Meta tags (title, description, OG) and favicon. Target Lighthouse mobile performance >= 85.

## Verify (required before you finish)
Serve the site locally. With Playwright, take screenshots at 1440x900 and 390x844 at video times 0, 1.5, 3, 5, 7, 9, 10 s and at the post-film sections. Critically inspect them: title alignment over the red screen (use ?debug), overlay/text overlap with the silhouette, contrast of copy over bright frames, overflow on mobile, timing of beats vs. video, scrub smoothness. Fix problems, re-shoot. Run Lighthouse if available. Save the final screenshots in `docs/screens/`.

## Deliverable
The site at the repo root (index.html, css/, js/, assets/), a README.md (how to run, the ffmpeg commands, how to retime BEATS and tune --screen-* variables), and a short summary in the final message: decisions you made, anything you couldn't verify, and the 3 things I should try first. Make it deployable as a static site (no server code).
