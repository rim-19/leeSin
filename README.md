# Eye of the Blind Monk

A webcam hand-tracking game themed on League of Legends' **Lee Sin**. Your hands
are the controller: the game reads them through your webcam (MediaPipe Hands) and
turns gestures into Lee Sin's abilities, rendered in Three.js with real bloom,
custom chi-energy shaders, and GPU particles.

## Play

A **webcam is required**, and browsers only grant camera access over `https://`
or `http://localhost`.

- **Hosted (recommended):** drop this folder on any static host — GitHub Pages,
  Vercel, Netlify — and open the URL. No build step, all paths are relative.
- **Locally:** serve the folder and open localhost:
  ```
  python -m http.server 8000      →  http://localhost:8000
  ```

If a CDN is blocked (some sandboxed previews do this), the page shows a message
explaining how to run it in a real browser.

## Gestures

| Ability | Gesture |
| --- | --- |
| **Q · Sonic Wave** | point your index finger and flick it forward |
| **Q2 · Resonating Strike** | within 2s of a Sonic Wave: make a fist, hold, then open your hand |
| **W · Safeguard** | bring an open palm to your chest |
| **E · Tempest** | push both open palms apart |
| **R · Dragon's Rage** | bring both fists together, then thrust forward |

A **mandatory guided trial** teaches each gesture with a ghost-hand demo before
free play — no ability can be used until you've performed it once.

## Editing the personal text

All prose lives in **`messages.js`** — the only file with words to change:

- `midGameNotes` — short lines that fade in during play
- `milestoneNotes` — lines tied to moments (first ultimate, combo x5, wave cleared)
- `finaleLetter` — the closing message shown in the calm finale

Gameplay feel (cooldowns, gesture sensitivity, wave difficulty, finale trigger)
lives in **`config.js`**.

## Optional audio-reactive layer

On the intro screen you can load **your own local audio file**. A Web Audio
`AnalyserNode` drives bloom intensity and sigil/particle pulses off the beat.
Nothing is fetched or embedded — the file never leaves your machine.

## Files

```
index.html    page + CDN loading + fallback watchdog
style.css     HUD / intro / trial / finale styling
config.js     tunable thresholds, cooldowns, timings
messages.js   ← editable personal text (prose lives only here)
scene.js      Three.js setup, shaders, bloom, particles, FX
gestures.js   MediaPipe hand tracking + gesture recognition
abilities.js  ability effects, orb physics (Matter.js), scoring, waves
audio.js      Web Audio analyser (optional)
main.js       game loop, HUD, guided trial, finale, orchestration
```

CDN libraries: Three.js `0.160.0`, MediaPipe Hands `0.4.x`, Matter.js `0.19.0`.
