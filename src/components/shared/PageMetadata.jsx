import { useEffect, useState } from 'react';

const PageMetadata = () => {
  const [pathname, setPathname] = useState(window.location.pathname);

  // Listen for pathname changes
  useEffect(() => {
    const updatePathname = () => {
      setPathname(window.location.pathname);
    };

    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', updatePathname);
    
    // Listen for custom pushState events (for SPA navigation)
    const originalPushState = window.history.pushState;
    window.history.pushState = function(...args) {
      originalPushState.apply(window.history, args);
      updatePathname();
    };
    
    return () => {
      window.removeEventListener('popstate', updatePathname);
      window.history.pushState = originalPushState;
    };
  }, []);

  useEffect(() => {
    // Define metadata for different routes
    const routeMetadata = {
      '/event/halloween': {
        // Don't override Halloween event metadata - it has custom Helmet tags
        skipUpdate: true
      },
      '/event/winter': {
        // Don't override Winter event metadata - it has custom Helmet tags
        skipUpdate: true
      },
      '/event/base-hero': {
        // Don't override Base Hero metadata - server handles meta tag injection
        skipUpdate: true
      },
      '/contest/vote': {
        title: '🎃 Halloween Contest - Vote Now! | Sogni AI Photobooth',
        description: 'Vote for your favorite AI-generated Halloween photos! Browse amazing AI art created by the community and support your favorites by voting.',
        ogTitle: '🎃 Vote for Your Favorite Halloween AI Photos!',
        ogDescription: 'Join the Sogni Halloween Contest! Vote for the most creative AI-generated photos and help choose the winners. Browse unique AI art and cast your vote now!',
        twitterTitle: '🎃 Halloween AI Photo Contest - Vote Now!',
        twitterDescription: 'Amazing AI-generated Halloween photos from the Sogni community. Vote for your favorites!',
        keywords: 'AI photo contest, Halloween contest, vote AI art, AI generated photos, community voting, Sogni contest'
      },
      '/admin/moderate': {
        title: '🛡️ Moderation Panel - Admin Dashboard | Sogni AI Photobooth',
        description: 'Content moderation dashboard for moderating Halloween AI photo contest entries, viewing submissions, and managing contest results. Approve or reject entries and track contest statistics.',
        ogTitle: '🛡️ Content Moderation Dashboard',
        ogDescription: 'Moderate Halloween AI photo contest entries, review submissions, and manage contest results. View statistics and moderate community submissions.',
        twitterTitle: '🛡️ Moderation Dashboard - Halloween AI Photo Contest',
        twitterDescription: 'Administration panel for moderating AI-generated Halloween photo contest entries and viewing results.'
      },
      '/challenge/gimi': {
        title: 'Turn One Photo Into 8 Viral Posts – $1,000 Gimi Challenge | Sogni AI Photobooth',
        description: 'Join the Sogni x Gimi Creator Challenge! Create 8 viral photo transformations in 60 seconds and compete for $1,000 USDC. Use photobooth.sogni.ai with 200+ AI styles. Sign up free on Gimi.co.',
        ogTitle: 'Turn One Photo Into 8 Viral Posts – Win $1,000!',
        ogDescription: 'Join the Sogni x Gimi Creator Challenge! Create 8 viral photo transformations in 60 seconds with 200+ AI styles. Compete for $1,000 USDC based on engagement. Sign up free on Gimi.co.',
        ogImage: 'https://photobooth.sogni.ai/promo/gimi/Sogni Gimi Photobooth Banner.jpg',
        twitterTitle: 'Turn One Photo Into 8 Viral Posts – Win $1,000!',
        twitterDescription: 'Join the Sogni x Gimi Creator Challenge! Create viral AI photo transformations in 60 seconds. 200+ styles. $1,000 USDC prize pool. Sign up free on Gimi.co.',
        twitterImage: 'https://photobooth.sogni.ai/promo/gimi/Sogni Gimi Photobooth Banner.jpg',
        keywords: 'AI photo challenge, creator challenge, Gimi.co, viral content, AI photobooth, photo transformation, creator rewards, USDC prizes, social media content, TikTok challenge, Instagram challenge'
      },
      default: {
        title: 'Sogni AI Photobooth | Free AI Headshot Generator & Portrait Maker',
        description: 'Create stunning AI headshots and portraits with Sogni Photobooth—your all-in-one AI headshot generator, free AI portrait generator, and anime PFP maker. Transform your photos with 200+ styles in seconds!',
        ogTitle: 'Sogni AI Photobooth | Free AI Headshot Generator & Portrait Maker',
        ogDescription: 'Create stunning AI headshots and portraits with Sogni Photobooth—your free AI portrait generator and anime PFP maker. Transform your photos with 200+ AI styles in seconds!',
        twitterTitle: 'Sogni AI Photobooth | Free AI Headshot & Portrait Generator',
        twitterDescription: 'Create stunning AI headshots, portraits, and anime PFPs with our free AI generator. 200+ styles, instant results!',
        keywords: 'AI headshot generator, free AI portrait generator, AI portrait generator, PFP maker, anime PFP maker, AI photo generator, AI photobooth, AI selfie generator, profile picture maker, anime avatar creator, AI art generator, portrait AI, headshot maker, AI image generator, photo transformer'
      }
    };

    // Get metadata for current route or use default
    const metadata = routeMetadata[pathname] || routeMetadata.default;

    // Skip metadata updates for routes that have custom Helmet tags
    if (metadata.skipUpdate) {
      return;
    }

    // Update document title
    document.title = metadata.title;

    // Update meta tags
    const updateMetaTag = (selector, content) => {
      let tag = document.querySelector(selector);
      if (tag) {
        if (selector.includes('[property')) {
          tag.setAttribute('content', content);
        } else {
          tag.setAttribute('content', content);
        }
      }
    };

    // Update description
    updateMetaTag('meta[name="description"]', metadata.description);
    
    // Update Open Graph tags
    updateMetaTag('meta[property="og:title"]', metadata.ogTitle);
    updateMetaTag('meta[property="og:description"]', metadata.ogDescription);
    updateMetaTag('meta[property="og:url"]', `https://photobooth.sogni.ai${pathname}`);
    
    // Update og:image if provided
    if (metadata.ogImage) {
      updateMetaTag('meta[property="og:image"]', metadata.ogImage);
    }
    
    // Update Twitter tags
    updateMetaTag('meta[name="twitter:title"]', metadata.twitterTitle);
    updateMetaTag('meta[name="twitter:description"]', metadata.twitterDescription);
    updateMetaTag('meta[property="twitter:url"]', `https://photobooth.sogni.ai${pathname}`);
    
    // Update twitter:image if provided
    if (metadata.twitterImage) {
      updateMetaTag('meta[name="twitter:image"]', metadata.twitterImage);
    }

    // Add keywords if available
    if (metadata.keywords) {
      let keywordsTag = document.querySelector('meta[name="keywords"]');
      if (!keywordsTag) {
        keywordsTag = document.createElement('meta');
        keywordsTag.setAttribute('name', 'keywords');
        document.head.appendChild(keywordsTag);
      }
      keywordsTag.setAttribute('content', metadata.keywords);
    }
  }, [pathname]); // Re-run whenever pathname changes

  return null; // This component doesn't render anything
};

export default PageMetadata;

