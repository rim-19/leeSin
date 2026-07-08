/* ============================================================================
 *  audio.js  —  the ears of THE OP.
 *  · a synthesized sonar blip for every ping (pitch varies subtly)
 *  · a low meditative drone bed
 *  · optional microphone input: energy-flux beat detection fires pings,
 *    and the live level feeds the shader's shimmer.
 *  Everything is synthesized — no copyrighted audio anywhere.
 * ==========================================================================*/
let ctx = null, master = null, started = false;
let analyser = null, freq = null, micOn = false;
let fluxAvg = 0, lastBeat = 0, level = 0;

function ensure() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
}

export function start() {
  ensure();
  if (ctx.state === 'suspended') ctx.resume();
  if (started) return; started = true;

  // meditative drone: detuned sines through a slow-breathing lowpass
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300; lp.connect(master);
  const g = ctx.createGain(); g.gain.value = 0.11; g.connect(lp);
  [48, 48.3, 72].forEach((f) => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(); });
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.06;
  const lg = ctx.createGain(); lg.gain.value = 120; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();

  master.gain.setTargetAtTime(0.8, ctx.currentTime, 2.0);
}

/* sonar blip — a clean sine chirp with a whisper of noise */
export function blip(strength = 1) {
  if (!ctx || !started) return;
  const t = ctx.currentTime;
  const f0 = 640 + Math.random() * 120;
  const o = ctx.createOscillator(); o.type = 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.28);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22 * strength, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.55);
}

/* optional microphone — returns true if granted */
export async function enableMic() {
  ensure();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    const src = ctx.createMediaStreamSource(stream);
    analyser = ctx.createAnalyser(); analyser.fftSize = 512; analyser.smoothingTimeConstant = 0.7;
    freq = new Uint8Array(analyser.frequencyBinCount);
    src.connect(analyser); // NOT connected to output — no feedback loop
    micOn = true;
    return true;
  } catch (e) { console.warn('Mic unavailable:', e); return false; }
}
export function isMicOn() { return micOn; }

/* call per frame → { level 0..1, beat: bool } */
export function analyze(now) {
  if (!micOn || !analyser) { level *= 0.94; return { level, beat: false }; }
  analyser.getByteFrequencyData(freq);
  let bass = 0, total = 0; const nb = 12;
  for (let i = 1; i < nb; i++) bass += freq[i];
  for (let i = 0; i < freq.length; i++) total += freq[i];
  bass /= nb * 255; total /= freq.length * 255;
  level = total;
  const flux = Math.max(0, bass - fluxAvg);
  fluxAvg += (bass - fluxAvg) * 0.2;
  let beat = false;
  if (flux > 0.07 && (now - lastBeat) > 0.18) { beat = true; lastBeat = now; }
  return { level, beat };
}
