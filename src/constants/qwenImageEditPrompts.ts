// Qwen Image Edit specific prompts
export const QWEN_IMAGE_EDIT_PROMPTS = {
  custom: '', // Custom Prompt - user provides their own text
  copyImageStyle: "identify the two images in the scene and transform the main person image into the style of the second image, the result must be the transformed person image only, generate a dramatically transformed image",
  makeMeLegos: "Preserve the person's face and identify, make them into a lego character while keeping the person's identity and facial characteristics identical",
  astronaut: "Replace their clothes with a realistic NASA astronaut suit while keeping their face and identity the same",
  bodybuilder: "keep the person's face the same, keep hair the same, keep nose and mouth the same, same face shape, same expression, Make the person have huge muscles that blend naturally into their face realistically while keeping their existing identity and characteristics",
  claymation: "Model the person in a claymation look, keep their identity, finger dents, matte clay and diorama set",
  makeMeCloned: "Make the person appear multiple times in the image while keeping everything else the same",
  bobblehead: "Convert the person into a bobblehead figure. (Keep the person's face, hair, and identity the same). Oversized head spring base simple studio background",
  makeMeCold: "cover the scene in snow and put winter clothes on the person, (keep the person's face and identity matching the original). They are very cold and you can see their breath",
  fortniteInspo: "Create a stylized battle royale portrait inspired by Fortnite keep identity saturated colors and action pose",
  makeMePixelArt: "make them into a retro pixel art character while keeping their identity",
  pixarInspo: "Create a stylized portrait inspired by Pixar keep identity large expressive eyes soft global illumination warm backdrop",
  simpsonsInspo: "Transform the person into The Simpsons character while preserving their identity and facial features",
  marioKartInspo: "Place the person in a kart racing scene inspired by Super Mario Bros keeping their identity the same, bright track balloons and confetti",
  minecraftInspo: "Voxelize the person and the scene into a Minecraft style keep identity squared features blocky environment and simple sky",
  makeMeWoWeInspo: "Style the person as a fantasy World of Warcraft character while keeping their identity recognizable, ornate armor glowing runes and castle hall",
  makeMePopArt: "Create a pop art portrait keep identity halftone dots flat primaries and burst background",
  makeMeUkiyoE: "Render the person as an ukiyo e print keep identity bold linework flat color planes and wave or cloud motifs",
  tattooFlash: "Render the person as a traditional tattoo flash icon keep identity bold lines limited inks and parchment texture",
  makeMeAngry: "face expression is angry",
  makeMeNeon: "keep their clothes the same, keep face the same, keep hair the same, keep nose and mouth the same, same face shape, same expression, aesthetic 9, reimagine this person while keeping their facial features intact, digital_drawing_(artwork), colorful, high_contrast, psychedelic illustration, surreal grotesque cartoon style, thick bold outlines, dripping and shiny, pink fleshy, exaggerated forms, neon palette (pink, green, yellow, purple), sticker-art aesthetic, vaporwave background with diagonal stripes, dynamic composition, urban street art vibe, inspired by graffiti and tattoo flash.",
  makeMeViking: "Change all the clothes to viking armor and viking hat with horns while keeping exact face and body size the same",
  makeMeBox: "Turn me into a boxer wearing blue boxing gloves and a sports top that says 'BASE', art style will be similar to Fortnite Characters, background looks like a boxing ring",
  addCats: "Add cats and match style",
  hatsAndGlasses: "Add cowboy hats and sunglasses",
  makeMeDoodleArt: "Convert into a minimalist bold line colorful cartoon abstract portrait, minimal features, very simple, surreal playful pastel style, abstract vector, minimal facial features, thick outlines, rainbow, clouds",
  bougieBlack: "detailed studio portrait, seated on a black bar stool (detailed metal frame:1.1), wearing a black suit (detailed clothing:1.2), black turtleneck, and white sneakers (accessories:1.1), centered in the frame,  mid-shot, mid-length,  black and white photorealistic portrait, minimalist style, (stark white background), (simple background:1.0), light and shadow well-defined (lighting:1.1), neutral color palette (b&w), fashion editorial photography, haute couture, confident and casual pose, sharp focus, high-detail photorealistic style, 8k resolution, cement floor, Moody, cinematic, Ilford FP4 film look",
  bougieWhite: "editorial studio lighting black and white portrait, (bright white backdrop), bokeh, medium format camera, film, contrasty, detailed, sharp, wearing a crisp white polo shirt (detailed clothing:1.2), and white trousers (detailed clothing:1.2), (accessories:1.1), (facial features:1.3), (expression:1.1), standing, pose:1.2), simple and elegant composition, minimalist style, studio shot against a stark white background, sharp focus, clean lines, black and white photorealistic style, high detail,  (detailed fabric texture:1.2),  well-lit, even lighting, classic portrait, (clean background:1.1), posing, dignified, hands behind back, Moody, cinematic, Ilford FP4 film look",
}

// Helper function to get Qwen Image Edit prompts
export const getQwenImageEditPrompts = () => {
  return QWEN_IMAGE_EDIT_PROMPTS;
};


