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

  // Central core you're defending. Forgiving: regenerates, never hard-fails.
  core: { hp: 100, regen: 3.5, radius: 1.15, orbDamage: 9, staggerFlash: 0.5 },

  // Orbs seek the core.
  orbs: {
    rMin: 0.34, rMax: 0.55,
    seekBase: 1.05, seekPerWave: 0.16, seekMax: 2.6,
    hpBase: 1.0, hpPerWave: 0.45,
    fistDamage: 6, sweepChip: 0.7, sweepChipCd: 0.22, sweepPush: 7.5,
    jitter: 0.5,
  },

  // Scoring / combo.
  scoring: { kill: 100, comboMax: 99, comboDecay: 2.6 },

  // Dragon's Rage ultimate — charged by kills, released with both fists together.
  ult: { chargePerKill: 8, chargeMax: 100, fistsTogether: 0.3, score: 800 },

  // Waves / difficulty / finale trigger.
  waves: { baseCount: 4, perWave: 2, betweenWaves: 2.6, firstDelay: 1.2, finaleWave: 6, finaleScore: 5000 },

  // Personal-message cadence (seconds).
  notes: { intervalMin: 30, intervalMax: 45, holdMs: 7000 },

  physics: { ppu: 60, frictionAir: 0.02 },
  mediapipe: { maxNumHands: 2, minDetection: 0.55, minTracking: 0.5 },
};
