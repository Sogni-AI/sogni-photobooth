/**
 * URL configurations for different environments
 */

interface EnvironmentURLs {
  publicUrl: string;
  apiUrl: string;
}

// Production URLs
const productionUrls: EnvironmentURLs = {
  publicUrl: 'https://superapps.sogni.ai/photobooth',
  apiUrl: 'https://superapps.sogni.ai/photobooth/api',
};

// Staging URLs
const stagingUrls: EnvironmentURLs = {
  publicUrl: 'https://photobooth-staging.sogni.ai',
  apiUrl: 'https://photobooth-staging.sogni.ai/api',
};

// Local development URLs
const developmentUrls: EnvironmentURLs = {
  publicUrl: 'http://localhost:5175',
  apiUrl: 'http://localhost:3001/api',
};

// Local secure development URLs (for https://photobooth-local.sogni.ai)
const localSecureUrls: EnvironmentURLs = {
  publicUrl: 'https://photobooth-local.sogni.ai',
  apiUrl: 'https://photobooth-local.sogni.ai/api',
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