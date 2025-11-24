import React from 'react';
import ReactDOM from 'react-dom/client';
import { HelmetProvider } from 'react-helmet-async';
import AppRouter from './components/AppRouter';
import { AppProvider } from './context/AppContext.tsx';
import { ToastProvider } from './context/ToastContext';
import { RewardsProvider } from './context/RewardsContext.tsx';
import ErrorBoundary from './components/shared/ErrorBoundary';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <HelmetProvider>
        <AppProvider>
          <ToastProvider>
            <RewardsProvider>
              <AppRouter />
            </RewardsProvider>
          </ToastProvider>
        </AppProvider>
      </HelmetProvider>
    </ErrorBoundary>
  </React.StrictMode>
);
