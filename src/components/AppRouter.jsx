import React, { useState, useEffect, createContext, useContext } from 'react';
import App from '../App';
import AnalyticsDashboard from './admin/AnalyticsDashboard';
import ContestResults from './admin/ContestResults';
import ContestVote from './contest/ContestVote';
import HalloweenEvent from './events/HalloweenEvent';
import { MusicPlayerProvider } from '../context/MusicPlayerContext';
import GlobalMusicPlayer from './shared/GlobalMusicPlayer';
import HalloweenNotificationTooltip from './notifications/HalloweenNotificationTooltip';
import PageMetadata from './shared/PageMetadata';

// Create navigation context
const NavigationContext = createContext();
export const useNavigation = () => useContext(NavigationContext);

const AppRouter = () => {
  const [currentRoute, setCurrentRoute] = useState(() => {
    // Check initial route
    const hash = window.location.hash;
    const pathname = window.location.pathname;
    if (hash === '#analytics' || pathname === '/admin/analytics') {
      return 'analytics';
    }
    if (hash === '#contest' || pathname === '/admin/contest/results') {
      return 'contest';
    }
    if (pathname === '/contest/vote') {
      return 'contest-vote';
    }
    if (hash === '#halloween' || pathname === '/halloween' || pathname === '/event/halloween') {
      return 'halloween';
    }
    return 'main';
  });

  const navigateToCamera = () => {
    console.log('🎃 Navigating to camera start menu (picker view)');
    setCurrentRoute('main');
    window.history.pushState({}, '', '/?skipWelcome=true');
  };

  const navigateToHalloween = () => {
    setCurrentRoute('halloween');
    window.history.pushState({}, '', '/event/halloween');
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const pathname = window.location.pathname;
      if (hash === '#analytics' || pathname === '/admin/analytics') {
        setCurrentRoute('analytics');
      } else if (hash === '#contest' || pathname === '/admin/contest/results') {
        setCurrentRoute('contest');
      } else if (pathname === '/contest/vote') {
        setCurrentRoute('contest-vote');
      } else if (hash === '#halloween' || pathname === '/halloween' || pathname === '/event/halloween') {
        setCurrentRoute('halloween');
      } else {
        setCurrentRoute('main');
      }
    };

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);
    
    // Check initial hash
    handleHashChange();

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  return (
    <NavigationContext.Provider value={{ navigateToCamera }}>
      <MusicPlayerProvider>
        {/* Dynamic page metadata for SEO and social sharing */}
        <PageMetadata />
        
        {/* Global music player - shows on all pages when enabled */}
        <GlobalMusicPlayer />

        {/* Halloween notification tooltip - only on main page */}
        {currentRoute === 'main' && (
          <HalloweenNotificationTooltip onNavigate={navigateToHalloween} />
        )}

        {currentRoute === 'analytics' ? (
          <AnalyticsDashboard />
        ) : currentRoute === 'contest' ? (
          <ContestResults />
        ) : currentRoute === 'contest-vote' ? (
          <ContestVote />
        ) : currentRoute === 'halloween' ? (
          <HalloweenEvent />
        ) : (
          <App />
        )}
      </MusicPlayerProvider>
    </NavigationContext.Provider>
  );
};

export default AppRouter;
