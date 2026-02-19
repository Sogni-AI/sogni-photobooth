import React, { useState, useEffect, createContext, useContext } from 'react';
import App from '../App';
import AnalyticsDashboard from './admin/AnalyticsDashboard';
import Moderate from './admin/Moderate';
import ContestVote from './contest/ContestVote';
import HalloweenEvent from './events/HalloweenEvent';
import WinterEvent from './events/WinterEvent';
import GimiChallenge from './challenge/GimiChallenge';
import { MusicPlayerProvider } from '../context/MusicPlayerContext';
import { WinterMusicPlayerProvider } from '../context/WinterMusicPlayerContext';
import GlobalMusicPlayer from './shared/GlobalMusicPlayer';
import GlobalWinterMusicPlayer from './shared/GlobalWinterMusicPlayer';
import PageMetadata from './shared/PageMetadata';
import { redirectToAuth } from '../config/auth';

// Create navigation context
const NavigationContext = createContext();
export const useNavigation = () => useContext(NavigationContext);

const AppRouter = () => {
  const [currentRoute, setCurrentRoute] = useState(() => {
    // Check initial route
    const hash = window.location.hash;
    const pathname = window.location.pathname;

    // Handle /signup route - redirect to auth signup flow
    if (pathname === '/signup') {
      redirectToAuth('signup', 'PHOTOBOOTH');
      return 'main'; // Return main while redirect happens
    }

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
    if (hash === '#winter' || pathname === '/winter' || pathname === '/event/winter') {
      sessionStorage.setItem('winter-page-visited', 'true'); // Mark winter page as visited
      return 'winter';
    }
    if (pathname === '/event/bald-for-base') {
      return 'main'; // Bald for Base uses main app, just triggers deep link
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

  const navigateToWinter = () => {
    sessionStorage.setItem('winter-page-visited', 'true'); // Mark winter page as visited
    setCurrentRoute('winter');
    window.history.pushState({}, '', '/event/winter');
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
    const handleRouteChange = () => {
      const hash = window.location.hash;
      const pathname = window.location.pathname;
      if (pathname === '/signup') {
        redirectToAuth('signup', 'PHOTOBOOTH');
        return;
      }
      if (hash === '#analytics' || pathname === '/admin/analytics') {
        setCurrentRoute('analytics');
      } else if (hash === '#moderate' || pathname === '/admin/moderate') {
        setCurrentRoute('moderate');
      } else if (pathname === '/contest/vote') {
        setCurrentRoute('contest-vote');
      } else if (hash === '#halloween' || pathname === '/halloween' || pathname === '/event/halloween') {
        setCurrentRoute('halloween');
      } else if (hash === '#winter' || pathname === '/winter' || pathname === '/event/winter') {
        sessionStorage.setItem('winter-page-visited', 'true'); // Mark winter page as visited
        setCurrentRoute('winter');
      } else if (pathname === '/event/bald-for-base') {
        setCurrentRoute('main'); // Bald for Base uses main app, just triggers deep link
      } else if (pathname === '/challenge/gimi') {
        setCurrentRoute('gimi-challenge');
      } else {
        setCurrentRoute('main');
      }
    };

    // Listen for hash changes AND popstate (back button)
    window.addEventListener('hashchange', handleRouteChange);
    window.addEventListener('popstate', handleRouteChange);

    // Check initial route
    handleRouteChange();

    return () => {
      window.removeEventListener('hashchange', handleRouteChange);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);

  return (
    <NavigationContext.Provider value={{ navigateToCamera, navigateToContestVote, navigateToGimiChallenge, navigateToWinter }}>
      <MusicPlayerProvider>
        <WinterMusicPlayerProvider>
        {/* Dynamic page metadata for SEO and social sharing */}
        <PageMetadata />

        {/* Global music player - shows on all pages when enabled */}
        <GlobalMusicPlayer />
          <GlobalWinterMusicPlayer />


        {currentRoute === 'analytics' ? (
          <AnalyticsDashboard />
        ) : currentRoute === 'moderate' ? (
          <Moderate />
        ) : currentRoute === 'contest-vote' ? (
          <ContestVote />
        ) : currentRoute === 'halloween' ? (
          <HalloweenEvent />
        ) : currentRoute === 'winter' ? (
          <WinterEvent />
        ) : currentRoute === 'gimi-challenge' ? (
          <GimiChallenge />
        ) : (
          <App />
        )}
        </WinterMusicPlayerProvider>
      </MusicPlayerProvider>
    </NavigationContext.Provider>
  );
};

export default AppRouter;
