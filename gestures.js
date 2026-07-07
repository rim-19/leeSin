/* ============================================================================
 *  gestures.js  —  MediaPipe Hands wiring, reduced to what direct play needs:
 *  robust presence, a smoothed palm position (fluid between tracking frames),
 *  and a stable open/fist state with hysteresis. No finicky discrete-gesture
 *  recognition — the hands ARE the weapons, so the only "state" is open vs fist.
 *
 *  Exposes handState[i] = { present, x, y, z (smoothed normalized+depth),
 *  open, fist, openAmount, justClosed }, plus analyzeHands() (call every render
 *  frame — it does the smoothing) and bothFistsTogether() for the ultimate.
 * ==========================================================================*/
import { CFG } from './config.js';

const H = CFG.hands;
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const TIP = [4, 8, 12, 16, 20], PIP = [3, 6, 10, 14, 18];

function fingerExtended(lm, f) {
  const w = lm[0], tip = lm[TIP[f]], pip = lm[PIP[f]];
  if (f === 0) return dist2(tip, lm[0]) > dist2(lm[2], lm[0]) * 1.1;
  return dist2(tip, w) > dist2(pip, w) * 1.05;
}
function extendedCount(lm) { let n = 0; for (let f = 0; f < 5; f++) if (fingerExtended(lm, f)) n++; return n; }
function palmCenter(lm) { return { x: (lm[0].x + lm[9].x) / 2, y: (lm[0].y + lm[9].y) / 2, z: (lm[0].z + lm[9].z) / 2 }; }

function fresh() {
  return {
    present: false, x: 0.5, y: 0.5, z: 0, init: false,
    open: true, fist: false, openAmount: 1, justClosed: false,
  };
}
export const handState = [fresh(), fresh()];

/* ── MediaPipe wiring (lite model, throttled off the render loop) ─────────*/
let handsData = [], hands = null, mpBusy = false, videoEl = null, lastSend = 0;

export function initHands(video) {
  videoEl = video;
  hands = new window.Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}` });
  hands.setOptions({
    maxNumHands: CFG.mediapipe.maxNumHands, modelComplexity: CFG.perf.modelComplexity,
    minDetectionConfidence: CFG.mediapipe.minDetection, minTrackingConfidence: CFG.mediapipe.minTracking,
  });
  hands.onResults((res) => {
    const out = [];
    if (res.multiHandLandmarks) for (const raw of res.multiHandLandmarks)
      out.push({ lm: raw.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })) }); // mirror X (selfie)
    handsData = out;
  });
}
export function getHandCount() { return handsData.length; }

export function pumpHands() {
  const minGap = 1000 / CFG.perf.trackFps;
  const tick = async () => {
    const t = performance.now();
    if (videoEl && hands && !mpBusy && videoEl.readyState >= 2 && (t - lastSend) >= minGap) {
      mpBusy = true; lastSend = t;
      try { await hands.send({ image: videoEl }); } catch (e) { /* transient */ }
      mpBusy = false;
    }
    requestAnimationFrame(tick);
  };
  tick();
}

/* ── per-frame: match tracked hands to slots, smooth, resolve open/fist ───*/
export function analyzeHands() {
  // Greedy slot assignment by nearest previous position, so a hand keeps its
  // color/trail instead of swapping when MediaPipe reorders detections.
  const used = [false, false];
  for (let i = 0; i < 2; i++) {
    const st = handState[i];
    let best = -1, bd = 1e9;
    for (let k = 0; k < handsData.length; k++) {
      if (used[k]) continue;
      const p = palmCenter(handsData[k].lm);
      const d = st.init ? dist2(p, st) : Math.abs(k - i) * 0.001;
      if (d < bd) { bd = d; best = k; }
    }
    if (best < 0) { st.present = false; st.justClosed = false; continue; }
    used[best] = true;
    const lm = handsData[best].lm, p = palmCenter(lm);
    const s = H.smoothing;
    if (!st.init) { st.x = p.x; st.y = p.y; st.z = p.z; st.init = true; }
    st.x += (p.x - st.x) * s; st.y += (p.y - st.y) * s; st.z += (p.z - st.z) * s;
    st.present = true; st.lm = lm;
    const amt = extendedCount(lm) / 5;
    st.openAmount += (amt - st.openAmount) * 0.5;
    const wasFist = st.fist;
    if (st.openAmount > H.openThresh) { st.open = true; st.fist = false; }
    else if (st.openAmount < H.fistThresh) { st.open = false; st.fist = true; }
    st.justClosed = st.fist && !wasFist;
  }
}

export function bothFistsTogether() {
  const a = handState[0], b = handState[1];
  return a.present && b.present && a.fist && b.fist && dist2(a, b) < CFG.ult.fistsTogether;
}

/* ── trial detectors (short teach: hold open, then make a fist) ───────────*/
export function anyHandOpen() { return handState.some((s) => s.present && s.open); }
export function anyHandFist() { return handState.some((s) => s.present && s.fist); }
