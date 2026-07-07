/* ============================================================================
 *  audio.js  —  optional audio-reactive layer.
 *  The player picks a LOCAL audio file (never fetched/embedded/named here);
 *  an AnalyserNode runs live FFT + a simple spectral-flux beat detector.
 *  Exposes getBeat()/getLevel() which main.js maps onto bloom + sigil/particle
 *  pulse. No track is referenced by name anywhere in the code or UI.
 * ==========================================================================*/
import { lerp } from './scene.js';

let audioCtx = null, analyser = null, data = null, audioEl = null;
let active = false, beat = 0, level = 0, fluxAvg = 0;

export function initAudioPicker(inputEl, statusEl) {
  inputEl.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    if (!audioEl) { audioEl = new Audio(); audioEl.loop = true; }
    audioEl.src = url;
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const src = audioCtx.createMediaElementSource(audioEl);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.75;
    data = new Uint8Array(analyser.frequencyBinCount);
    src.connect(analyser); analyser.connect(audioCtx.destination);
    active = true;
    statusEl.textContent = '♪ ' + file.name.slice(0, 40) + ' — reactive layer ON';
    audioEl.play().catch(() => {});
  });
}

// Browsers suspend AudioContext until a user gesture; call on "Lock In".
export function resumeAudio() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  if (audioEl && active) audioEl.play().catch(() => {});
}

export function updateAudio(dt) {
  beat = Math.max(0, beat - dt * 3);
  if (!active || !analyser) return;
  analyser.getByteFrequencyData(data);
  let bass = 0, total = 0; const bassBins = 24;
  for (let i = 0; i < bassBins; i++) bass += data[i];
  for (let i = 0; i < data.length; i++) total += data[i];
  bass /= bassBins * 255; total /= data.length * 255;
  level = total;
  const flux = Math.max(0, bass - fluxAvg);
  fluxAvg = lerp(fluxAvg, bass, 0.25);
  if (flux > 0.06) beat = Math.min(1.5, beat + flux * 4);
}

export function getBeat() { return beat; }
export function getLevel() { return level; }
export function isAudioActive() { return active; }
