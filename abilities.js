/* ============================================================================
 *  abilities.js  —  Chi Rhythm engine.
 *  Chi-orbs fly inward to a central ring in time with the song. When a note
 *  lands on the ring you must be in the matching hand pose:
 *      blue  → OPEN palm (catch)      red → FIST (strike)
 *  Timing gives Perfect / Good / Miss; combo drives a multiplier; streaks fire
 *  the personal messages; the song ending blooms into the finale letter.
 *
 *  Emits: {type:'fired',ab} {type:'judgment',j} {type:'milestone',key}
 *  {type:'coach',text,hold} {type:'finale'}
 * ==========================================================================*/
import { CFG } from './config.js';
import {
  THREE, scene, particles, normToWorld, setHitRingColor, flashRing,
  bumpSigilPulse, addShake, triggerSlowmo, dist2, clamp, lerp, randRange,
} from './scene.js';
import { handState } from './gestures.js';

const R = CFG.rhythm;
const EYE = new THREE.Color(CFG.colors.eye), RED = new THREE.Color(CFG.colors.red), GOLD = new THREE.Color(CFG.colors.gold);

export const Game = {
  score: 0, combo: 0, maxCombo: 0, mult: 1,
  perfect: 0, good: 0, miss: 0, total: 0, judged: 0, accuracy: 100,
  progress: 0, running: false, finaleTriggered: false,
};
const events = [];
export function drainEvents() { const e = events.slice(); events.length = 0; return e; }
function emit(ev) { events.push(ev); }

/* ── a single note ───────────────────────────────────────────────────────*/
class Note {
  constructor(t, type) {
    this.t = t; this.type = type; this.spawned = false; this.resolved = false; this.dead = false;
    this.ang = randRange(0, Math.PI * 2);
    const col = type === 'catch' ? EYE : RED;
    this.mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(R.noteRadius, 16, 16), this.mat);
    this.ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(R.noteRadius * 1.4, R.noteRadius * 1.62, 32), this.ringMat);
    this.group = new THREE.Group(); this.group.add(this.mesh, this.ring); this.group.position.z = 0.15;
  }
  spawn() { this.spawned = true; scene.add(this.group); }
  update(songTime) {
    const prog = clamp((songTime - (this.t - R.leadTime)) / R.leadTime, 0, 1.25);
    const rad = lerp(R.spawnRadius, R.ringRadius, prog);
    this.group.position.set(Math.cos(this.ang) * rad, Math.sin(this.ang) * rad, 0.15);
    const appr = lerp(3.2, 1.0, clamp(prog, 0, 1));
    this.ring.scale.setScalar(appr);
    const fade = clamp(prog * 3, 0, 1);
    this.mat.opacity = this.resolved ? this.mat.opacity : fade;
    this.ringMat.opacity = this.resolved ? this.ringMat.opacity : fade * (0.4 + 0.6 * (1 - Math.abs(1 - clamp(prog, 0, 1.25))));
  }
  hit(j) {
    this.resolved = true; this.dead = true;
    const p = this.group.position;
    const col = this.type === 'catch' ? [0.25, 0.88, 0.82] : [1, 0.35, 0.4];
    particles.burst(p.x, p.y, j === 'perfect' ? 40 : 22, { color: col, speed: randRange(3, 8), life: randRange(0.4, 0.9) });
  }
  missOut() {
    this.resolved = true; this.dead = true;
    const p = this.group.position;
    particles.burst(p.x, p.y, 6, { color: [0.5, 0.5, 0.5], speed: randRange(1, 3), life: 0.4 });
  }
  dispose() { scene.remove(this.group); this.mesh.geometry.dispose(); this.mat.dispose(); this.ring.geometry.dispose(); this.ringMat.dispose(); }
}

/* ── chart ───────────────────────────────────────────────────────────────*/
let notes = [], cursor = 0, duration = 0, lastNoteT = 0;

