# Chi Sculptor — Eye of the Blind Monk

Sculpt a field of living chi with your bare hand. Tens of thousands of glowing
embers respond to your hand in real time (webcam + MediaPipe Hands), rendered in
Three.js with a GPU particle shader, bloom, and motion-blur trails.

## The moment

1. Click **BEGIN** (browsers need a click before camera + sound).
2. Raise your hand — the chi gathers and swirls around it, trailing as you move.
3. Make a **FIST** — the embers compress into a blinding hot core at your hand.
4. **Open your hand** — the core detonates: a fullscreen blast of chi, a flash,
   a boom, and a bloom flare.

That's it — one unforgettable interaction. Gather, clench, release.

## Run it

Webcam required (browsers only allow camera on `https://` or `localhost`).
Static site, no build step.

- **Hosted:** drop the folder on GitHub Pages / Vercel / Netlify, open the URL.
- **Locally:** `python -m http.server 8000` → `http://localhost:8000`

## Tuning & text

- **Feel** — `config.js`: `field.count` (how many embers), `field.attract` /
  `field.swirl` (how it gathers), `field.burstForce`, and the bloom / afterimage
  amounts. If it ever looks blown-out, lower `bloom.base` or `field.size`.
- **The closing line** — after a few blasts a single line fades in; edit it in
  **`messages.js`** (`finaleSequence`).

## Files

```
index.html    canvas + title/hint + BEGIN gate
style.css     minimal cinematic styling
config.js     particle-field, bloom, gesture tunables
messages.js   ← the one editable text line
scene.js      the GPU chi-field shader, bloom + motion-blur, camera
gestures.js   MediaPipe hand tracking (position + fist/open)
audio.js      synthesized ambient + impact boom (Web Audio)
main.js       BEGIN flow, gather/blast logic, render loop
```

CDN libraries: Three.js `0.160.0`, MediaPipe Hands `0.4.x`.
