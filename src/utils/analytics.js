// Google Analytics utility for Sogni Photobooth
// This file handles analytics initialization and tracking

/**
 * Configuration values for Google Analytics
 * These can be set in .env.local with:
 * VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
 * VITE_GA_DOMAIN=sogni.ai
 * VITE_GA_ENABLED=true|false
 */
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID || '';
const GA_DOMAIN = import.meta.env.VITE_GA_DOMAIN || 'auto';
const GA_ENABLED = import.meta.env.VITE_GA_ENABLED !== 'false';

// App version for version tracking
const APP_VERSION = import.meta.env.VITE_APP_VERSION || '1.0.0';

/**
 * Initialize Google Analytics
 * This function:
 * 1. Checks if GA is enabled and has a measurement ID
 * 2. Injects the gtag.js script into the document head
 * 3. Initializes the dataLayer
 * 4. Configures the GA tracker with custom parameters
 * 5. Captures UTM parameters and traffic source data
 */
export const initializeGA = () => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID) {
    console.log('❌ Google Analytics is disabled or measurement ID is not provided');
    return;
  }

  try {
    // Create dataLayer array before defining gtag
    window.dataLayer = window.dataLayer || [];
    
    // Define gtag using a function expression instead of declaration
    window.gtag = function() {
      window.dataLayer.push(arguments);
    };
    
    // Set initial dataLayer values
    window.gtag('js', new Date());
    
    // Capture traffic source parameters from URL
    const urlParams = new URLSearchParams(window.location.search);
    const trafficConfig = {
      cookie_domain: GA_DOMAIN,
      send_page_view: true,
      app_version: APP_VERSION,
      anonymize_ip: true,
    };
    
    // Capture UTM parameters if present
    const utmParams = {
      utm_source: urlParams.get('utm_source'),
      utm_medium: urlParams.get('utm_medium'),
      utm_campaign: urlParams.get('utm_campaign'),
      utm_term: urlParams.get('utm_term'),
      utm_content: urlParams.get('utm_content'),
    };
    
    // Send custom event with UTM parameters for additional tracking
    const hasUTM = Object.values(utmParams).some(val => val !== null);
    if (hasUTM) {
      window.gtag('event', 'campaign_visit', {
        campaign_source: utmParams.utm_source || 'direct',
        campaign_medium: utmParams.utm_medium || 'none',
        campaign_name: utmParams.utm_campaign || '(not set)',
        campaign_term: utmParams.utm_term || '(not set)',
        campaign_content: utmParams.utm_content || '(not set)',
      });
    }
    
    // Capture document referrer for organic search tracking
    if (document.referrer) {
      try {
        const referrerUrl = new URL(document.referrer);
        const referrerHost = referrerUrl.hostname;
        
        // Check if referrer is a search engine
        const searchEngines = {
          'google': ['google.com', 'google.co.uk', 'google.ca', 'google.com.au'],
          'bing': ['bing.com'],
          'yahoo': ['yahoo.com', 'search.yahoo.com'],
          'duckduckgo': ['duckduckgo.com'],
          'baidu': ['baidu.com'],
          'yandex': ['yandex.com', 'yandex.ru'],
        };
        
        let searchEngine = null;
        for (const [engine, domains] of Object.entries(searchEngines)) {
          if (domains.some(domain => referrerHost.includes(domain))) {
            searchEngine = engine;
            break;
          }
        }
        
        if (searchEngine) {
          // Extract search query if available (most search engines now hide this)
          let searchQuery = referrerUrl.searchParams.get('q') || // Google, Bing, DuckDuckGo
                           referrerUrl.searchParams.get('p') || // Yahoo
                           '(not provided)';
          
          // Track organic search visit
          window.gtag('event', 'organic_search_visit', {
            search_engine: searchEngine,
            search_query: searchQuery,
            referrer: document.referrer
          });
        }
      } catch (error) {
        console.warn('Could not parse referrer URL:', error);
      }
    }
    
    // Configure GA4
    window.gtag('config', GA_MEASUREMENT_ID, trafficConfig);

    // Only after gtag is defined properly, load the script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);
  } catch (error) {
    console.error('Error initializing Google Analytics:', error);
  }
};