export function startSong(chart, dur) {
  notes = chart.map((c) => new Note(c.t, c.type));
  cursor = 0; duration = dur; lastNoteT = notes.length ? notes[notes.length - 1].t : dur;
  Object.assign(Game, { score: 0, combo: 0, maxCombo: 0, mult: 1, perfect: 0, good: 0, miss: 0, total: notes.length, judged: 0, accuracy: 100, progress: 0, running: true, finaleTriggered: false });
}

function multFor(combo) { const t = CFG.scoring.multTiers; let m = 1; for (let i = 0; i < t.length; i++) if (combo >= t[i]) m = i + 1; return m; }
function recomputeAccuracy() { Game.accuracy = Game.judged ? Math.round((Game.perfect + Game.good * 0.55) / Game.judged * 100) : 100; }

// which hands qualify for a note type, near the central hit zone
function qualifyingHand(type) {
  for (const st of handState) {
    if (!st.present) continue;
    const w = normToWorld(st.x, st.y);
    if (Math.hypot(w.x, w.y) > R.hitZone) continue;
    if (type === 'catch' && st.open) return true;
    if (type === 'strike' && st.fist) return true;
  }
  return false;
}
function nearestPose() {
  let open = false, fist = false;
  for (const st of handState) { if (!st.present) continue; if (st.fist) fist = true; else if (st.open) open = true; }
  return fist ? 'fist' : open ? 'open' : 'none';
}

/* ── per-frame update (songTime is the audio clock) ──────────────────────*/
export function updateRhythm(songTime, now) {
  if (!Game.running) return;
  Game.progress = clamp(songTime / Math.max(1, duration), 0, 1);

  // hit-ring reflects your current pose (ready-to-catch / ready-to-strike)
  const pose = nearestPose();
  setHitRingColor(pose === 'fist' ? RED : pose === 'open' ? EYE : GOLD, pose === 'none' ? 0.4 : 1);

  // spawn
  while (cursor < notes.length && notes[cursor].t - R.leadTime <= songTime) { notes[cursor].spawn(); cursor++; }

  for (const nte of notes) {
    if (!nte.spawned || nte.dead) continue;
    nte.update(songTime);
    if (nte.resolved) continue;
    const d = songTime - nte.t;
    if (d > R.goodWindow) {
      // missed
      nte.missOut(); Game.miss++; Game.judged++; Game.combo = 0; Game.mult = 1;
      recomputeAccuracy(); emit({ type: 'judgment', j: 'miss' });
    } else if (d >= -R.goodWindow && qualifyingHand(nte.type)) {
      const j = Math.abs(d) <= R.perfectWindow ? 'perfect' : 'good';
      nte.hit(j);
      Game[j]++; Game.judged++;
      Game.combo++; Game.maxCombo = Math.max(Game.maxCombo, Game.combo); Game.mult = multFor(Game.combo);
      Game.score += Math.round((j === 'perfect' ? CFG.scoring.perfect : CFG.scoring.good) * Game.mult);
      recomputeAccuracy();
      flashRing(); bumpSigilPulse(0.5);
      emit({ type: 'judgment', j });
      emit({ type: 'fired', ab: nte.type === 'catch' ? 'open' : 'fist' });
      if (Game.combo === 10) emit({ type: 'milestone', key: 'comboX5' });
      if (Game.combo === 25) emit({ type: 'milestone', key: 'waveCleared' });
      if (Game.combo === 50) emit({ type: 'milestone', key: 'firstUltimate' });
      if (Game.combo > 0 && Game.combo % 20 === 0) addShake(0.12);
    }
  }

  // reap resolved notes after a beat
  notes = notes.filter((nte) => { if (nte.dead) { nte.dispose(); return false; } return true; });

  // finale when the song (and its tail) is done
  if (!Game.finaleTriggered && songTime >= Math.max(duration, lastNoteT + R.endPad)) {
    Game.finaleTriggered = true; Game.running = false; triggerSlowmo(4); emit({ type: 'finale' });
  }
}
