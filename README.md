# Eye of the Blind Monk — a cinematic Lee Sin experience

A cinematic, League-of-Legends-style interactive web experience for **Lee Sin**,
with webcam **hand-tracking**. Rendered in Three.js with a procedural Ionia-temple
atmosphere (godray light shafts, drifting embers, fog, bloom, motion-blur), GSAP
cinematics, and synthesized ambient audio.

## The experience

1. **Opening** — black screen → *"The blind monk sees what others cannot."* → the
   temple reveals itself → a kick-impact shockwave with dust, camera shake and a boom.
2. **Interactive** — your webcam tracks your hand and drives Lee Sin's chi:
   - **Move hand** → the chi cursor follows you
   - **Pinch** → Sonic Wave (Q) — blue projectile + shockwave
   - **Fist** → Resonating Strike — dash streak + motion blur
   - **Clench then open your palm** → Dragon's Rage (R) — energy burst + shake + flash
3. **Finale** — press **Enter Summoner's Rift**: the scene calms, lanterns glow, and
   *"Every champion needs a worthy teammate."* → *"Thank you for always being my MVP."*
   fade in before it fades to black.

## Run it

A **webcam is required** (browsers only allow camera on `https://` or `localhost`).
Static site, no build step.

- **Hosted:** drop the folder on GitHub Pages / Vercel / Netlify and open the URL.
- **Locally:** `python -m http.server 8000` → `http://localhost:8000`

Click **BEGIN** to grant camera + sound (browsers require a click before audio/webcam).

## Make it yours

- **Text** — everything is in **`messages.js`**: the summoner name, the hero quote,
  the love card, and the two finale lines.
- **Art (optional)** — drop into `assets/`:
  - `assets/leesin.png` — Lee Sin splash for the hero (a glow shows without it)
  - `assets/photo.jpg` — the photo in the polaroid on the love card
- **Feel** — `config.js` holds palette, gesture thresholds, cooldowns, and the
  cinematic timings.

> **Note:** what you host is public — anyone with the URL can read `messages.js`.

## Honest scope

I can't embed Riot's official Lee Sin art or a rigged 3D model, so **Lee Sin is
shown via the splash image you provide** (with an energy-glow fallback), and the
"kick / bow" beats are cinematic light-and-dust moments rather than a puppeteered
character. Everything else — atmosphere, UI, hand-driven ability VFX, the opening
and finale — is real and self-contained.

## Files

```
index.html    the League-style landing page + cinematic overlays + CDN loads
style.css     premium League styling (gold / pink / temple)
config.js     palette, gesture thresholds, cooldowns, cinematic timings
messages.js   ← editable text (prose lives only here)
scene.js      Three.js: temple atmosphere, VFX, bloom + motion-blur, camera
gestures.js   MediaPipe hand tracking: cursor + pinch / fist / open palm
abilities.js  maps gestures → ability VFX (Sonic Wave / dash / Dragon's Rage)
audio.js      synthesized ambient drone + wind + impact boom (Web Audio)
main.js       cinematic sequence (GSAP), UI wiring, render loop
```

CDN libraries: Three.js `0.160.0`, MediaPipe Hands `0.4.x`, GSAP `3.12`.
