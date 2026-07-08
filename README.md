# THE OP · echo.toe — the blind monk sees what others cannot

A mock **TouchDesigner-style desktop app** built around Lee Sin's one defining
idea: *perception without eyes.* The viewport runs **ECHO** — an Ionian temple
that exists only as 60,000 points in darkness. Sonar pings expand as spherical
shells and light up whatever they pass through… then everything fades back to
black. You only ever see the world in pulses of sound.

## The app

- **Viewport (out1)** — the live ECHO render. **Click anywhere to ping** that
  spot; **SPACE** fires a heart-ping from the seated monk at the center.
- **Network editor** — a node graph (`audioIn → sonar → chi → bloom → out1`)
  with animated patch cords and live CHOP-style thumbnails. Drag nodes around;
  **click a node to load its parameters**.
- **Parameter panel** — every slider is live and glides smoothly while it plays:
  ping speed, shell width, decay, point density, chi hue, bloom…
- **AUTO-PING** — a tempo clock keeps the temple breathing on the beat.
- **ENABLE MIC** — optional: real sound drives sight. Beat detection fires pings;
  the live level makes the whole cloud shimmer. (Mic audio never leaves the page.)
- **PERFORM ▸** (or **F1**) — the chrome melts away into fullscreen sonar.
  **Esc** returns to the editor.

All audio is synthesized (sonar blips + a meditative drone). No Riot assets —
the temple, the monk, everything is procedural points.

## Run it

Static site, no build step. Sound needs one click (the OPEN PROJECT gate).

- **Hosted:** GitHub Pages / Vercel / Netlify → open the URL.
- **Locally:** `python -m http.server 8000` → `http://localhost:8000`

The mic is optional; everything works without it.

## Smoothness (how it stays at 60fps)

- The 60k-point temple is built **once** into a static GPU buffer and never
  touched again — a ping is just 4 floats in a uniform; all reveal math runs in
  the vertex shader, so the CPU does ~nothing per frame.
- Every parameter is **lerped** toward its slider target each frame, so drags
  and beat reactions glide instead of stepping.
- Small point sprites + capped pixel ratio + half-res bloom keep fill-rate low.
- If it ever looks washed out, lower `params.brightness` in `config.js` —
  stacked ping shells add up fast (that's why the default is 0.55).

## Files

```
index.html   app chrome: menubar, viewport, params, network editor, statusbar
style.css    dark pro-app styling, PERFORM-mode transitions
config.js    live params, slider ranges, the node graph, quotes
echo.js      the ECHO engine: procedural temple, sonar shader, bloom
audio.js     synthesized drone + sonar blips, optional mic beat-detection
main.js      the app shell: nodes, cords, sliders, transport, perform mode
```

CDN: Three.js `0.160.0` only.
