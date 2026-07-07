/* ============================================================================
 *  config.js  —  all tunable numbers in one place. No prose here (see messages.js).
 *  Tweak thresholds if gestures feel too eager or too stubborn on your webcam.
 * ==========================================================================*/

export const CFG = {
  playerName: "SUMMONER",

  // World / camera — an orthographic play-plane VIEW_H units tall.
  view: { height: 10 },

  colors: { cyan: 0x3fe0ff, gold: 0xf0c060, orb: 0xff5a3c },

  // Bloom (UnrealBloomPass). High threshold keeps the dim webcam crisp;
  // only glowing chi/sigils/particles bloom.
  bloom: { base: 0.9, radius: 0.55, threshold: 0.55, finale: 1.35 },

  // Ability cooldowns, seconds.
  cooldowns: { Q: 0.35, Q2: 0.5, W: 6, E: 4, R: 12 },

  // Gesture detection thresholds (normalized MediaPipe units unless noted).
  gesture: {
    flickSpeed: 2.2,        // index-tip speed to fire Sonic Wave (per second)
    trialFlickSpeed: 1.8,   // forgiving threshold used during the trial
    fistHoldMin: 0.25,      // seconds a fist must be held to arm a release
    comboWindow: 2.0,       // seconds after a Sonic Wave that Q2 can combo
    pushApartRate: 1.6,     // hands-separating rate for Tempest (per second)
    pushApartMinDist: 0.28, // hands must be at least this far apart
    fistsTogetherDist: 0.22,// both fists must be closer than this for the ult
    thrustZ: -1.2,          // combined palm z-velocity toward camera = thrust
    thrustY: 5.0,           // ...or combined vertical velocity as a fallback
    chestY: 0.58,           // palm below this (lower frame) counts as "chest"
    chestX: 0.28,           // palm within this of center-x counts as "chest"
    openPalmFingers: 4,     // extended fingers to count as an open palm
  },

  // Scoring / combo.
  scoring: {
    orbKill: 120, resonate: 220, tempest: 0, safeguard: 30, ultimate: 300,
    comboMax: 99, comboDecay: 3.2,
  },

  // Waves / difficulty / finale trigger.
  waves: {
    baseCount: 3, perWave: 1.5, hpPerWave: 0.6,
    betweenWaves: 3.0, firstDelay: 0.8,
    finaleWave: 6, finaleScore: 4000,
  },

  // Personal-message cadence (seconds).
  notes: { intervalMin: 30, intervalMax: 45, holdMs: 7000 },

  // Physics.
  physics: { ppu: 60, frictionAir: 0.015 },

  // MediaPipe.
  mediapipe: { maxNumHands: 2, modelComplexity: 1, minDetection: 0.6, minTracking: 0.6 },
};
