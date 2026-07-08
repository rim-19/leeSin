/* ============================================================================
 *  gestures.js  —  MediaPipe Hands: smoothed cursor + pinch / fist / open palm.
 *    pinch  → Sonic Wave (Q)      fist → Resonating Strike (Q2)
 *    open   → Dragon's Rage (R)
 *  handState[i] = { present, x,y,z (smoothed normalized), open, fist,
 *                   pinch, pinchAmt, justPinched, openAmount }
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
// palm size, to normalize pinch distance across depth
function palmSpan(lm) { return dist2(lm[0], lm[9]) || 0.001; }

function fresh() {
  return { present: false, x: 0.5, y: 0.5, z: 0, init: false, open: true, fist: false, pinch: false, pinchAmt: 0, justPinched: false, openAmount: 1 };
}
export const handState = [fresh(), fresh()];

let handsData = [], hands = null, mpBusy = false, videoEl = null, lastSend = 0;

export function initHands(video) {
  videoEl = video;
  hands = new window.Hands({ locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}` });
  hands.setOptions({ maxNumHands: CFG.mediapipe.maxNumHands, modelComplexity: CFG.perf.modelComplexity, minDetectionConfidence: CFG.mediapipe.minDetection, minTrackingConfidence: CFG.mediapipe.minTracking });
  hands.onResults((res) => {
    const out = [];
    if (res.multiHandLandmarks) for (const raw of res.multiHandLandmarks) out.push({ lm: raw.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })) });
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
      try { await hands.send({ image: videoEl }); } catch (e) {}
      mpBusy = false;
    }
    requestAnimationFrame(tick);
  };
  tick();
}

export function analyzeHands() {
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
    if (best < 0) { st.present = false; st.justPinched = false; continue; }
    used[best] = true;
    const lm = handsData[best].lm, p = palmCenter(lm), s = H.smoothing;
    if (!st.init) { st.x = p.x; st.y = p.y; st.z = p.z; st.init = true; }
    st.x += (p.x - st.x) * s; st.y += (p.y - st.y) * s; st.z += (p.z - st.z) * s;
    st.present = true; st.lm = lm;

    // pose
    const amt = extendedCount(lm) / 5;
    st.openAmount += (amt - st.openAmount) * 0.5;
    if (st.openAmount > H.openThresh) { st.open = true; st.fist = false; }
    else if (st.openAmount < H.fistThresh) { st.open = false; st.fist = true; }

    // pinch (thumb–index) normalized by palm span
    const pd = dist2(lm[4], lm[8]) / palmSpan(lm);
    st.pinchAmt = pd;
    const wasPinch = st.pinch;
    if (!st.pinch && pd < H.pinchOn) st.pinch = true;
    else if (st.pinch && pd > H.pinchOff) st.pinch = false;
    st.justPinched = st.pinch && !wasPinch;
  }
}

export function anyOpen() { return handState.some((s) => s.present && s.open); }
export function anyFist() { return handState.some((s) => s.present && s.fist); }
export function anyPinch() { return handState.some((s) => s.present && s.pinch); }
