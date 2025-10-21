// Authentication configuration matching sogni-dashboard-v2 pattern

export const getAuthConfig = () => {
  // Determine environment based on hostname
  const hostname = window.location.hostname;
  
  // Only treat localhost and 127.0.0.1 as local development
  const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1';
  const isStaging = hostname.includes('staging');
  
  let appUrl: string;
  
  if (isLocalDev) {
    appUrl = 'https://app-local.sogni.ai';
  } else if (isStaging) {
    appUrl = 'https://app-staging.sogni.ai';
  } else {
    // All sogni.ai subdomains (including photobooth-local.sogni.ai) use production app.sogni.ai
    appUrl = 'https://app.sogni.ai';
  }
  
  console.log(`🔐 Auth Environment detection:`, {
    hostname,
    isLocalDev,
    isStaging,
    appUrl,
    authUrl: `${appUrl}/authenticate/`
  });
  
  return {
    appUrl,
    authUrl: `${appUrl}/authenticate/`,
    signupUrl: `${appUrl}/signup/`
  };
};

export const redirectToAuth = (mode: 'login' | 'signup' = 'login', promoCode?: string) => {
  const config = getAuthConfig();
  const currentUrl = window.location.href;
  
  const url = new URL(mode === 'signup' ? config.signupUrl : config.authUrl);
  url.searchParams.set('redirect', currentUrl);
  url.searchParams.set('authMode', 'cookies');
  
  // Add promo code if provided
  if (promoCode) {
    url.searchParams.set('code', promoCode);
  }
  
  console.log(`🔐 Redirecting to ${mode} at:`, url.toString());
  window.location.href = url.toString();
};

export default {
  getAuthConfig,
  redirectToAuth
};
