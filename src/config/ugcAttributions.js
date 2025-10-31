/**
 * UGC (User Generated Content) Prompt Attributions
 *
 * Maps prompt keys to usernames for attribution in the UI.
 * When a prompt is created by a user, add an entry here to display
 * "created by @username" in the Vibe Explorer and style selector.
 */

export const UGC_ATTRIBUTIONS = {
  pumpkinQueen: 'prosto323',
  officeHulk: 'ksaurus', 
  corpseBallerina: 'Mercypresh1',
  darkQueen: 'hadi277',
  hauntedBride: 'akashivander',
  frankenstin: 'hadi277',
  rustedSurgeon: 'kanuTTP',
  cosmicGrimReaper: 'shux',
  cyborgDemon: 'pecok',
  surrealPumpkin: 'akashivander',
  castleWitch: 'bobunny',
  midnightWitch: 'sayo',
  hoodedEerie: 'Sogyiai',
  daenerysTargaryen: 'mark.and.robot',
};

/**
 * Get the username attribution for a given prompt key
 * @param {string} promptKey - The prompt key to look up
 * @returns {string|null} The username if found, null otherwise
 */
export function getPromptAttribution(promptKey) {
  return UGC_ATTRIBUTIONS[promptKey] || null;
}

/**
 * Check if a prompt has a user attribution
 * @param {string} promptKey - The prompt key to check
 * @returns {boolean} True if the prompt has an attribution
 */
export function hasPromptAttribution(promptKey) {
  return promptKey in UGC_ATTRIBUTIONS;
}

/**
 * Get formatted attribution text for display
 * @param {string} promptKey - The prompt key to look up
 * @returns {string} Formatted attribution text or empty string
 */
export function getAttributionText(promptKey) {
  const username = getPromptAttribution(promptKey);
  return username ? `by @${username}` : '';
}

