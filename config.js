/* ============================================================================
 *  config.js  —  THE OP · ECHO.  A mock TouchDesigner-style engine for Lee Sin.
 *  Defines the node network shown in the UI and the default ECHO parameters.
 *  Params here are LIVE — sliders in the app write straight into ECHO.
 * ==========================================================================*/
export const CFG = {
  // Live ECHO parameters (edited by the param panel sliders).
  params: {
    tempo: 104,        // auto-ping BPM
    sensitivity: 0.55, // mic reactivity
    pingSpeed: 9.0,    // how fast a sonar shell expands (units/s)
    thickness: 0.5,    // sonar shell width
    decay: 1.9,        // how fast a ping fades
    density: 1.0,      // fraction of the temple point cloud drawn
    hue: 0.5,          // primary chi hue (0..1)  ~teal
    hue2: 0.09,        // accent hue             ~gold
    brightness: 0.55,  // tuned live: >1 whites-out under stacked pings
    bloomStrength: 0.8,
    bloomRadius: 0.6,
  },
  autoPing: true,

  colors: { bg: 0x05070a, teal: 0x3fe0d6, gold: 0xe8c07a, red: 0xff4d5e },

  // The node network (purely visual, but selecting a node shows its params).
  nodes: [
    { id: 'audioin', title: 'audioIn', kind: 'CHOP', x: 24, y: 20, params: ['tempo', 'sensitivity'] },
    { id: 'temple', title: 'temple', kind: 'SOP', x: 24, y: 104, params: ['density'] },
    { id: 'sonar', title: 'sonar', kind: 'TOP', x: 210, y: 60, params: ['pingSpeed', 'thickness', 'decay'] },
    { id: 'chi', title: 'chi', kind: 'MAT', x: 392, y: 60, params: ['hue', 'hue2', 'brightness'] },
    { id: 'bloom', title: 'bloom', kind: 'TOP', x: 566, y: 60, params: ['bloomStrength', 'bloomRadius'] },
    { id: 'out', title: 'out1', kind: 'TOP', x: 740, y: 60, params: [] },
  ],
  cords: [['audioin', 'sonar'], ['temple', 'sonar'], ['sonar', 'chi'], ['chi', 'bloom'], ['bloom', 'out']],

  // Param slider ranges/labels.
  paramDefs: {
    tempo: { label: 'tempo', min: 50, max: 170, step: 1, unit: 'bpm' },
    sensitivity: { label: 'sens', min: 0, max: 1, step: 0.01 },
    pingSpeed: { label: 'ping.speed', min: 2, max: 22, step: 0.1 },
    thickness: { label: 'shell.w', min: 0.15, max: 1.6, step: 0.01 },
    decay: { label: 'decay', min: 0.3, max: 3.5, step: 0.01 },
    density: { label: 'density', min: 0.2, max: 1, step: 0.01 },
    hue: { label: 'chi.hue', min: 0, max: 1, step: 0.005 },
    hue2: { label: 'accent.hue', min: 0, max: 1, step: 0.005 },
    brightness: { label: 'level', min: 0.1, max: 1.1, step: 0.01 },
    bloomStrength: { label: 'bloom', min: 0, max: 1.8, step: 0.01 },
    bloomRadius: { label: 'radius', min: 0, max: 1, step: 0.01 },
  },

  quotes: [
    'A duelist needs no eyes to see.',
    'Your will has led you astray.',
    'I do not fear the enemy. I fear the calm before their eyes.',
    'The Eye of Twilight watches.',
  ],
};
