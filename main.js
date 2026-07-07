/* ============================================================================
 *  main.js  —  orchestration for Chi Rhythm: webcam, HUD, short teach, song
 *  playback + clock, finale, note cadence, and the render loop. Hand positions
 *  are smoothed each frame so play feels fluid despite ~30fps tracking.
 * ==========================================================================*/
import * as SCENE from './scene.js';
import * as GES from './gestures.js';
import * as AB from './abilities.js';
import * as AUDIO from './audio.js';
import { CFG } from './config.js';
import { midGameNotes, milestoneNotes, finaleLetter } from './messages.js';

const { THREE } = SCENE;
const $ = (id) => document.getElementById(id);
const clamp = SCENE.clamp, lerp = SCENE.lerp;
window.__eyeStarted = true;

const video = $('webcam');
const el = {
  hud: $('hud'), score: $('score'), combo: $('combo'), mult: $('mult'), acc: $('acc'),
  progFill: $('prog-fill'), judge: $('judge'),
  coach: $('coach'), note: $('note'), fps: $('fps-hint'), frame: $('frame'),
  intro: $('intro'), trialPanel: $('trial-panel'), trialSkip: $('trial-skip'),
  finale: $('finale'), finaleText: $('finale-text'),
};
const chips = { open: $('chip-open'), fist: $('chip-fist') };

/* ── HUD ─────────────────────────────────────────────────────────────────*/
let lastCombo = 0;
function refreshHud() {
  el.score.textContent = AB.Game.score;
  el.combo.textContent = AB.Game.combo;
  el.mult.textContent = 'x' + AB.Game.mult;
  el.acc.textContent = AB.Game.accuracy + '%';
  el.progFill.style.width = (AB.Game.progress * 100) + '%';
  if (AB.Game.combo !== lastCombo) {
    if (AB.Game.combo > lastCombo) { el.combo.parentElement.classList.remove('pop'); void el.combo.offsetWidth; el.combo.parentElement.classList.add('pop'); }
    lastCombo = AB.Game.combo;
  }
}
function flashChip(c) { const e = chips[c]; if (!e) return; e.classList.add('fired'); clearTimeout(e._t); e._t = setTimeout(() => e.classList.remove('fired'), 220); }
let judgeTimer = 0;
function showJudge(j) {
  el.judge.textContent = j.toUpperCase();
  el.judge.className = 'show ' + j;
  judgeTimer = 0.6;
}

let coachTimer = 0;
function coach(text, hold = 3) { if (!text) { el.coach.classList.remove('show'); coachTimer = 0; return; } el.coach.textContent = text; el.coach.classList.add('show'); coachTimer = hold; }

/* ── personal messages ───────────────────────────────────────────────────*/
let noteTimer = SCENE.randRange(CFG.notes.intervalMin, CFG.notes.intervalMax), noteIdx = 0;
const shownMilestones = {};
function showNote(text) { if (!text) return; el.note.textContent = text; el.note.classList.add('show'); clearTimeout(el.note._t); el.note._t = setTimeout(() => el.note.classList.remove('show'), CFG.notes.holdMs); }
function nextAmbientNote() { showNote(midGameNotes[noteIdx % midGameNotes.length]); noteIdx++; noteTimer = SCENE.randRange(CFG.notes.intervalMin, CFG.notes.intervalMax); }
function milestoneNote(key) { if (key === 'firstUltimate') { if (shownMilestones[key]) return; shownMilestones[key] = true; } showNote(milestoneNotes[key] || midGameNotes[noteIdx++ % midGameNotes.length]); }

function handleEvents() {
  for (const ev of AB.drainEvents()) {
    if (ev.type === 'fired') flashChip(ev.ab);
    else if (ev.type === 'judgment') showJudge(ev.j);
    else if (ev.type === 'coach') coach(ev.text, ev.hold);
    else if (ev.type === 'milestone') milestoneNote(ev.key);
    else if (ev.type === 'finale') enterFinale();
  }
}

