// Special mode prompts for context image models (for Qwen Image Edit, Flux, etc.)
// Note: Regular edit prompts are now in prompts.json under "image-edit-prompts" category

// Special prompt for Copy Image Style mode
export const COPY_IMAGE_STYLE_PROMPT = "identify the two images in the scene and transform the main person image into the style of the second image, the result must be the transformed person image only, generate a dramatically transformed image";

// Category ID for image edit prompts in prompts.json
export const IMAGE_EDIT_PROMPTS_CATEGORY = 'image-edit-prompts';

// Prefix prepended to non-edit prompts when using edit models
// This helps edit models understand to transform while preserving identity
export const EDIT_MODEL_TRANSFORMATION_PREFIX = "Transform the person while keeping facial features and identity intact into this style: ";

/**
 * Strips the transformation prefix from a prompt if present.
 * Used to match prompts back to their original style keys.
 * @param prompt - The prompt that may have the transformation prefix
 * @returns The prompt without the transformation prefix
 */
export function stripTransformationPrefix(prompt: string): string {
  if (!prompt) return prompt;
  if (prompt.startsWith(EDIT_MODEL_TRANSFORMATION_PREFIX)) {
    return prompt.slice(EDIT_MODEL_TRANSFORMATION_PREFIX.length);
  }
  return prompt;
}