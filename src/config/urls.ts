/**
 * URL configurations for different environments
 */

interface EnvironmentURLs {
  publicUrl: string;
  apiUrl: string;
  assetUrl: string; // CDN URL for static assets like gallery images
}

// Production URLs
const productionUrls: EnvironmentURLs = {
  publicUrl: 'https://photobooth.sogni.ai',
  apiUrl: 'https://photobooth-api.sogni.ai',
  assetUrl: 'https://cdn.sogni.ai',
};

// Staging URLs
const stagingUrls: EnvironmentURLs = {
  publicUrl: 'https://photobooth-staging.sogni.ai',
  apiUrl: 'https://photobooth-api-staging.sogni.ai',
  assetUrl: 'https://cdn.sogni.ai',
};

// Local development URLs (when accessed via localhost:5175 directly)
const developmentUrls: EnvironmentURLs = {
  publicUrl: 'http://localhost:5175',
  apiUrl: 'https://photobooth-api-local.sogni.ai',
  assetUrl: 'https://cdn.sogni.ai',
};

// Local secure development URLs (for https://photobooth-local.sogni.ai)
const localSecureUrls: EnvironmentURLs = {
  publicUrl: 'https://photobooth-local.sogni.ai',
  apiUrl: 'https://photobooth-api-local.sogni.ai',
  assetUrl: 'https://cdn.sogni.ai',
};

// Get URLs based on environment
export const getURLs = (): EnvironmentURLs => {
  const environment = import.meta.env.MODE || 'development';

  console.log(`Loading URLs for environment: ${environment}`);
  
  // Special handling for secure local development
  if (typeof window !== 'undefined' && 
      window.location.hostname === 'photobooth-local.sogni.ai') {
    console.log('Using secure local development URLs');
    return localSecureUrls;
  }
  
  switch (environment) {
    case 'production':
      return productionUrls;
    case 'staging':
      return stagingUrls;
    case 'development':
    default:
      return developmentUrls;
  }
};

// Export default URLs
export default getURLs(); 