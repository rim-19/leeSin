/* ============================================================================
 *  gestures.js  —  MediaPipe Hands wiring + gesture recognition.
 *  Consumes the webcam <video>, tracks up to 2 hands (with landmark z-depth),
 *  mirrors X to match the selfie backdrop, and exposes:
 *    - handState[]      per-hand temporal state (position, velocity, timers)
 *    - analyzeHands()   call once per frame to refresh handState
 *    - predicates       isFist / isPointing / isOpenPalm / extendedCount / palmCenter
 *    - trial detectors  detectFlick / detectFistRelease / ... + resetDetectors
 *  Works on normalized [0..1] coords; world-space mapping lives in scene.js.
 * ==========================================================================*/
import { CFG } from './config.js';

const G = CFG.gesture;
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/* Landmark indices: 0 wrist; tips 4,8,12,16,20; pips 3,6,10,14,18; mcps 2,5,9,13,17 */
const TIP = [4, 8, 12, 16, 20], PIP = [3, 6, 10, 14, 18];

/* ── predicates ──────────────────────────────────────────────────────────*/
export function fingerExtended(lm, f) {
  const w = lm[0], tip = lm[TIP[f]], pip = lm[PIP[f]];
  if (f === 0) return dist2(tip, lm[0]) > dist2(lm[2], lm[0]) * 1.1; // thumb
  return dist2(tip, w) > dist2(pip, w) * 1.05;
}
export function extendedCount(lm) { let n = 0; for (let f = 0; f < 5; f++) if (fingerExtended(lm, f)) n++; return n; }
export function isFist(lm) { for (let f = 1; f < 5; f++) if (fingerExtended(lm, f)) return false; return true; }
export function isPointing(lm) {
  return fingerExtended(lm, 1) && !fingerExtended(lm, 2) && !fingerExtended(lm, 3) && !fingerExtended(lm, 4);
}
export function isOpenPalm(lm) { return extendedCount(lm) >= G.openPalmFingers; }
export function palmCenter(lm) {
  return { x: (lm[0].x + lm[9].x) / 2, y: (lm[0].y + lm[9].y) / 2, z: (lm[0].z + lm[9].z) / 2 };
}

/* ── per-hand temporal state ─────────────────────────────────────────────*/
function freshHandState() {
  return {
    present: false, lm: null,
    palm: { x: .5, y: .5, z: 0 }, prevPalm: { x: .5, y: .5, z: 0 },
    palmVel: { x: 0, y: 0, z: 0 }, idxVel: { x: 0, y: 0 }, prevIdx: null,
    fistSince: 0, wasFist: false, pointSince: 0, openSince: 0, releaseArmed: false,
  };
}
export const handState = [freshHandState(), freshHandState()];

/* ── MediaPipe wiring ────────────────────────────────────────────────────*/
let handsData = [];   // latest normalized+mirrored landmarks per hand
let hands = null, mpBusy = false, videoEl = null;

export function initHands(video) {
  videoEl = video;
  hands = new window.Hands({
    locateFile: (f) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${f}`,
  });
  hands.setOptions({
    maxNumHands: CFG.mediapipe.maxNumHands, modelComplexity: CFG.mediapipe.modelComplexity,
    minDetectionConfidence: CFG.mediapipe.minDetection, minTrackingConfidence: CFG.mediapipe.minTracking,
  });
  hands.onResults((res) => {
    const out = [];
    if (res.multiHandLandmarks) {
      for (const raw of res.multiHandLandmarks) {
        out.push({ lm: raw.map((p) => ({ x: 1 - p.x, y: p.y, z: p.z })) }); // mirror X
      }
    }
    handsData = out;
  });
}
export function getHandCount() { return handsData.length; }

export function pumpHands() {
  const tick = async () => {
    if (videoEl && !mpBusy && videoEl.readyState >= 2 && hands) {
      mpBusy = true;
      try { await hands.send({ image: videoEl }); } catch (e) { /* transient */ }
      mpBusy = false;
    }
    requestAnimationFrame(tick);
  };
  tick();
}

/* ── per-frame analysis: fill handState with positions/velocities/timers ──*/
export function analyzeHands(dt, now) {
  for (let i = 0; i < 2; i++) {
    const st = handState[i], hd = handsData[i];
    if (!hd) { st.present = false; st.lm = null; st.wasFist = false; st.fistSince = 0; continue; }
    const lm = hd.lm; st.present = true; st.lm = lm;
    const palm = palmCenter(lm);
    st.prevPalm = st.palm; st.palm = palm;
    const invdt = dt > 0 ? 1 / dt : 0;
    st.palmVel = {
      x: (palm.x - st.prevPalm.x) * invdt, y: (palm.y - st.prevPalm.y) * invdt, z: (palm.z - st.prevPalm.z) * invdt,
    };
    const idx = lm[8];
    if (st.prevIdx) st.idxVel = { x: (idx.x - st.prevIdx.x) * invdt, y: (idx.y - st.prevIdx.y) * invdt };
    st.prevIdx = { x: idx.x, y: idx.y };
    const fist = isFist(lm);
    if (fist && !st.wasFist) st.fistSince = now;
    if (!fist) st.fistSince = 0;
    st.wasFist = fist;
    st.pointSince = isPointing(lm) ? (st.pointSince || now) : 0;
    st.openSince = isOpenPalm(lm) ? (st.openSince || now) : 0;
  }
}

/* ── guided-trial detectors (forgiving thresholds) ───────────────────────*/
let det = {};
export function resetDetectors() { det = { prevDist: null, fistArmed: false }; }
resetDetectors();

export function detectFlick() {
  for (const st of handState)
    if (st.present && isPointing(st.lm) && Math.hypot(st.idxVel.x, st.idxVel.y) > G.trialFlickSpeed) return true;
  return false;
}
export function detectFistRelease() {
  for (const st of handState) {
    if (!st.present) continue;
    if (isFist(st.lm)) det.fistArmed = true;
    if (det.fistArmed && !isFist(st.lm) && extendedCount(st.lm) >= 3) { det.fistArmed = false; return true; }
  }
  return false;
}
export function detectPalmChest() {
  for (const st of handState)
    if (st.present && isOpenPalm(st.lm) && st.palm.y > (G.chestY - 0.03) && Math.abs(st.palm.x - 0.5) < (G.chestX + 0.04)) return true;
  return false;
}
export function detectPushApart() {
  const a = handState[0], b = handState[1];
  if (a.present && b.present && isOpenPalm(a.lm) && isOpenPalm(b.lm)) {
    const d = dist2(a.palm, b.palm);
    if (det.prevDist != null && (d - det.prevDist) > 0.02 && d > (G.pushApartMinDist + 0.04)) return true;
    det.prevDist = d;
  } else det.prevDist = null;
  return false;
}
export function detectFistsThrust() {
  const a = handState[0], b = handState[1];
  if (a.present && b.present && isFist(a.lm) && isFist(b.lm)) {
    if (dist2(a.palm, b.palm) < (G.fistsTogetherDist + 0.06)) det.fistArmed = true;
    const thrust = (a.palmVel.z + b.palmVel.z) < (G.thrustZ * 0.7) || (Math.abs(a.palmVel.y) + Math.abs(b.palmVel.y)) > (G.thrustY * 0.7);
    if (det.fistArmed && thrust) return true;
  }
  return false;
}
