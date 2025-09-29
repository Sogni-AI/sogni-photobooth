import React, { useState, useEffect } from 'react';
import App from '../App';
import AnalyticsDashboard from './admin/AnalyticsDashboard';

const AppRouter = () => {
  const [currentRoute, setCurrentRoute] = useState(() => {
    // Check initial route
    const hash = window.location.hash;
    const pathname = window.location.pathname;
    if (hash === '#analytics' || pathname === '/admin/analytics') {
      return 'analytics';
    }
    return 'main';
  });

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      const pathname = window.location.pathname;
      if (hash === '#analytics' || pathname === '/admin/analytics') {
        setCurrentRoute('analytics');
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

  if (currentRoute === 'analytics') {
    return <AnalyticsDashboard />;
  }

  return <App />;
};

export default AppRouter;
