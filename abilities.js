/* ============================================================================
 *  abilities.js  —  maps hand gestures to Lee Sin's ability VFX.
 *    pinch                 → Sonic Wave (Q)      blue projectile + shockwave
 *    make a fist           → Resonating Strike   dash streak + motion blur
 *    clench then open palm  → Dragon's Rage (R)   big burst + shake + flash
 *  Emits {type:'ability', key:'Q'|'Q2'|'R'} so the UI can light the icon.
 * ==========================================================================*/
import { CFG } from './config.js';
import { normToWorld, sonicWave, dashStreak, rageBurst } from './scene.js';
import { handState } from './gestures.js';

const CD = CFG.cooldowns;
const cd = { Q: 0, Q2: 0, R: 0 };
const events = [];
export function drainEvents() { const e = events.slice(); events.length = 0; return e; }

let interactive = false;
export function setInteractive(v) { interactive = v; }

const prev = { x: 0, y: 0, has: false, wasFist: false, wasOpen: true, lastNonOpen: -9 };

function dirFrom(w) {
  let dx = w.x - prev.x, dy = w.y - prev.y;
  if (Math.hypot(dx, dy) < 0.15) { const L = Math.hypot(w.x, w.y) || 1; dx = w.x / L; dy = w.y / L; if (Math.hypot(dx, dy) < 0.01) { dx = 1; dy = 0; } }
  return { dx, dy };
}

export function updateAbilities(dt, now) {
  for (const k of ['Q', 'Q2', 'R']) if (cd[k] > 0) cd[k] -= dt;
  if (!interactive) return;
  const st = handState[0];
  if (!st.present) { prev.has = false; return; }
  const w = normToWorld(st.x, st.y);

  // Q — Sonic Wave on pinch
  if (st.justPinched && cd.Q <= 0) {
    const d = dirFrom(w); sonicWave(w.x, w.y, d.dx, d.dy); cd.Q = CD.Q; events.push({ type: 'ability', key: 'Q' });
  }
  // Q2 — dash when a fist forms
  if (st.fist && !prev.wasFist && cd.Q2 <= 0) {
    const d = dirFrom(w); dashStreak(w.x, w.y, d.dx, d.dy); cd.Q2 = CD.Q2; events.push({ type: 'ability', key: 'Q2' });
  }
  // R — Dragon's Rage: open the palm shortly after a fist/pinch (clench→release)
  if (st.open && !prev.wasOpen && cd.R <= 0 && (now - prev.lastNonOpen) < 1.1) {
    rageBurst(w.x, w.y); cd.R = CD.R; events.push({ type: 'ability', key: 'R' });
  }

  if (!st.open) prev.lastNonOpen = now;
  prev.wasFist = st.fist; prev.wasOpen = st.open; prev.x = w.x; prev.y = w.y; prev.has = true;
}
