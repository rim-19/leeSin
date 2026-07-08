/* ============================================================================
 *  config.js  —  tunable numbers for the cinematic experience.
 * ==========================================================================*/
export const CFG = {
  view: { height: 10 },

  // League / Lee Sin palette.
  colors: {
    gold: 0xe8c07a, goldDeep: 0x8a6a24,
    pink: 0xff4d8d, magenta: 0xd63b8f,
    blue: 0x4db8ff, eye: 0x3fe0d6,
    ember: 0xffb060, ink: 0x0a0608,
  },

  bloom: { base: 0.85, radius: 0.6, threshold: 0.35, finale: 1.25 },
  afterimage: { damp: 0.72, dashDamp: 0.92 },
  perf: { maxPixelRatio: 1.25, trackFps: 30, modelComplexity: 0 },

  hands: {
    smoothing: 0.4,
    pinchOn: 0.055,   // normalized thumb–index distance to start a pinch
    pinchOff: 0.09,   // release threshold (hysteresis)
    openThresh: 0.6, fistThresh: 0.35,
    depthScale: 3.0,
  },

  // Ability VFX cooldowns (seconds).
  cooldowns: { Q: 0.5, Q2: 0.7, R: 2.4 },

  // Cinematic sequence timing (seconds).
  cine: {
    blackHold: 1.2, lineIn: 2.0, lineHold: 2.6, reveal: 3.0,
    impactAt: 0.6, spiritHold: 3.0,
  },

  mediapipe: { maxNumHands: 1, minDetection: 0.55, minTracking: 0.5 },
};
