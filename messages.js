/* ============================================================================
 *  messages.js  —  THE ONLY FILE WITH PROSE.  Edit these freely.
 * ----------------------------------------------------------------------------
 *  This is the one place personal text lives, so it's easy to find later.
 *
 *    midGameNotes   — short lines that drift in near a HUD edge during play,
 *                     every 30–45 seconds (timing set in config.js). Add or
 *                     remove lines freely; the array can be any length >= 1.
 *
 *    milestoneNotes — lines tied to specific moments. If a key is missing,
 *                     a random line from midGameNotes is shown instead.
 *                     Recognized keys: firstUltimate, comboX5, waveCleared.
 *
 *    finaleLetter   — the single longer message shown center-screen in the
 *                     calm finale, once per session. Line breaks are kept.
 * ==========================================================================*/

export const midGameNotes = [
  "You don't need eyes to find me — just chi.",
  "Every wave you cast, I'm rooting for you.",
  "Careful. I fall for guys who land skill shots.",
  "This is my heart. Try not to break it like the orbs.",
  "Ping me if you ever feel lost, I'll find you.",
  "You're doing better than most Diamond junglers, sweet daddy.",
  "No blindfold needed, I already see how good you are.",
];

export const milestoneNotes = {
  firstUltimate: "That kick had more power than my feelings for you. Almost.",
  comboX5: "Combo x5! That's how many times a day I think about you devouring me , times a lot more.",
  waveCleared: "You cleared the wave. I still haven't cleared how much I like you.",
};

export const finaleLetter = `
good boy ! You made it here, through every wave, every strike, every quiet second
between them. sawbt lik had little game bch t3rf bli knbgheeeek and i do care a lot about you and your interests, big kisses sweet lover.

LOVE YOU 9ED SMAAAAA
`;