/**
 * Track page views
 * @param {string} path - The path/page to track
 */
export const trackPageView = (path) => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('config', GA_MEASUREMENT_ID, {
      page_path: path,
      app_version: APP_VERSION, // Include version in page view
    });
  } catch (error) {
    console.error('Error tracking page view:', error);
  }
};

/**
 * Track events
 * @param {string} category - Event category
 * @param {string} action - Event action
 * @param {string|null} label - Event label (optional)
 * @param {number|null} value - Event value (optional)
 */
export const trackEvent = (category, action, label = null, value = null) => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    const eventParams = {
      event_category: category,
      app_version: APP_VERSION, // Include version in events
    };

    if (label !== null) {
      eventParams.event_label = label;
    }

    if (value !== null) {
      eventParams.value = value;
    }

    window.gtag('event', action, eventParams);
  } catch (error) {
    console.error('Error tracking event:', error);
  }
};

/**
 * Check if Google Analytics is properly loaded and working
 * @returns {boolean} Whether GA is functioning
 */
export const isGAWorking = () => {
  return !!(GA_ENABLED && GA_MEASUREMENT_ID && window.gtag && window.dataLayer);
};

/**
 * Track ecommerce: View Item
 * Called when user views products in the purchase modal
 * @param {Array} items - Array of product items with structure:
 *   - item_id: Product ID
 *   - item_name: Product name/nickname
 *   - price: Unit price in currency
 *   - currency: Currency code (USD, EUR, etc.)
 *   - quantity: Always 1 for credit bundles
 *   - item_category: "Spark Points" or similar
 */
export const trackViewItem = (items) => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    // Calculate total value from all items
    const value = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const currency = items[0]?.currency || 'USD';

    window.gtag('event', 'view_item', {
      currency: currency,
      value: value,
      items: items
    });
  } catch (error) {
    console.error('Error tracking view_item:', error);
  }
};

/**
 * Track ecommerce: Begin Checkout
 * Called when user clicks "Buy" on a specific product
 * @param {Object} item - Single product item with structure:
 *   - item_id: Product ID
 *   - item_name: Product name/nickname
 *   - price: Unit price in currency
 *   - currency: Currency code (USD, EUR, etc.)
 *   - quantity: Always 1 for credit bundles
 *   - item_category: "Spark Points" or similar
 */
export const trackBeginCheckout = (item) => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    const value = item.price * item.quantity;
    const currency = item.currency || 'USD';

    window.gtag('event', 'begin_checkout', {
      currency: currency,
      value: value,
      items: [item]
    });
  } catch (error) {
    console.error('Error tracking begin_checkout:', error);
  }
};

/**
 * Track ecommerce: Purchase
 * Called when a purchase is successfully completed
 * @param {Object} purchaseData - Purchase data with structure:
 *   - transaction_id: Unique transaction ID from Stripe
 *   - value: Total transaction value
 *   - currency: Currency code (USD, EUR, etc.)
 *   - items: Array of purchased items
 *   - affiliation: Optional - "Sogni Photobooth" or similar
 */
export const trackPurchase = (purchaseData) => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'purchase', {
      transaction_id: purchaseData.transaction_id,
      value: purchaseData.value,
      currency: purchaseData.currency || 'USD',
      affiliation: purchaseData.affiliation || 'Sogni Photobooth',
      items: purchaseData.items
    });
  } catch (error) {
    console.error('Error tracking purchase:', error);
  }
};

/**
 * Track user authentication events
 */

/**
 * Track sign up event
 * @param {string} method - Sign up method (e.g., 'email', 'social')
 */
export const trackSignUp = (method = 'email') => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'sign_up', {
      method: method
    });
  } catch (error) {
    console.error('Error tracking sign_up:', error);
  }
};

/**
 * Track login event
 * @param {string} method - Login method (e.g., 'email', 'social')
 */
export const trackLogin = (method = 'email') => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'login', {
      method: method
    });
  } catch (error) {
    console.error('Error tracking login:', error);
  }
};

/**
 * Track content and engagement events
 */

