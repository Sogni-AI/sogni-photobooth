import React, { useState, useEffect, createContext, useContext } from 'react';
import App from '../App';
import AnalyticsDashboard from './admin/AnalyticsDashboard';
import HalloweenEvent from './events/HalloweenEvent';
import { MusicPlayerProvider } from '../context/MusicPlayerContext';
import GlobalMusicPlayer from './shared/GlobalMusicPlayer';

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
    if (hash === '#halloween' || pathname === '/halloween') {
      return 'halloween';
    }
    return 'main';
  });

  const navigateToCamera = () => {
    console.log('🎃 Navigating to camera view');
    setCurrentRoute('main');
    window.history.pushState({}, '', '/?page=camera&skipWelcome=true');
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const pathname = window.location.pathname;
      if (hash === '#analytics' || pathname === '/admin/analytics') {
        setCurrentRoute('analytics');
      } else if (hash === '#halloween' || pathname === '/halloween') {
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
        {/* Global music player - shows on all pages when enabled */}
        <GlobalMusicPlayer />
        
        {currentRoute === 'analytics' ? (
          <AnalyticsDashboard />
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
