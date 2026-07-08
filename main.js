/* ============================================================================
 *  main.js  —  Chi Sculptor. Minimal on purpose: BEGIN → webcam + tracking →
 *  sculpt the chi field with your hand → fist to gather, open to blast.
 * ==========================================================================*/
import * as SCENE from './scene.js';
import * as GES from './gestures.js';
import * as AUDIO from './audio.js';
import { CFG } from './config.js';
import * as MSG from './messages.js';

const { THREE } = SCENE;
const $ = (id) => document.getElementById(id);
window.__eyeStarted = true;

const video = $('webcam');
let last = performance.now() / 1000, time = 0;
let prevFist = false, burstCd = 0, bursts = 0, started = false;

/* ── webcam ──────────────────────────────────────────────────────────────*/
async function initWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user' }, audio: false });
    video.srcObject = stream; await video.play();
    const tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.SRGBColorSpace; SCENE.setVideoTexture(tex);
    return true;
  } catch (e) { console.warn('Webcam unavailable:', e); return false; }
}

/* ── begin ───────────────────────────────────────────────────────────────*/
async function begin() {
  $('begin-btn').disabled = true;
  AUDIO.startAmbient();
  const ok = await initWebcam();
  GES.initHands(video); GES.pumpHands();
  $('loader').style.display = 'none';
  started = true;
  // title → hint
  const title = $('title'); title.classList.add('show');
  setTimeout(() => title.classList.remove('show'), 3200);
  setTimeout(() => { $('hint').textContent = ok ? 'Raise your hand · make a FIST to gather · OPEN to blast' : 'No webcam — allow camera access and reload'; $('hint').classList.add('show'); }, 3400);
}

/* ── loop ────────────────────────────────────────────────────────────────*/
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now() / 1000; let dt = Math.min(0.05, now - last); last = now; time += dt;
  if (burstCd > 0) burstCd -= dt;

  if (started) {
    GES.analyzeHands();
    const st = GES.handState[0];
    const gather = st.present ? (st.fist ? 1.0 : st.open ? 0.4 : 0.6) : 0;
    SCENE.setHand(st.present, st.x, st.y, gather);

    // fist → open release = blast
    if (st.present && st.open && prevFist && burstCd <= 0) {
      SCENE.triggerBurst(); AUDIO.impactBoom(); burstCd = 0.7; bursts++;
      if (bursts === 1) { const h = $('hint'); h.textContent = 'again — gather, then open'; }
      if (bursts === 4) { showClosing(); }
    }
    prevFist = st.present && st.fist;
  }

  SCENE.update(dt, time);
  const f = $('flash'); if (f) f.style.opacity = String(Math.min(1, SCENE.getFlash()));
  SCENE.render();
}

/* ── a single quiet closing line (optional personal beat) ────────────────*/
let closed = false;
function showClosing() {
  if (closed) return; closed = true;
  const c = $('closing'); c.textContent = MSG.finaleSequence[MSG.finaleSequence.length - 1] || '';
  c.classList.add('show');
  $('hint').classList.remove('show');
}

$('title').textContent = 'EYE OF THE BLIND MONK';
$('begin-btn').addEventListener('click', begin);
loop();