/**
 * Track when user generates an AI image
 * @param {Object} params - Generation parameters
 *   - content_type: Type of generation (e.g., 'ai_portrait', 'ai_style')
 *   - item_id: Style ID or model used
 *   - method: Generation method (e.g., 'camera', 'upload')
 *   - value: Number of images generated
 */
export const trackGenerateContent = (params) => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'generate_content', {
      content_type: params.content_type || 'ai_image',
      item_id: params.item_id,
      method: params.method || 'unknown',
      value: params.value || 1
    });
  } catch (error) {
    console.error('Error tracking generate_content:', error);
  }
};

/**
 * Track when user shares content
 * @param {string} method - Share method (e.g., 'social', 'link', 'download', 'qr_code')
 * @param {string} contentType - Type of content shared (e.g., 'ai_image', 'gallery')
 * @param {string} itemId - Optional item identifier
 */
export const trackShare = (method, contentType = 'ai_image', itemId = null) => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    const params = {
      method: method,
      content_type: contentType
    };

    if (itemId) {
      params.item_id = itemId;
    }

    window.gtag('event', 'share', params);
  } catch (error) {
    console.error('Error tracking share:', error);
  }
};

/**
 * Track when user selects content/style
 * @param {string} contentType - Type of content (e.g., 'ai_style', 'filter', 'theme')
 * @param {string} itemId - Content identifier
 */
export const trackSelectContent = (contentType, itemId) => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'select_content', {
      content_type: contentType,
      item_id: itemId
    });
  } catch (error) {
    console.error('Error tracking select_content:', error);
  }
};

/**
 * Conversion funnel events
 */

/**
 * Track when user encounters out of credits (generate_lead)
 * This is a key conversion funnel entry point
 * @param {string} trigger - What triggered the out of credits (e.g., 'generate', 'enhance', 'refresh')
 */
export const trackOutOfCredits = (trigger = 'unknown') => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'generate_lead', {
      value: 1,
      currency: 'USD',
      lead_source: 'out_of_credits',
      trigger: trigger
    });
  } catch (error) {
    console.error('Error tracking generate_lead:', error);
  }
};

/**
 * Track when user views their gallery/photo grid
 */
export const trackViewGallery = () => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'view_item_list', {
      item_list_id: 'photo_gallery',
      item_list_name: 'Photo Gallery'
    });
  } catch (error) {
    console.error('Error tracking view_item_list:', error);
  }
};

/**
 * Track when user downloads image(s)
 * @param {number} count - Number of images downloaded
 * @param {boolean} includesFrame - Whether download includes frame
 * @param {string} format - File format (jpg, png)
 */
export const trackDownload = (count = 1, includesFrame = false, format = 'jpg') => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'download', {
      content_type: 'ai_image',
      item_count: count,
      includes_frame: includesFrame,
      file_format: format
    });
  } catch (error) {
    console.error('Error tracking download:', error);
  }
};

/**
 * Track engagement time and interaction depth
 * @param {number} durationSeconds - How long the user engaged
 * @param {string} engagementType - Type of engagement (e.g., 'photo_editing', 'browsing')
 */
export const trackEngagement = (durationSeconds, engagementType = 'general') => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    window.gtag('event', 'user_engagement', {
      engagement_time_msec: durationSeconds * 1000,
      engagement_type: engagementType
    });
  } catch (error) {
    console.error('Error tracking user_engagement:', error);
  }
};

/**
 * Session batch tracking utilities
 */

/**
 * Initialize or get session batch counter
 * @returns {number} Current session batch count
 */
const getSessionBatchCount = () => {
  try {
    const count = sessionStorage.getItem('sogni_session_batch_count');
    return count ? parseInt(count, 10) : 0;
  } catch (error) {
    return 0;
  }
};

/**
 * Increment and return session batch counter
 * @returns {number} New batch count
 */
const incrementSessionBatchCount = () => {
  try {
    const currentCount = getSessionBatchCount();
    const newCount = currentCount + 1;
    sessionStorage.setItem('sogni_session_batch_count', newCount.toString());
    return newCount;
  } catch (error) {
    console.error('Error incrementing batch count:', error);
    return 1;
  }
};

