/* ============================================================================
 *  config.js  —  all tunable numbers in one place. No prose here (see messages.js).
 *  If the feel is off on your webcam, tweak `hands` (smoothing/radii) and
 *  `orbs.seekSpeed`. Everything is intentionally forgiving.
 * ==========================================================================*/

export const CFG = {
  playerName: "SUMMONER",

  view: { height: 10 },                 // world units tall (ortho camera)
  // Lee Sin palette: teal "eye" chi (his canonical ability colour), crimson
  // bandages, Ionian gold, bone white. `cyan` kept as an alias for `eye` so
  // nothing breaks. Open hand = eye teal, fist = crimson, core = the eye.
  colors: { eye: 0x3fe0d6, red: 0xe23b46, gold: 0xf0c060, bone: 0xf2e6d2, orb: 0xff6a3c, danger: 0xff3145, cyan: 0x3fe0d6 },

  // Bloom (UnrealBloomPass). Rendered at half-res for performance.
  bloom: { base: 0.75, radius: 0.5, threshold: 0.5, finale: 1.2 },
  perf: { maxPixelRatio: 1.25, trackFps: 30, modelComplexity: 0 },

  // Hands = weapons. Positions are smoothed toward the latest tracked landmark
  // every render frame, so motion stays fluid between 30fps tracking updates.
  hands: {
    smoothing: 0.4,        // 0..1 higher = snappier / lower = smoother
    openRadius: 1.35,      // world radius of the sweeping aura (open hand)
    fistRadius: 0.75,      // world radius of the strike core (closed fist)
    openThresh: 0.6,       // openAmount above this => open (hysteresis)
    fistThresh: 0.35,      // openAmount below this => fist
    depthScale: 3.0,       // landmark z -> scene depth
  },

  // Chi Rhythm. Notes fly inward to a central ring; open palm catches blue,
  // fist strikes red, timed to your loaded song (or a fallback tempo).
  rhythm: {
    leadTime: 1.9,        // seconds a note is visible before it must be hit
    perfectWindow: 0.12,  // ± seconds for a Perfect
    goodWindow: 0.26,     // ± seconds for a Good (outside = Miss)
    ringRadius: 1.15,     // hit-ring radius (world units)
    hitZone: 3.2,         // a hand within this radius of center can register hits
    spawnRadius: 9.5,     // where notes fly in from
    noteRadius: 0.34,
    minGap: 0.26,         // collapse onsets closer than this
    startDelay: 2.2,      // silence before the first note (lead-in)
    endPad: 3.0,          // seconds after the last note before the finale
  },

  // Offline onset detection for the loaded song.
  analysis: { hop: 512, sensitivity: 1.45, window: 22 },

  // Fallback chart when no audio is loaded.
  fallback: { bpm: 100, duration: 80 },

  // Scoring / combo.
  scoring: { perfect: 100, good: 45, comboMax: 999, multTiers: [0, 8, 20, 40] },

  // Personal-message cadence (seconds).
  notes: { intervalMin: 30, intervalMax: 45, holdMs: 7000 },

  physics: { ppu: 60, frictionAir: 0.02 },
  mediapipe: { maxNumHands: 2, minDetection: 0.55, minTracking: 0.5 },
};
