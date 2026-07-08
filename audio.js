/* ============================================================================
 *  audio.js  —  synthesized ambient (no copyrighted track).
 *  A low temple drone + slow filtered-noise wind, plus an impact boom for the
 *  landing kick and Dragon's Rage. Must be started from a user gesture.
 * ==========================================================================*/
let ctx = null, master = null, started = false, windGain = null;

function ensure() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  master = ctx.createGain(); master.gain.value = 0.0; master.connect(ctx.destination);
}

export function startAmbient() {
  ensure();
  if (ctx.state === 'suspended') ctx.resume();
  if (started) return; started = true;

  // low drone: two detuned oscillators through a gentle lowpass + tremolo
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.Q.value = 0.7;
  lp.connect(master);
  const droneGain = ctx.createGain(); droneGain.gain.value = 0.16; droneGain.connect(lp);
  [55, 55.4, 82.5].forEach((f, i) => { const o = ctx.createOscillator(); o.type = i === 2 ? 'triangle' : 'sawtooth'; o.frequency.value = f; o.connect(droneGain); o.start(); });
  const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08; const lfoG = ctx.createGain(); lfoG.gain.value = 0.05; lfo.connect(lfoG); lfoG.connect(droneGain.gain); lfo.start();

  // wind: white noise through a slowly sweeping bandpass
  const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate); const dch = buf.getChannelData(0);
  for (let i = 0; i < dch.length; i++) dch[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource(); noise.buffer = buf; noise.loop = true;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.6;
  windGain = ctx.createGain(); windGain.gain.value = 0.05;
  noise.connect(bp); bp.connect(windGain); windGain.connect(master); noise.start();
  const wl = ctx.createOscillator(); wl.frequency.value = 0.05; const wlg = ctx.createGain(); wlg.gain.value = 300; wl.connect(wlg); wlg.connect(bp.frequency); wl.start();

  // fade master in
  master.gain.setTargetAtTime(0.9, ctx.currentTime, 1.5);
}

export function impactBoom() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
  const g = ctx.createGain(); g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.75);
  // noise crack
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate); const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
  const n = ctx.createBufferSource(); n.buffer = buf; const ng = ctx.createGain(); ng.gain.value = 0.5; n.connect(ng); ng.connect(master); n.start(t);
}

export function fadeOut(sec) { if (master && ctx) master.gain.setTargetAtTime(0.35, ctx.currentTime, sec || 2); }
export function resumeAudio() { if (ctx && ctx.state === 'suspended') ctx.resume(); }
