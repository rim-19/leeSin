# Eye of the Blind Monk

A webcam hand-tracking game themed on League of Legends' **Lee Sin**. Your hands
*are* the weapons — the game reads them through your webcam (MediaPipe Hands) and
turns them into chi, rendered in Three.js with real bloom, custom shaders, and
GPU particles.

## How to play

A **webcam is required**, and browsers only grant camera access over `https://`
or `http://localhost`.

- **Open hand** → a sweeping chi aura that knocks orbs back (crowd control)
- **Closed fist** → a strike core that shatters orbs on contact (damage)
- **Orbs rush your core** at the center — hold them off. Killing them builds your
  **combo** and charges the dragon.
- When **Dragon** is charged, bring **both fists together** to unleash
  **Dragon's Rage** — a screen-clearing burst with shake and slow-mo.

It's continuous and forgiving: your core regenerates, there's no hard game-over,
and a short teach shows you the two hand states before play. Reach the final wave
(or the score threshold) and the game eases into a calm finale.

## Run it

- **Hosted (recommended):** drop this folder on any static host — GitHub Pages,
  Vercel, Netlify — and open the URL. No build step; all paths are relative.
- **Locally:**
  ```
  python -m http.server 8000      →  http://localhost:8000
  ```

If a CDN is blocked (some sandboxed previews do this), the page shows a message
explaining how to run it in a real browser.

## Editing the personal text

All prose lives in **`messages.js`** — the only file with words to change:

- `midGameNotes` — short lines that fade in during play
- `milestoneNotes` — lines tied to moments (first ultimate, combo x5, wave cleared)
- `finaleLetter` — the closing message shown in the calm finale

> Note: whatever you host is public — anyone with the URL can read `messages.js`.

Gameplay feel (hand sensitivity/smoothing, orb speed, wave difficulty, finale
trigger) lives in **`config.js`** — start with `hands.smoothing` and
`orbs.seekSpeed` if you want to tune it.

## Optional audio-reactive layer

On the intro screen you can load **your own local audio file**. A Web Audio
`AnalyserNode` drives bloom intensity and pulse timing off the beat. Nothing is
fetched or embedded — the file never leaves your machine.

## Files

```
index.html    page + CDN loading + fallback watchdog
style.css     HUD / intro / teach / finale styling
config.js     tunable thresholds, radii, timings, difficulty
messages.js   ← editable personal text (prose lives only here)
scene.js      Three.js setup, shaders, bloom, particles, hand cursors, FX
gestures.js   MediaPipe hand tracking + smoothing + open/fist state
abilities.js  chi combat, orb physics (Matter.js), scoring, waves, ultimate
audio.js      Web Audio analyser (optional)
main.js       game loop, HUD, teach, finale, orchestration
```

CDN libraries: Three.js `0.160.0`, MediaPipe Hands `0.4.x`, Matter.js `0.19.0`.

Performance: bloom renders at half resolution, hand tracking uses the lite model
throttled off the render thread, and hand positions are smoothed each frame — so
it stays fluid even though tracking runs at ~30fps.