/* ── short teach (catch = open, strike = fist) ───────────────────────────*/
const TEACH = [
  { kind: 'open', name: 'Catch', chip: 'open', desc: 'Hold an OPEN PALM near the center. Blue chi notes are caught with an open hand.', detect: GES.anyHandOpen, hold: 0.5 },
  { kind: 'fist', name: 'Strike', chip: 'fist', desc: 'Now make a FIST. Red chi notes are struck with a closed fist.', detect: GES.anyHandFist, hold: 0.35 },
];
let trialActive = false, tIndex = 0, tDemo = 0, tHeld = 0;
function buildPips() { const p = $('trial-pips'); p.innerHTML = ''; TEACH.forEach(() => { const d = document.createElement('div'); d.className = 'trial-pip'; p.appendChild(d); }); }
function updatePips() { const pips = $('trial-pips').children; for (let i = 0; i < pips.length; i++) pips[i].className = 'trial-pip' + (i < tIndex ? ' done' : i === tIndex ? ' active' : ''); }
function loadStep() {
  const s = TEACH[tIndex];
  $('trial-step').textContent = 'Learn ' + (tIndex + 1) + ' / ' + TEACH.length;
  $('trial-name').textContent = s.name;
  $('trial-desc').textContent = s.desc;
  const st = $('trial-status'); st.textContent = 'Try it…'; st.classList.remove('done');
  updatePips(); tDemo = 0; tHeld = 0;
}
function beginTrial() { trialActive = true; tIndex = 0; SCENE.showHitRing(false); el.trialPanel.classList.add('show'); el.trialSkip.style.display = 'block'; buildPips(); loadStep(); }
function advance() {
  const s = TEACH[tIndex]; chips[s.chip].classList.add('learned');
  const st = $('trial-status'); st.textContent = '✓ ' + s.name + ' learned'; st.classList.add('done');
  SCENE.particles.burst(0, 0, 40, { color: [0.4, 0.9, 1], speed: SCENE.randRange(3, 7) }); SCENE.bumpSigilPulse(0.7);
  tIndex++;
  if (tIndex >= TEACH.length) setTimeout(endTrial, 800); else setTimeout(loadStep, 850);
}
function endTrial() { trialActive = false; SCENE.hideGhost(); el.trialPanel.classList.remove('show'); el.trialSkip.style.display = 'none'; startSong(); }
function skipStep() { chips[TEACH[tIndex].chip].classList.add('learned'); tIndex++; if (tIndex >= TEACH.length) endTrial(); else loadStep(); }
function updateTrial(dt) {
  if (!trialActive) return;
  const s = TEACH[tIndex]; tDemo += dt; SCENE.poseGhost((tDemo % 2.0) / 2.0, s.kind);
  if (tDemo > 0.8 && s.detect()) { tHeld += dt; $('trial-status').textContent = 'Hold it…'; if (tHeld >= s.hold) advance(); }
  else tHeld = 0;
}

/* ── finale ──────────────────────────────────────────────────────────────*/
let finaleState = 0;
function enterFinale() {
  if (finaleState) return; finaleState = 1; SCENE.triggerSlowmo(6); coach('', 0);
  setTimeout(() => { el.finaleText.textContent = finaleLetter.trim(); el.finale.classList.add('show'); finaleState = 2; }, 2600);
}

/* ── mode flow ───────────────────────────────────────────────────────────*/
let mode = 'intro', songStart = 0;
function startSong() {
  mode = 'play'; el.hud.classList.add('show'); el.frame.classList.add('show'); SCENE.showHitRing(true);
  chips.open.classList.add('learned'); chips.fist.classList.add('learned');
  AB.startSong(AUDIO.getChart(), AUDIO.getDuration());
  if (AUDIO.isLoaded()) AUDIO.startPlayback();
  songStart = performance.now() / 1000;
  SCENE.seedAmbient();
  coach(AUDIO.isLoaded() ? 'Catch blue with an open palm · strike red with a fist'
                         : 'No track loaded — steady tempo · open catches, fist strikes', 3.4);
  setTimeout(nextAmbientNote, 8000);
}
$('btn-begin').addEventListener('click', () => { el.intro.classList.add('hidden'); AUDIO.resumeAudio(); mode = 'trial'; beginTrial(); });
$('btn-skip-trial').addEventListener('click', () => { el.intro.classList.add('hidden'); AUDIO.resumeAudio(); chips.open.classList.add('learned'); chips.fist.classList.add('learned'); startSong(); });
el.trialSkip.addEventListener('click', skipStep);
AUDIO.initAudioPicker($('audio-file'), $('audio-status'));

