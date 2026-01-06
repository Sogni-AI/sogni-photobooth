// Special mode prompts for context image models (for Qwen Image Edit, Flux, etc.)
// Note: Regular edit prompts are now in prompts.json under "image-edit-prompts" category

// Special prompt for Copy Image Style mode
export const COPY_IMAGE_STYLE_PROMPT = "STYLE TRANSFER: Reimagine Image 2 with the subject from Image 2 while matching Image 1's visual style, keeping the subject's identity and likeness features intact. The result is a new portrait of the subject from Image 2 reimagined into the unique aesthetic and technique and visual language of Image 1";

// Category ID for image edit prompts in prompts.json
export const IMAGE_EDIT_PROMPTS_CATEGORY = 'image-edit-prompts';

// Prefix prepended to non-edit prompts when using edit models
// This helps edit models understand to transform while preserving identity
export const EDIT_MODEL_TRANSFORMATION_PREFIX = "Transform the person while keeping facial features and identity intact into this style: ";

// Prefix prepended to negative prompts when using edit models
// This helps prevent black bars/letterboxing artifacts common in edit model outputs
export const EDIT_MODEL_NEGATIVE_PROMPT_PREFIX = "black bars, ";

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