import { useEffect } from 'react';

const PageMetadata = () => {
  useEffect(() => {
    const pathname = window.location.pathname;
    
    // Define metadata for different routes
    const routeMetadata = {
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
      default: {
        title: 'Sogni AI Photobooth',
        description: 'Sogni Photobooth: Capture and transform your photos with AI styles',
        ogTitle: 'Sogni AI Photobooth',
        ogDescription: 'Sogni Photobooth: Capture and transform your photos with AI styles',
        twitterTitle: 'Sogni-AI/sogni-photobooth: Sogni Photobooth: Capture and transform your photos with AI styles',
        twitterDescription: 'Sogni Photobooth: Capture and transform your photos with AI styles'
      }
    };

    // Get metadata for current route or use default
    const metadata = routeMetadata[pathname] || routeMetadata.default;

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
    
    // Update Twitter tags
    updateMetaTag('meta[name="twitter:title"]', metadata.twitterTitle);
    updateMetaTag('meta[name="twitter:description"]', metadata.twitterDescription);
    updateMetaTag('meta[property="twitter:url"]', `https://photobooth.sogni.ai${pathname}`);

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

    // Set up listener for pathname changes (for SPAs)
    const handleLocationChange = () => {
      // Re-run the effect when location changes
      const event = new Event('locationchange');
      window.dispatchEvent(event);
    };

    // Listen for popstate (back/forward navigation)
    window.addEventListener('popstate', handleLocationChange);
    
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
    };
  }, []);

  // Re-run when pathname might have changed
  useEffect(() => {
    const handleChange = () => {
      // Trigger re-render by just listening
    };
    
    window.addEventListener('locationchange', handleChange);
    
    return () => {
      window.removeEventListener('locationchange', handleChange);
    };
  });

  return null; // This component doesn't render anything
};

export default PageMetadata;

