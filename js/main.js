/* =========================================================
   BUTACA · scroll-driven film
   Scroll = camera. One pinned stage, one <video> scrubbed by scroll,
   overlays keyed to *video seconds* through the BEATS map below.
   ========================================================= */
(() => {
  'use strict';

  /* ---------------------------------------------------------
     RETIME HERE. All times are video seconds (clip is ~9.96 s).
     Times past the clip's end (~9.96 s) fall into the HOLD (video
     parked on its last frame); the whole timeline ends at ~11.3 s.
       in / out : when an element starts entering / leaving
       fade     : seconds an enter or exit takes
       stagger  : extra delay per child (.rv) in DOM order
     --------------------------------------------------------- */
  const BEATS = {
    hero:      { in: -1,   out: 1.75, fade: 0.45, stagger: 0.12 }, // subtitle + "Scrolleá"
    heroTitle: { in: -1,   out: 2.0,  fade: 0.8 },                 // title scales up + fades as the doors open
    problema:  { in: 2.3,  out: 4.3,  fade: 0.4,  stagger: 0.32 },
    solucion:  { in: 4.75, out: 7.45, fade: 0.45, stagger: 0.16 },
    vista:     { in: 7.9,  out: 10.75, fade: 0.45, stagger: 0.12 },
    pin:       { in: 8.4,  out: 10.75, fade: 0.4 },
    countUp:   { from: 8.7, to: 9.7 },
    fadeOut:   { from: 10.7, to: 11.25 }, // fade to black during the hold, into the next section
    // darkening scrim behind copy: [video second, opacity]
    scrim: [[0, 0.1], [1.6, 0.15], [2.4, 0.85], [4.4, 0.8], [5, 1], [7.5, 0.9], [8.2, 0.55], [10, 0.55]],
  };
  const HOLD = 0.12; // last 12 % of the scroll keeps the video parked on its last frame (sheet holds, then fade)

  /* Reading pauses: at each of these times the camera stops while you keep scrolling,
     so the copy on screen can be read at a normal scroll speed.
       at  : timeline second where the camera parks (all copy of that beat already in)
       len : how long it stays parked, in "scroll seconds" (longer = more scrolling) */
  const DWELL = [
    { at: 0.6,  len: 1.0 }, // hero: BUTACA + subtitle
    { at: 3.45, len: 1.8 }, // problema: the three lines
    { at: 6.1,  len: 1.8 }, // solución: headline + seat map
    { at: 9.8,  len: 1.2 }, // la vista: sheet with the numbers counted
  ];

  /* Red screen bounding box, measured from the source frames (% of the 1920x1080 frame).
     [time, x0, x1, y0, y1]. Tune these if you swap the clip. */
  const SCREEN = [
    [0.0, 27.0, 73.0, 19.4, 63.5],
    [0.5, 26.7, 73.3, 19.1, 63.7],
    [1.0, 26.2, 73.8, 18.3, 63.9],
    [1.5, 25.6, 74.4, 17.2, 64.1],
    [2.0, 24.7, 75.3, 15.7, 64.3],
    [2.5, 23.6, 76.4, 13.6, 64.5],
    [3.0, 22.3, 77.8, 11.3, 64.8],
    [3.5, 20.5, 79.6, 8.3, 65.2],
    [4.0, 18.0, 82.0, 4.1, 65.6],
  ];
  const HEAD_Y = 47.5;  // top of the silhouette's head, % of frame height (title stays above it)
  const PIN = [[8.0, 50, 55], [9.0, 50, 59], [9.96, 50, 63]]; // seat marker anchor [t, x%, y%]
  const FRAME_TIMES = [0, 1.96, 3.96, 5.92, 7.92, 9.92]; // assets/frames/f1..f6.jpg

  /* --------------------------------------------------------- */
  const root = document.documentElement;
  const params = new URLSearchParams(location.search);
  const DEBUG = params.has('debug');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasGSAP = !!(window.gsap && window.ScrollTrigger);

  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmt = (n, dec) => n.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  initSeatMap();
  initForm();
  initReel();
  initFlow();
  initPilot();

  if (!root.classList.contains('film-on') || reduceMotion) {
    initSmoothScroll(false);
    return;
  }

  /* ===== Film engine ===== */
  const film = document.querySelector('.film');
  const stage = film.querySelector('.stage');
  const video = stage.querySelector('.stage__video');
  const poster = stage.querySelector('.stage__poster');
  const frames = [...stage.querySelectorAll('.stage__frames img')];
  const scrim = stage.querySelector('.stage__scrim');
  const fadeEl = stage.querySelector('.stage__fade');
  const lockup = stage.querySelector('.hero-lockup');
  const titleEl = stage.querySelector('.hero-title');
  const titleInner = stage.querySelector('.hero-title__inner');
  const heroSub = stage.querySelector('.hero-sub');
  const pin = stage.querySelector('.seat-pin');
  const counts = [...stage.querySelectorAll('.count')];
  const debugEl = stage.querySelector('.debug');
  const hud = stage.querySelector('.debug__hud');

  const beats = [...stage.querySelectorAll('[data-beat]')].map((el) => ({
    el, cfg: BEATS[el.dataset.beat], items: [...el.querySelectorAll('.rv')],
  }));

  let D = 9.958;                       // clip duration, refined on loadedmetadata
  const totalT = () => D / (1 - HOLD); // virtual timeline incl. hold
  const totalS = () => totalT() + DWELL.reduce((a, d) => a + d.len, 0); // scroll timeline incl. reading pauses
  // scroll seconds -> timeline seconds: flat while inside a pause, 1:1 elsewhere
  const sToT = (sv) => {
    let t = sv;
    for (const d of DWELL) {
      if (t <= d.at) return t;
      if (t <= d.at + d.len) return d.at;
      t -= d.len;
    }
    return t;
  };
  let T = 0;                           // current (smoothed) virtual time
  let mode = params.has('frames') ? 'frames' : 'video';
  let videoReady = false;
  let W = 0, H = 0, cov = { s: 1, ox: 0, oy: 0, w: 0, h: 0 };
  let titleK = 2.62;                   // width of "BUTACA" in Anton, in em (measured after fonts load)
  let subH = 40;

  if (DEBUG) debugEl.hidden = false;

  /* ---- object-fit: cover coordinate space ---- */
  function layout() {
    W = stage.clientWidth; H = stage.clientHeight;
    const s = Math.max(W / 1920, H / 1080);
    cov = { s, w: 1920 * s, h: 1080 * s, ox: (W - 1920 * s) / 2, oy: (H - 1080 * s) / 2 };
    subH = heroSub.offsetHeight + 10;
  }
  const px = (xPct, yPct) => [cov.ox + (xPct / 100) * cov.w, cov.oy + (yPct / 100) * cov.h];

  function screenAt(t) {
    if (t <= SCREEN[0][0]) return SCREEN[0];
    for (let i = 0; i < SCREEN.length - 1; i++) {
      const a = SCREEN[i], b = SCREEN[i + 1];
      if (t <= b[0]) { const k = (t - a[0]) / (b[0] - a[0]); return a.map((v, j) => lerp(v, b[j], k)); }
    }
    return SCREEN[SCREEN.length - 1];
  }
  function keyAt(keys, t) {
    if (t <= keys[0][0]) return keys[0];
    for (let i = 0; i < keys.length - 1; i++) {
      const a = keys[i], b = keys[i + 1];
      if (t <= b[0]) { const k = smooth((t - a[0]) / (b[0] - a[0])); return a.map((v, j) => lerp(v, b[j], k)); }
    }
    return keys[keys.length - 1];
  }

  /* visibility envelope for an element: 0 → 1 → 0 */
  function env(t, cfg, i = 0) {
    const st = (cfg.stagger || 0) * i;
    const vin = cfg.in < 0 ? 1 : smooth((t - cfg.in - st) / cfg.fade);
    const vout = 1 - smooth((t - cfg.out) / cfg.fade); // everything in a beat leaves together
    return { vin, vout, v: Math.min(vin, vout) };
  }
  function applyReveal(el, e, dist = 26) {
    const { vin, vout, v } = e;
    const rise = el.dataset.rise === 'sheet';
    const y = rise ? `${(1 - vin) * 105}%` : `${(1 - vin) * dist - (1 - vout) * dist}px`;
    el.style.opacity = rise ? Math.min(1, vin * 1.6) * vout : v;
    el.style.translate = `0 ${y}`;
    const blur = rise ? 0 : (1 - v) * 8;
    el.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
    el.style.visibility = v < 0.01 ? 'hidden' : 'visible';
  }

  /* ---- one frame of the film ---- */
  let lastT = -1;
  function render(force) {
    if (!force && Math.abs(T - lastT) < 0.0005) return;
    lastT = T;
    const vt = Math.min(T, D - 0.001);

    // Screen rect → CSS variables (viewport px)
    const r = screenAt(vt);
    const [x0, y0] = px(r[1], r[3]);
    const [x1, y1] = px(r[2], r[4]);
    const sw = x1 - x0, sh = y1 - y0;
    const headPx = px(0, HEAD_Y)[1];
    const titleTop = y0 + sh * 0.045;
    const fsW = Math.min(sw * 0.88, W * 0.92) / titleK;
    const fsH = (headPx - titleTop - subH - 14) / 0.82;
    const fs = Math.max(56, Math.min(fsW, fsH));
    const s = stage.style;
    s.setProperty('--sx', `${x0}px`); s.setProperty('--sy', `${y0}px`);
    s.setProperty('--sw', `${sw}px`); s.setProperty('--sh', `${sh}px`);
    s.setProperty('--tx', `${x0 + sw / 2}px`);
    s.setProperty('--title-s', (fs / 100).toFixed(4));
    s.setProperty('--title-top', `${titleTop}px`);
    s.setProperty('--sub-top', `${titleTop + fs * 0.82 + 12}px`);
    if (DEBUG) s.setProperty('--head-rel', `${((headPx - y0) / sh) * 100}%`);

    // Beats
    for (const b of beats) {
      b.items.forEach((el, i) => applyReveal(el, env(T, b.cfg, i)));
    }
    // Hero title: grows and dissolves as the doors open
    const te = env(T, BEATS.heroTitle);
    titleInner.style.scale = 1 + (1 - te.vout) * 0.45;
    titleEl.style.opacity = te.vout;
    titleEl.style.filter = te.vout < 0.98 ? `blur(${((1 - te.vout) * 10).toFixed(2)}px)` : 'none';
    lockup.style.visibility = te.vout < 0.01 ? 'hidden' : 'visible';

    // Scrim + final fade to black
    scrim.style.opacity = keyAt(BEATS.scrim, vt)[1];
    fadeEl.style.opacity = smooth((T - BEATS.fadeOut.from) / (BEATS.fadeOut.to - BEATS.fadeOut.from));

    // Seat pin
    const pe = env(T, BEATS.pin);
    if (pe.v > 0.001) {
      const p = keyAt(PIN, vt);
      const [px_, py_] = px(p[1], p[2]);
      pin.style.transform = `translate(${px_}px, ${py_}px) translate(-50%, calc(-100% - 28px))`;
    }
    pin.style.opacity = pe.v;

    // Count-up (tied to scroll, so it reverses too)
    const k = smooth((vt - BEATS.countUp.from) / (BEATS.countUp.to - BEATS.countUp.from));
    for (const c of counts) {
      const dec = +c.dataset.dec;
      c.textContent = fmt(+c.dataset.to * k, dec);
    }

    // Picture
    if (mode === 'frames') renderFrames(vt); else seekTarget = vt;

    if (DEBUG) {
      hud.textContent =
        `T ${T.toFixed(2)}s / ${totalT().toFixed(2)}  video ${video.currentTime.toFixed(2)}s\n` +
        `mode ${mode}  screen x ${r[1].toFixed(1)}–${r[2].toFixed(1)}%  y ${r[3].toFixed(1)}–${r[4].toFixed(1)}%\n` +
        `title ${fs.toFixed(0)}px  seek ${median(seekTimes).toFixed(0)}ms`;
    }
  }

  /* ---- video scrubbing (rAF-throttled seeks) ---- */
  let seekTarget = 0, seekStart = 0;
  const seekTimes = [];
  const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };

  function seekLoop() {
    if (mode === 'video' && videoReady && !video.seeking && Math.abs(video.currentTime - seekTarget) > 0.012) {
      seekStart = performance.now();
      video.currentTime = seekTarget;
    }
  }
  video.addEventListener('seeked', () => {
    if (!seekStart) return;
    seekTimes.push(performance.now() - seekStart);
    if (seekTimes.length > 24) seekTimes.shift();
    seekStart = 0;
    // Choppy on this device? Fall back to key frames.
    if (seekTimes.length >= 12 && median(seekTimes) > 160 && innerWidth < 768) useFrames('slow seeks');
    if (poster.style.display !== 'none') poster.style.display = 'none';
  });

  function loadVideo() {
    const src = innerWidth < 768 ? video.dataset.srcMobile : video.dataset.srcDesktop;
    video.addEventListener('loadedmetadata', () => {
      D = video.duration || D;
      videoReady = true;
      // iOS needs one play() before seeks paint frames
      const p = video.play();
      if (p && p.then) p.then(() => video.pause()).catch(() => {});
      else video.pause();
      if (hasGSAP) ScrollTrigger.refresh();
      render(true);
    }, { once: true });
    video.addEventListener('error', () => useFrames('video error'), { once: true });
    video.src = src;
    video.load();
  }

  /* ---- key-frame fallback (crossfade + push-in scale) ---- */
  function useFrames(reason) {
    if (mode === 'frames' && frames[0].src) return;
    mode = 'frames';
    root.classList.add('mode-frames');
    frames.forEach((img) => { if (!img.src) img.src = img.dataset.src; });
    poster.style.display = 'none';
    if (DEBUG) console.info('[butaca] frames mode:', reason);
    render(true);
  }
  function renderFrames(vt) {
    let i = 0;
    while (i < FRAME_TIMES.length - 2 && vt >= FRAME_TIMES[i + 1]) i++;
    const local = clamp((vt - FRAME_TIMES[i]) / (FRAME_TIMES[i + 1] - FRAME_TIMES[i]));
    const a = smooth((local - 0.35) / 0.65);
    frames.forEach((img, j) => {
      if (j === i) { img.style.opacity = 1; img.style.transform = `scale(${1 + local * 0.1})`; }
      else if (j === i + 1) { img.style.opacity = a; img.style.transform = `scale(${0.96 + a * 0.04})`; }
      else img.style.opacity = 0;
    });
  }

  /* ---- measure Anton so the title width ≈ screen width ---- */
  function measureTitle() {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = '100px Anton';
    const w = ctx.measureText('BUTACA').width;
    if (w > 0) titleK = (w / 100) * 1.01 + 0.06; // + letter-spacing
    render(true);
  }

  /* ---- drivers ---- */
  function start() {
    layout();
    render(true);
    loadVideo();
    if (mode === 'frames') useFrames('forced');

    if (hasGSAP) {
      gsap.registerPlugin(ScrollTrigger);
      const state = { S: 0 };
      gsap.to(state, {
        S: () => totalS(),
        ease: 'none',
        scrollTrigger: { trigger: film, start: 'top top', end: 'bottom bottom', scrub: 0.5, invalidateOnRefresh: true },
        onUpdate: () => { T = sToT(state.S); render(); },
      });
      gsap.ticker.add(seekLoop);
    } else {
      // Fallback driver if the CDN is unreachable: same behaviour, native scroll + lerp
      let target = 0;
      const read = () => {
        const range = film.offsetHeight - innerHeight;
        target = sToT(clamp((scrollY - film.offsetTop) / range) * totalS());
      };
      addEventListener('scroll', read, { passive: true });
      read(); T = target;
      const tick = () => { T += (target - T) * 0.14; render(); seekLoop(); requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }
    initSmoothScroll(true);

    let rz;
    addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { layout(); render(true); }, 80); });
    if (document.fonts && document.fonts.load) document.fonts.load('100px Anton').then(measureTitle).catch(() => {});
    else measureTitle();
  }

  start();

  /* =========================================================
     Shared helpers
     ========================================================= */
  function initSmoothScroll(withFilm) {
    let lenis = null;
    if (window.Lenis && !reduceMotion) {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      if (withFilm && hasGSAP) {
        lenis.on('scroll', ScrollTrigger.update);
        gsap.ticker.add((t) => lenis.raf(t * 1000));
        gsap.ticker.lagSmoothing(0);
      } else {
        const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
        requestAnimationFrame(raf);
      }
    }
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      const id = a.getAttribute('href');
      if (id === '#') return;
      const el = id === '#top' ? document.body : document.querySelector(id);
      if (!el) return;
      e.preventDefault();
      // Land section headings just under the fixed nav instead of at the section's padded top
      const heading = id === '#top' ? null : el.querySelector('.section__title, .talk__title');
      const target = heading || el;
      const offset = heading ? -(document.querySelector('.nav').offsetHeight + 16) : 0;
      if (lenis) lenis.scrollTo(id === '#top' ? 0 : target, { duration: 1.6, offset });
      else window.scrollTo({ top: id === '#top' ? 0 : target.getBoundingClientRect().top + scrollY + offset, behavior: reduceMotion ? 'auto' : 'smooth' });
      history.replaceState(null, '', id);
      const focusTarget = id === '#demo' ? document.getElementById('f-cine') : null;
      if (focusTarget) setTimeout(() => focusTarget.focus({ preventScroll: true }), lenis ? 1700 : 600);
    });
  }

  /* ---- Isometric seat map (inline SVG) ---- */
  function initSeatMap() {
    const svgs = document.querySelectorAll('[data-seatmap]');
    if (!svgs.length) return;
    const NS = 'http://www.w3.org/2000/svg';
    const S = 14;
    const iso = (u, v, z) => [(u - v) * 0.866 * S, (u + v) * 0.5 * S - z * S * 0.85];
    const poly = (pts) => pts.map((p) => iso(...p).map((n) => n.toFixed(1)).join(',')).join(' ');
    const ROWS = 'ABCDEFGHIJ';
    const COLS = 16;
    const sel = { r: 7, c: 13 }; // H14
    const pal = {
      free: ['#5b6271', '#3d424e', '#33373f'],
      busy: ['#2a2e37', '#1f2229', '#1a1d23'],
      sel: ['#ff3355', '#D90429', '#9e0320'],
    };
    let g = '';
    const seats = [];
    for (let r = 0; r < ROWS.length; r++) {
      for (let c = 0; c < COLS; c++) {
        const u = c + (c >= 4 ? 0.9 : 0) + (c >= 12 ? 0.9 : 0);
        const v = r * 1.25;
        const isSel = r === sel.r && c === sel.c;
        const busy = !isSel && ((r * 7 + c * 11) % 9 < 3 || (r === 4 && c > 5 && c < 10));
        seats.push({ u, v, kind: isSel ? 'sel' : busy ? 'busy' : 'free' });
      }
    }
    seats.sort((a, b) => (a.u + a.v) - (b.u + b.v));
    for (const st of seats) {
      const [top, face, side] = pal[st.kind];
      const { u, v } = st;
      const P = (du, dv, z) => [u + du, v + dv, z];
      const cls = st.kind === 'sel' ? ' class="seat-sel"' : '';
      g += `<g${cls}>` +
        `<polygon points="${poly([P(.08, .06, .38), P(.92, .06, .38), P(.92, .74, .38), P(.08, .74, .38)])}" fill="${top}"/>` +
        `<polygon points="${poly([P(.92, .06, .38), P(.92, .74, .38), P(.92, .74, 0), P(.92, .06, 0)])}" fill="${side}"/>` +
        `<polygon points="${poly([P(.08, .74, 1.15), P(.92, .74, 1.15), P(.92, .94, 1.15), P(.08, .94, 1.15)])}" fill="${top}"/>` +
        `<polygon points="${poly([P(.08, .94, 1.15), P(.92, .94, 1.15), P(.92, .94, .1), P(.08, .94, .1)])}" fill="${face}"/>` +
        `<polygon points="${poly([P(.92, .74, 1.15), P(.92, .94, 1.15), P(.92, .94, .1), P(.92, .74, .1)])}" fill="${side}"/>` +
        `</g>`;
    }
    // screen line + row letters + pin over H14
    const uMax = 15 + 1.8 + 1;
    const [sx0, sy0] = iso(-0.4, -2.4, 0.9), [sx1, sy1] = iso(uMax, -2.4, 0.9);
    const screen = `<line x1="${sx0}" y1="${sy0}" x2="${sx1}" y2="${sy1}" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".9"/>` +
      `<line x1="${sx0}" y1="${sy0}" x2="${sx1}" y2="${sy1}" stroke="#ff4d6a" stroke-width="10" stroke-linecap="round" opacity=".18"/>`;
    const [lx, ly] = iso(uMax / 2, -3.6, 0.9);
    const label = `<text x="${lx}" y="${ly}" fill="#8D99AE" font-size="8" font-weight="700" letter-spacing="2" text-anchor="middle" transform="rotate(30 ${lx} ${ly})" font-family="Plus Jakarta Sans, sans-serif">PANTALLA</text>`;
    let letters = '';
    for (let r = 0; r < ROWS.length; r++) {
      const [tx, ty] = iso(-1.1, r * 1.25 + 0.5, 0);
      letters += `<text x="${tx}" y="${ty + 3}" fill="${r === sel.r ? '#ff3355' : '#59606e'}" font-size="8" font-weight="700" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif">${ROWS[r]}</text>`;
    }
    const su = 13 + 0.9 + 0.9 + 0.5, sv = sel.r * 1.25 + 0.5;
    const [px0, py0] = iso(su, sv, 1.15);
    const pinSvg = `<g class="seat-glow"><circle cx="${px0}" cy="${py0 - 4}" r="9" fill="#D90429" opacity=".35"/></g>` +
      `<line x1="${px0}" y1="${py0 - 4}" x2="${px0}" y2="${py0 - 26}" stroke="#fff" stroke-width="1" opacity=".7"/>` +
      `<rect x="${px0 - 17}" y="${py0 - 42}" width="34" height="17" rx="8.5" fill="#D90429"/>` +
      `<text x="${px0}" y="${py0 - 30}" fill="#fff" font-size="9" font-weight="700" text-anchor="middle" font-family="Plus Jakarta Sans, sans-serif">H14</text>`;
    const html = screen + label + letters + g + pinSvg;
    // bounds
    const corners = [iso(-1.6, -4.2, 0.9), iso(uMax + 0.4, -2.4, 1.2), iso(-1.6, 12.6, 0), iso(uMax + 0.4, 12.6, 0), [px0 - 20, py0 - 46]];
    const xs = corners.map((c) => c[0]), ys = corners.map((c) => c[1]);
    const minX = Math.min(...xs) - 4, minY = Math.min(...ys) - 4;
    const w = Math.max(...xs) - minX + 4, h = Math.max(...ys) - minY + 4;
    svgs.forEach((svg) => {
      svg.setAttribute('viewBox', `${minX.toFixed(1)} ${minY.toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}`);
      svg.setAttribute('width', w.toFixed(0));
      svg.setAttribute('height', h.toFixed(0));
      svg.innerHTML = html;
    });
  }

  /* ---- Benefits reel: one panel open, the rest fold into strips ---- */
  function initReel() {
    const reel = document.querySelector('[data-reel]');
    if (!reel) return;
    const panels = [...reel.querySelectorAll('.reel__panel')];
    const tabs = panels.map((p) => p.querySelector('.reel__tab'));
    const current = reel.querySelector('[data-reel-current]');
    const dotsWrap = reel.querySelector('[data-reel-dots]');
    const n = panels.length;
    let active = 0;
    reel.classList.add('reel--on');
    const dots = panels.map(() => dotsWrap.appendChild(document.createElement('span')));

    const set = (i, focus) => {
      active = (i + n) % n;
      panels.forEach((p, j) => {
        const on = j === active;
        p.classList.toggle('is-active', on);
        tabs[j].setAttribute('aria-expanded', String(on));
        p.querySelectorAll('.reel__body a').forEach((a) => (on ? a.removeAttribute('tabindex') : a.setAttribute('tabindex', '-1')));
      });
      current.textContent = String(active + 1).padStart(2, '0');
      dots.forEach((d, j) => d.classList.toggle('is-on', j === active));
      if (focus) tabs[active].focus();
    };

    panels.forEach((p, i) => p.addEventListener('click', (e) => {
      if (i !== active && !e.target.closest('a')) set(i);
    }));
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => set(i));
      t.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); set(i + 1, true); }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); set(i - 1, true); }
      });
    });
    reel.querySelector('[data-reel-prev]').addEventListener('click', () => set(active - 1));
    reel.querySelector('[data-reel-next]').addEventListener('click', () => set(active + 1));
    set(0);
  }

  /* ---- Integration cards: on touch screens, open each card as it comes into view ---- */
  function initFlow() {
    const cards = document.querySelectorAll('.flow__card');
    if (!cards.length || !('IntersectionObserver' in window) || matchMedia('(hover: hover)').matches) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => e.target.classList.toggle('is-open', e.intersectionRatio >= 0.6));
    }, { threshold: [0, 0.6, 1] });
    cards.forEach((c) => io.observe(c));
  }

  /* ---- Pilot metrics: staggered rows, drawn leaders and a count-up, once ---- */
  function initPilot() {
    const pilot = document.querySelector('[data-pilot]');
    if (!pilot || reduceMotion || !('IntersectionObserver' in window)) return;
    const rows = [...pilot.querySelectorAll('.pilot__list li')];
    const nums = rows.map((li) => li.querySelector('.pilot__num'));
    rows.forEach((li, i) => li.style.setProperty('--i', i));
    const write = (el, v) => { const n = Math.round(v); el.textContent = n === 0 ? '0 %' : `${el.dataset.sign}${n} %`; };
    nums.forEach((el) => write(el, 0));
    pilot.classList.add('pilot--anim');
    const easeOut = (t) => 1 - Math.pow(2, -10 * t); // exponential ease-out
    const io = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      pilot.classList.add('is-in');
      nums.forEach((el, i) => {
        const to = Number(el.dataset.to);
        const delay = i * 140 + 250, dur = 1100;
        const t0 = performance.now() + delay;
        const tick = (now) => {
          const t = Math.min(1, Math.max(0, (now - t0) / dur));
          write(el, to * (t === 1 ? 1 : easeOut(t)));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.35 });
    io.observe(pilot);
  }

  /* ---- Hablemos: one-line demo request (front-end only) ---- */
  function initForm() {
    const form = document.querySelector('[data-talk]');
    if (!form) return;
    const talk = form.closest('.talk');
    const msg = talk.querySelector('[data-talk-msg]');
    const done = talk.querySelector('[data-talk-done]');
    const fields = [...form.querySelectorAll('input, select')];
    const rules = {
      cine: (v) => (v.trim().length >= 2 ? '' : 'Contanos el nombre de tu cine.'),
      email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Revisá el email, parece incompleto.'),
      salas: (v) => (v ? '' : 'Elegí cuántas salas tiene tu cine.'),
    };
    const errorOf = (f) => rules[f.name](f.value);
    fields.forEach((f) => {
      f.setAttribute('aria-describedby', 'talk-msg');
      f.addEventListener(f.tagName === 'SELECT' ? 'change' : 'input', () => {
        if (f.getAttribute('aria-invalid') === 'true' && !errorOf(f)) {
          f.setAttribute('aria-invalid', 'false');
          const next = fields.find((x) => x.getAttribute('aria-invalid') === 'true');
          msg.textContent = next ? errorOf(next) : '';
        }
      });
    });
    msg.id = 'talk-msg';

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let first = null;
      fields.forEach((f) => {
        const bad = !!errorOf(f);
        f.setAttribute('aria-invalid', String(bad));
        if (bad && !first) first = f;
      });
      if (first) { msg.textContent = errorOf(first); first.focus(); return; }
      msg.textContent = '';
      const v = Object.fromEntries(fields.map((f) => [f.name, f.value.trim()]));
      talk.querySelector('[data-talk-done-title]').textContent = `¡Listo, ${v.cine}!`;
      talk.querySelector('[data-talk-done-txt]').textContent = `Te escribimos a ${v.email} para coordinar una demo (${v.salas}).`;
      talk.classList.add('is-sent');
      done.hidden = false;
      done.focus();
    });
    talk.querySelector('[data-talk-again]').addEventListener('click', () => {
      talk.classList.remove('is-sent');
      done.hidden = true;
      fields[0].focus();
    });
  }
})();
