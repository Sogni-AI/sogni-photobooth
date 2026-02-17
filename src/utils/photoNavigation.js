/**
 * Utility functions for photo navigation
 */

/**
 * Get previous photo index with looping
 * @param {Array} photos - Array of photo objects
 * @param {number} currentIndex - Current photo index
 * @returns {number} Previous valid photo index
 */
export const getPreviousPhotoIndex = (photos, currentIndex) => {
  // Find previous valid photo
  let previousIndex = currentIndex;
  let iterations = 0;
  
  while (iterations < photos.length) {
    previousIndex = previousIndex === 0 ? photos.length - 1 : previousIndex - 1;
    iterations++;
    
    const previousPhoto = photos[previousIndex];
    if (previousPhoto &&
        !previousPhoto.hidden &&
        !previousPhoto.generating &&
        ((previousPhoto.images && previousPhoto.images.length > 0) ||
          previousPhoto.isOriginal)) {
      // We found a valid photo
      return previousIndex;
    }
  }
  
  // If we get here, there's no valid previous photo
  return currentIndex;
};

/**
 * Get next photo index with looping
 * @param {Array} photos - Array of photo objects
 * @param {number} currentIndex - Current photo index
 * @returns {number} Next valid photo index
 */
export const getNextPhotoIndex = (photos, currentIndex) => {
  // Find next valid photo
  let nextIndex = currentIndex;
  let iterations = 0;
  
  while (iterations < photos.length) {
    nextIndex = nextIndex === photos.length - 1 ? 0 : nextIndex + 1;
    iterations++;
    
    const nextPhoto = photos[nextIndex];
    if (nextPhoto &&
        !nextPhoto.hidden &&
        !nextPhoto.generating &&
        ((nextPhoto.images && nextPhoto.images.length > 0) ||
          nextPhoto.isOriginal)) {
      // We found a valid photo
      return nextIndex;
    }
  }
  
  // If we get here, there's no valid next photo
  return currentIndex;
};

/**
 * Navigate to previous photo with looping
 * @param {Array} photos - Array of photo objects
 * @param {number} selectedPhotoIndex - Current selected photo index
 * @returns {number|null} New index or null if no valid previous photo
 */
export const goToPreviousPhoto = (photos, selectedPhotoIndex) => {
  // Check if there are any loaded photos to navigate to
  if (photos.length <= 1) return selectedPhotoIndex;
  
  // Find the previous loaded photo
  let previousIndex = selectedPhotoIndex;
  let iterations = 0;
  
  // Only try once around the array to avoid infinite loop
  while (iterations < photos.length) {
    previousIndex = previousIndex === 0 ? photos.length - 1 : previousIndex - 1;
    iterations++;
    
    // Skip photos that are still loading, have errors, or are hidden
    const previousPhoto = photos[previousIndex];
    if (previousPhoto &&
        !previousPhoto.hidden &&
        !previousPhoto.generating &&
        ((previousPhoto.images && previousPhoto.images.length > 0) ||
          previousPhoto.isOriginal)) {
      // We found a valid photo
      break;
    }
  }
  
  // Only proceed if we found a valid previous photo
  if (previousIndex !== selectedPhotoIndex && iterations < photos.length) {
    return previousIndex;
  }
  
  return selectedPhotoIndex;
};

/**
 * Navigate to next photo with looping
 * @param {Array} photos - Array of photo objects
 * @param {number} selectedPhotoIndex - Current selected photo index
 * @returns {number|null} New index or null if no valid next photo
 */
export const goToNextPhoto = (photos, selectedPhotoIndex) => {
  // Check if there are any loaded photos to navigate to
  if (photos.length <= 1) return selectedPhotoIndex;
  
  // Find the next loaded photo
  let nextIndex = selectedPhotoIndex;
  let iterations = 0;
  
  // Only try once around the array to avoid infinite loop
  while (iterations < photos.length) {
    nextIndex = nextIndex === photos.length - 1 ? 0 : nextIndex + 1;
    iterations++;
    
    // Skip photos that are still loading, have errors, or are hidden
    const nextPhoto = photos[nextIndex];
    if (nextPhoto &&
        !nextPhoto.hidden &&
        !nextPhoto.generating &&
        ((nextPhoto.images && nextPhoto.images.length > 0) ||
          nextPhoto.isOriginal)) {
      // We found a valid photo
      break;
    }
  }
  
  // Only proceed if we found a valid next photo
  if (nextIndex !== selectedPhotoIndex && iterations < photos.length) {
    return nextIndex;
  }
  
  return selectedPhotoIndex;
}; 