/* ============================================================================
 *  audio.js  —  the audio-reactive rhythm layer.
 *  The player picks a LOCAL audio file (never fetched/embedded/named here). We:
 *    1. decode it (Web Audio decodeAudioData),
 *    2. run OFFLINE onset detection to build a beat chart synced to the track,
 *    3. play it back and expose currentTime as the song clock,
 *    4. keep a live AnalyserNode running for bloom/pulse reactivity.
 *  No track is referenced by name anywhere in code or UI.
 * ==========================================================================*/
import { CFG } from './config.js';

let audioCtx = null, analyser = null, freq = null, audioEl = null, mediaSrc = null;
let loaded = false, chart = [], duration = 0, playing = false;
let beat = 0, level = 0, fluxAvg = 0;

export function initAudioPicker(inputEl, statusEl) {
  inputEl.addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    statusEl.textContent = '♪ analysing ' + file.name.slice(0, 32) + '…';
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const buf = await audioCtx.decodeAudioData(await file.arrayBuffer());
      chart = detectOnsets(buf);
      duration = buf.duration;

      // playback element + live analyser for bloom reactivity
      if (!audioEl) { audioEl = new Audio(); }
      audioEl.src = URL.createObjectURL(file); audioEl.loop = false;
      if (!mediaSrc) {
        mediaSrc = audioCtx.createMediaElementSource(audioEl);
        analyser = audioCtx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0.75;
        freq = new Uint8Array(analyser.frequencyBinCount);
        mediaSrc.connect(analyser); analyser.connect(audioCtx.destination);
      }
      loaded = true;
      statusEl.textContent = '♪ ' + file.name.slice(0, 30) + ' — ' + chart.length + ' beats mapped';
    } catch (err) {
      console.warn('Audio decode failed:', err);
      statusEl.textContent = 'Could not read that file — try an .mp3';
      loaded = false;
    }
  });
}

/* ── offline onset detection: energy-novelty peak picking ────────────────*/
function detectOnsets(buf) {
  const hop = CFG.analysis.hop, sr = buf.sampleRate;
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const data0 = buf.getChannelData(0);
  const data1 = ch > 1 ? buf.getChannelData(1) : null;
  const frames = Math.floor(n / hop);
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let s = 0; const start = f * hop;
    for (let i = 0; i < hop; i++) {
      const j = start + i; if (j >= n) break;
      let v = data0[j]; if (data1) v = (v + data1[j]) * 0.5;
      s += v * v;
    }
    energy[f] = Math.sqrt(s / hop);
  }
  // novelty = positive energy increase
  const nov = new Float32Array(frames);
  for (let f = 1; f < frames; f++) nov[f] = Math.max(0, energy[f] - energy[f - 1]);
  // adaptive threshold peak picking
  const W = CFG.analysis.window, sens = CFG.analysis.sensitivity;
  const times = [];
  const secPerFrame = hop / sr;
  const minGapFrames = CFG.rhythm.minGap / secPerFrame;
  let lastPeak = -1e9;
  for (let f = 1; f < frames - 1; f++) {
    let sum = 0, cnt = 0;
    for (let k = f - W; k <= f + W; k++) { if (k < 0 || k >= frames) continue; sum += nov[k]; cnt++; }
    const thresh = (sum / cnt) * sens;
    if (nov[f] > thresh && nov[f] >= nov[f - 1] && nov[f] >= nov[f + 1] && (f - lastPeak) > minGapFrames) {
      times.push(f * secPerFrame); lastPeak = f;
    }
  }
  // build the note chart: offset by the lead-in, alternate catch/strike but
  // let a strong onset bias toward a strike (fist).
  const startAt = CFG.rhythm.startDelay;
  const out = [];
  for (let i = 0; i < times.length; i++) {
    const strong = nov[Math.round(times[i] / secPerFrame)] > 0; // all pass; alternate mostly
    out.push({ t: times[i] + startAt, type: (i % 2 === 0) ? 'catch' : 'strike' });
  }
  duration = buf.duration + startAt;
  return out;
}

/* ── fallback chart when no track is loaded ──────────────────────────────*/
export function fallbackChart() {
  const bpm = CFG.fallback.bpm, dur = CFG.fallback.duration;
  const spb = 60 / bpm; const out = [];
  let t = CFG.rhythm.startDelay, i = 0;
  while (t < dur) { out.push({ t, type: (i % 2 === 0) ? 'catch' : 'strike' }); t += spb; i++; }
  return out;
}

/* ── playback + clock ────────────────────────────────────────────────────*/
export function isLoaded() { return loaded; }
export function getChart() { return loaded ? chart : fallbackChart(); }
export function getDuration() { return loaded ? duration : CFG.fallback.duration; }
export function startPlayback() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  if (loaded && audioEl) { audioEl.currentTime = 0; audioEl.play().catch(() => {}); playing = true; }
}
export function getSongTime() { return (loaded && audioEl) ? audioEl.currentTime : 0; }
export function stopPlayback() { if (audioEl) { audioEl.pause(); } playing = false; }
export function resumeAudio() { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume(); }

/* ── live reactivity (bloom / pulse) ─────────────────────────────────────*/
export function updateAudio(dt) {
  beat = Math.max(0, beat - dt * 3);
  if (!loaded || !analyser) return;
  analyser.getByteFrequencyData(freq);
  let bass = 0, total = 0; const bassBins = 24;
  for (let i = 0; i < bassBins; i++) bass += freq[i];
  for (let i = 0; i < freq.length; i++) total += freq[i];
  bass /= bassBins * 255; total /= freq.length * 255;
  level = total;
  const flux = Math.max(0, bass - fluxAvg); fluxAvg += (bass - fluxAvg) * 0.25;
  if (flux > 0.06) beat = Math.min(1.5, beat + flux * 4);
}
export function getBeat() { return beat; }
export function getLevel() { return level; }
export function isAudioActive() { return loaded; }
