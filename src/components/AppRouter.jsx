import React, { useState, useEffect, createContext, useContext } from 'react';
import App from '../App';
import AnalyticsDashboard from './admin/AnalyticsDashboard';
import Moderate from './admin/Moderate';
import ContestVote from './contest/ContestVote';
import HalloweenEvent from './events/HalloweenEvent';
import GimiChallenge from './challenge/GimiChallenge';
import { MusicPlayerProvider } from '../context/MusicPlayerContext';
import GlobalMusicPlayer from './shared/GlobalMusicPlayer';
import PageMetadata from './shared/PageMetadata';
import GimiChallengeNotification from './shared/GimiChallengeNotification';

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
    if (hash === '#moderate' || pathname === '/admin/moderate') {
      return 'moderate';
    }
    if (pathname === '/contest/vote') {
      return 'contest-vote';
    }
    if (hash === '#halloween' || pathname === '/halloween' || pathname === '/event/halloween') {
      return 'halloween';
    }
    if (pathname === '/challenge/gimi') {
      return 'gimi-challenge';
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

  const navigateToContestVote = () => {
    setCurrentRoute('contest-vote');
    window.history.pushState({}, '', '/contest/vote');
  };

  const navigateToGimiChallenge = () => {
    setCurrentRoute('gimi-challenge');
    window.history.pushState({}, '', '/challenge/gimi');
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const pathname = window.location.pathname;
      if (hash === '#analytics' || pathname === '/admin/analytics') {
        setCurrentRoute('analytics');
      } else if (hash === '#moderate' || pathname === '/admin/moderate') {
        setCurrentRoute('moderate');
      } else if (pathname === '/contest/vote') {
        setCurrentRoute('contest-vote');
      } else if (hash === '#halloween' || pathname === '/halloween' || pathname === '/event/halloween') {
        setCurrentRoute('halloween');
      } else if (pathname === '/challenge/gimi') {
        setCurrentRoute('gimi-challenge');
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

  // Determine if we should show the Gimi Challenge notification
  const shouldShowNotification = currentRoute === 'main' || currentRoute === 'halloween';

  return (
    <NavigationContext.Provider value={{ navigateToCamera, navigateToContestVote, navigateToGimiChallenge }}>
      <MusicPlayerProvider>
        {/* Dynamic page metadata for SEO and social sharing */}
        <PageMetadata />

        {/* Global music player - shows on all pages when enabled */}
        <GlobalMusicPlayer />

        {/* Gimi Challenge notification - shows on public pages after 5 seconds */}
        {shouldShowNotification && <GimiChallengeNotification />}

        {currentRoute === 'analytics' ? (
          <AnalyticsDashboard />
        ) : currentRoute === 'moderate' ? (
          <Moderate />
        ) : currentRoute === 'contest-vote' ? (
          <ContestVote />
        ) : currentRoute === 'halloween' ? (
          <HalloweenEvent />
        ) : currentRoute === 'gimi-challenge' ? (
          <GimiChallenge />
        ) : (
          <App />
        )}
      </MusicPlayerProvider>
    </NavigationContext.Provider>
  );
};

export default AppRouter;
