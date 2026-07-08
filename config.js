/* ============================================================================
 *  config.js  —  tunables for the "Chi Sculptor" spectacle.
 * ==========================================================================*/
export const CFG = {
  view: { height: 10 },
  colors: { gold: 0xffb24d, pink: 0xff4d8d, blue: 0x4db8ff, eye: 0x6fffe0, ink: 0x05040a },

  // The star of the show: a GPU chi-particle field sculpted by your hand.
  field: {
    count: 24000,
    box: [11, 6.5, 4.2],    // half-extents of the starting cloud
    flowScale: 0.22,        // curl-noise frequency
    flowAmp: 1.35,          // how much the field churns
    attract: 1.7,           // pull toward the hand when gathering
    swirl: 1.5,             // orbital swirl around the hand
    burstForce: 7.0,        // outward blast on release
    size: 1.35,             // base point size
  },

  bloom: { base: 0.55, radius: 0.62, threshold: 0.42, burst: 1.4 },
  afterimage: { damp: 0.5, burstDamp: 0.82 },  // motion-blur "painting" trails
  perf: { maxPixelRatio: 1.25, trackFps: 30, modelComplexity: 0 },

  hands: { smoothing: 0.4, openThresh: 0.6, fistThresh: 0.35, depthScale: 3.0 },

  mediapipe: { maxNumHands: 1, minDetection: 0.55, minTracking: 0.5 },
};
