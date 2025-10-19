import { styleIdToDisplay } from './index';

/**
 * Converts camelCase prompt key to kebab-case filename
 * @param {string} promptKey - The camelCase prompt key
 * @returns {string} The kebab-case filename part
 *
 * Examples:
 *   darkFantasyBerserker -> dark-fantasy-berserker
 *   anime1990s -> anime-1990s
 *   rockPoster70s -> rock-poster-70s
 *   mallGlamour90s -> mall-glamour-90s
 *   nftBoredApe -> nft-bored-ape
 *   celShade3D -> cel-shade-3d
 *   y2kRaverKid -> y2k-raver-kid
 *   1990sHouseParty -> 1990s-house-party
 *   f1Driver -> f-1-driver
 *   fingers4am -> fingers-4-am
 *   classicZombieBW -> classic-zombie-b-w
 *   clubDJ -> club-d-j
 *   rnBSoulSinger -> rn-b-soul-singer
 *   retroVHS -> retro-v-h-s
 *   filmGrainB&W -> film-grain-b&-w
 */
const promptKeyToFilename = (promptKey) => {
  let result = promptKey;
  
  // First handle capital D at end (for 3D -> 3d, keep together)
  result = result.replace(/([0-9])D$/g, '$1d');
  
  // Split ALL consecutive uppercase letters (VHS -> V-H-S, DJ -> D-J, BW -> B-W, TV -> T-V, etc.)
  result = result.replace(/([A-Z])(?=[A-Z])/g, '$1-');
  
  // Insert a hyphen before uppercase letters (not at start)
  result = result.replace(/([a-z])([A-Z])/g, '$1-$2');
  
  // Handle special character & followed by uppercase W -> add hyphen after &
  result = result.replace(/&([A-Z])/g, '&-$1');
  
  // Convert to lowercase
  result = result.toLowerCase();
  
  // Insert hyphens at letter-number boundaries (e.g., anime1990s -> anime-1990s)
  // BUT preserve y2k as special case
  result = result.replace(/([a-z])([0-9])/g, (match, p1, p2, offset, string) => {
    // Check if this is the y in y2k
    if (p1 === 'y' && string.substr(offset, 3) === 'y2k') {
      return match; // keep y2k together
    }
    return p1 + '-' + p2;
  });
  
  // Insert hyphens at number-letter boundaries (e.g., f1driver -> f-1-driver)
  // BUT preserve y2k, 3d, and number+s patterns (1990s, 70s, etc.)
  result = result.replace(/([0-9])([a-z])/g, (match, p1, p2, offset, string) => {
    // Check if this creates y2k pattern (2k)
    if (offset > 0 && string[offset - 1] === 'y' && p1 === '2' && p2 === 'k') {
      return match; // keep y2k together
    }
    // Check if this is just 's' after a number (1990s, 70s, etc.)
    if (p2 === 's' && (offset + 2 >= string.length || string[offset + 2] === '-' || /[A-Z]/.test(string[offset + 2]))) {
      return match; // keep number+s together
    }
    // Check if this is 3d pattern
    if (p1 === '3' && p2 === 'd' && (offset + 2 >= string.length || string[offset + 2] === '-')) {
      return match; // keep 3d together
    }
    return p1 + '-' + p2;
  });
  
  // Remove leading hyphen if present
  result = result.replace(/^-/, '');
  
  // Clean up double hyphens
  result = result.replace(/--+/g, '-');
  
  return result;
};

/**
 * Generates the expected gallery filename for a prompt key
 * @param {string} promptKey - The prompt key
 * @returns {string} The expected filename
 */
const generateGalleryFilename = (promptKey) => {
  const kebabCase = promptKeyToFilename(promptKey);
  return `sogni-photobooth-${kebabCase}-raw.jpg`;
};

/**
 * Loads all gallery images and converts them to photo objects
 * @param {Object} stylePrompts - The available style prompts
 * @param {string} portraitType - The type of portrait: 'headshot', 'medium', or 'fullbody'
 * @returns {Promise<Array>} Array of photo objects for the gallery
 */
export const loadGalleryImages = async (stylePrompts, portraitType = 'medium') => {
  try {
    const galleryPhotos = [];

    // Map portrait type to subdirectory
    const subdirectory = portraitType;

    // Create gallery photos for all prompts
    let photoIndex = 0;

    Object.keys(stylePrompts).forEach(promptKey => {
      // Skip special prompts
      if (['custom', 'random', 'randomMix', 'oneOfEach'].includes(promptKey)) {
        return;
      }

      // Generate the expected filename using strict naming convention
      const expectedFilename = generateGalleryFilename(promptKey);
      const imagePath = `/gallery/prompts/${subdirectory}/${expectedFilename}`;

      // Create photo object - will show placeholder if file doesn't exist
      const galleryPhoto = {
        id: `gallery-${promptKey}-${Date.now()}-${photoIndex}`,
        generating: false,
        loading: false,
        images: [imagePath],
        originalDataUrl: imagePath,
        newlyArrived: false,
        isOriginal: false,
        sourceType: 'gallery',
        // Add prompt information for the polaroid tag
        promptKey: promptKey,
        promptDisplay: styleIdToDisplay(promptKey),
        promptText: stylePrompts[promptKey] || '',
        // Assign frame numbers for equal distribution (1-6)
        taipeiFrameNumber: (photoIndex % 6) + 1,
        framePadding: 0,
        // Mark as gallery image to prevent custom frame application
        isGalleryImage: true,
        // Add expected filename for debugging
        expectedFilename: expectedFilename
      };

      galleryPhotos.push(galleryPhoto);
      photoIndex++;
    });

    console.log(`Created ${galleryPhotos.length} gallery photo objects using strict naming convention for ${subdirectory} portraits`);
    return galleryPhotos;

  } catch (error) {
    console.error('Error loading gallery images:', error);
    return [];
  }
};

/**
 * Checks if an image file exists at the given path
 * @param {string} imagePath - Path to the image
 * @returns {Promise<boolean>} True if image exists and loads successfully
 * 
 * Note: This function is kept for potential future use but is not used
 * in the gallery loading to avoid preloading delays
 */
export const checkImageExists = (imagePath) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = imagePath;
  });
};

// Export the utility functions for use in renaming scripts
export { promptKeyToFilename, generateGalleryFilename };