/* ── webcam ──────────────────────────────────────────────────────────────*/
async function initWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 960 }, height: { ideal: 540 }, facingMode: 'user' }, audio: false });
    video.srcObject = stream; await video.play();
    const tex = new THREE.VideoTexture(video); tex.colorSpace = THREE.SRGBColorSpace; SCENE.setVideoTexture(tex);
    return true;
  } catch (e) { console.warn('Webcam unavailable:', e); return false; }
}

/* ── main loop ───────────────────────────────────────────────────────────*/
let last = performance.now() / 1000, time = 0, fpsAccum = 0, fpsFrames = 0;
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now() / 1000;
  let dt = Math.min(0.05, now - last); last = now; time += dt;
  const slow = SCENE.getSlowmo() > 0;

  GES.analyzeHands();
  AUDIO.updateAudio(dt);
  const beat = AUDIO.getBeat();
  SCENE.updateBackground(video);

  // hands → cursors + trails
  for (let i = 0; i < 2; i++) {
    const st = GES.handState[i], rb = SCENE.ribbons[i];
    if (st.present) {
      const w = SCENE.normToWorld(st.x, st.y);
      SCENE.poseHandCursor(i, { present: true, x: w.x, y: w.y, fist: st.fist, open: st.open });
      rb.setColor(st.fist ? CFG.colors.red : CFG.colors.eye);
      rb.push(w.x, w.y, clamp(-st.z * CFG.hands.depthScale, -2, 2));
    } else { SCENE.poseHandCursor(i, { present: false }); rb.clear(); }
    rb.update(time, beat);
  }

  if (mode === 'trial') updateTrial(dt);
  if (mode === 'play') {
    const songTime = AUDIO.isLoaded() ? AUDIO.getSongTime() : (now - songStart);
    AB.updateRhythm(songTime, now);
    handleEvents(); refreshHud();
    if (!finaleState) { noteTimer -= dt; if (noteTimer <= 0) nextAmbientNote(); }
  }
  if (judgeTimer > 0) { judgeTimer -= dt; if (judgeTimer <= 0) el.judge.className = ''; }

  // sigil
  SCENE.updateSigilTime(time);
  SCENE.sigilUniforms.uPulse.value = Math.max(0, SCENE.sigilUniforms.uPulse.value - dt * 1.5) + beat * 0.3;
  const openTarget = mode === 'intro' ? 0.15 : (finaleState ? 1.0 : 0.4);
  SCENE.sigilUniforms.uOpen.value = lerp(SCENE.sigilUniforms.uOpen.value, openTarget, dt * (finaleState ? 0.6 : 2));
  SCENE.sigilUniforms.uIntensity.value = lerp(SCENE.sigilUniforms.uIntensity.value, finaleState ? 1.1 : 0.55, dt);
  SCENE.sigil.rotation.z += dt * (finaleState ? 0.05 : 0.14);

  SCENE.particles.update(dt, slow || finaleState > 0);
  SCENE.ambient.update(dt, finaleState > 0);
  if (mode !== 'intro' && !finaleState) SCENE.ambientTick();

  if (coachTimer > 0) { coachTimer -= dt; if (coachTimer <= 0) coach('', 0); }

  const bloomBase = finaleState ? CFG.bloom.finale : CFG.bloom.base;
  SCENE.bloom.strength = lerp(SCENE.bloom.strength, bloomBase + beat * 0.8 + AUDIO.getLevel() * 0.5 + SCENE.sigilUniforms.uPulse.value * 0.4, 0.2);
  SCENE.bloom.radius = CFG.bloom.radius + beat * 0.2;

  SCENE.tickFx(dt);
  SCENE.render();

  fpsAccum += dt; fpsFrames++;
  if (fpsAccum > 0.5) { el.fps.textContent = Math.round(fpsFrames / fpsAccum) + ' FPS · ' + GES.getHandCount() + ' hand(s)'; fpsAccum = 0; fpsFrames = 0; }
}

async function boot() {
  $('lmsg').textContent = 'Opening the eye…';
  const cam = await initWebcam();
  GES.initHands(video); GES.pumpHands();
  $('loader').style.display = 'none';
  if (!cam) setTimeout(() => coach('No webcam — grant camera access, then reload', 8), 1500);
  loop();
}
boot();