/**
 * Get total images generated this session
 * @returns {number} Total images count
 */
const getSessionImageCount = () => {
  try {
    const count = sessionStorage.getItem('sogni_session_image_count');
    return count ? parseInt(count, 10) : 0;
  } catch (error) {
    return 0;
  }
};

/**
 * Add to session image counter
 * @param {number} count - Number of images to add
 * @returns {number} New total
 */
const addToSessionImageCount = (count) => {
  try {
    const currentCount = getSessionImageCount();
    const newCount = currentCount + count;
    sessionStorage.setItem('sogni_session_image_count', newCount.toString());
    return newCount;
  } catch (error) {
    console.error('Error updating image count:', error);
    return count;
  }
};

/**
 * Track when user generates a batch of AI images
 * This is the main batch generation tracking function
 * @param {Object} params - Batch generation parameters
 *   - batch_size: Number of images in this batch
 *   - style_id: Style/prompt being used
 *   - model: Model being used
 *   - source: 'camera' or 'upload'
 *   - is_regeneration: Whether this is a "Generate More" operation
 */
export const trackBatchGeneration = (params) => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    // Increment session counters
    const sessionBatchCount = incrementSessionBatchCount();
    const sessionImageTotal = addToSessionImageCount(params.batch_size || 1);

    // Track the batch generation with rich metadata
    window.gtag('event', 'generate_batch', {
      batch_size: params.batch_size || 1,
      style_id: params.style_id || 'unknown',
      model: params.model || 'unknown',
      source: params.source || 'unknown',
      is_regeneration: params.is_regeneration || false,
      session_batch_count: sessionBatchCount,
      session_image_total: sessionImageTotal
    });

    // Also track as standard generate_content for consistency
    trackGenerateContent({
      content_type: 'ai_image_batch',
      item_id: params.style_id || 'unknown',
      method: params.source || 'unknown',
      value: params.batch_size || 1
    });

    // Track milestone events for high-value users
    if (sessionBatchCount === 3) {
      window.gtag('event', 'power_user_3_batches', { batch_count: 3 });
    } else if (sessionBatchCount === 5) {
      window.gtag('event', 'power_user_5_batches', { batch_count: 5 });
    } else if (sessionBatchCount === 10) {
      window.gtag('event', 'power_user_10_batches', { batch_count: 10 });
    }

    // Track image count milestones
    if (sessionImageTotal >= 50 && sessionImageTotal < 60) {
      window.gtag('event', 'power_user_50_images', { image_count: sessionImageTotal });
    } else if (sessionImageTotal >= 100 && sessionImageTotal < 110) {
      window.gtag('event', 'power_user_100_images', { image_count: sessionImageTotal });
    }
  } catch (error) {
    console.error('Error tracking batch generation:', error);
  }
};

/**
 * Track batch completion (when all images in batch finish generating)
 * @param {Object} params - Completion parameters
 *   - batch_size: Number of images in batch
 *   - duration_seconds: How long the batch took
 *   - success_count: Number of successful generations
 *   - failure_count: Number of failed generations
 */
export const trackBatchComplete = (params) => {
  if (!GA_ENABLED || !GA_MEASUREMENT_ID || !window.gtag) {
    return;
  }

  try {
    const sessionBatchCount = getSessionBatchCount();
    const sessionImageTotal = getSessionImageCount();

    window.gtag('event', 'batch_complete', {
      batch_size: params.batch_size || 1,
      duration_seconds: params.duration_seconds || 0,
      success_count: params.success_count || 0,
      failure_count: params.failure_count || 0,
      success_rate: params.batch_size > 0 ? (params.success_count / params.batch_size) : 0,
      session_batch_count: sessionBatchCount,
      session_image_total: sessionImageTotal
    });
  } catch (error) {
    console.error('Error tracking batch completion:', error);
  }
};

/**
 * Get session statistics for debugging or display
 * @returns {Object} Session stats
 */
export const getSessionStats = () => {
  return {
    batchCount: getSessionBatchCount(),
    imageCount: getSessionImageCount()
  };
}; 