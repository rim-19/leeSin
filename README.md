# Eye of the Blind Monk

A webcam hand-tracking **rhythm game** themed on League of Legends' **Lee Sin**.
The game reads your hands through your webcam (MediaPipe Hands) and turns them
into chi, rendered in Three.js with real bloom, custom shaders, and GPU particles.

## How to play

A **webcam is required**, and browsers only grant camera access over `https://`
or `http://localhost`.

Chi-orbs flow inward to a ring at the center in time with the music:

- **Blue note → OPEN PALM** (catch) as it lands on the ring
- **Red note → FIST** (strike) as it lands on the ring

Nail the timing for **Perfect / Good**; miss the window and your **combo** breaks.
Combo drives a score multiplier, streaks reveal the personal messages, and the
song ending blooms into the finale letter. A short teach shows the two hand
states before play.

**Load your own audio** on the intro screen and the game decodes it and runs
offline onset detection to build a note-chart mapped to *that track's* beats.
No track loaded → a steady fallback tempo so it still plays. The file stays on
your machine — nothing is uploaded.

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

Gameplay feel lives in **`config.js`** — if timing feels too strict, widen
`rhythm.perfectWindow` / `rhythm.goodWindow`; if the chart is too dense or too
sparse, tune `analysis.sensitivity` and `rhythm.minGap`.

## Audio-reactive layer

Loading a track does two things: (1) offline **onset detection** builds the
note-chart from the song's beats, and (2) a live Web Audio `AnalyserNode` drives
bloom intensity and sigil/particle pulses off the music while you play. Nothing
is fetched or embedded — the file never leaves your machine.

## Files

```
index.html    page + CDN loading + fallback watchdog
style.css     HUD / intro / teach / finale styling
config.js     tunable timing windows, chart sensitivity, difficulty
messages.js   ← editable personal text (prose lives only here)
scene.js      Three.js setup, shaders, bloom, particles, hand cursors, hit-ring
gestures.js   MediaPipe hand tracking + smoothing + open/fist state
abilities.js  Chi Rhythm engine: notes, timing judgment, combo/score
audio.js      Web Audio: decode + offline onset detection + playback clock
main.js       game loop, HUD, teach, finale, orchestration
```

CDN libraries: Three.js `0.160.0`, MediaPipe Hands `0.4.x`.

Performance: bloom renders at half resolution, hand tracking uses the lite model
throttled off the render thread, and hand positions are smoothed each frame — so
it stays fluid even though tracking runs at ~30fps.
