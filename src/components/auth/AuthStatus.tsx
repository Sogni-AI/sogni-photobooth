import React, { useState } from 'react';
import { useSogniAuth } from '../../services/sogniAuth';
import { redirectToAuth } from '../../config/auth';

export const AuthStatus: React.FC = () => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { isAuthenticated, authMode, user, logout, isLoading } = useSogniAuth();

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  const handleLoginClick = () => {
    redirectToAuth('login');
  };

  // If not authenticated, show simple login button (exactly like dashboard)
  if (!isAuthenticated) {
    return (
      <button
        onClick={handleLoginClick}
        disabled={isLoading}
        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-all duration-200 hover:shadow-xl"
      >
        {isLoading ? 'Loading...' : 'Login'}
      </button>
    );
  }

  // If authenticated, show username with dropdown (like dashboard)
  return (
    <div className="relative">
      <span
        onClick={() => setShowUserMenu(!showUserMenu)}
        style={{
          color: 'white',
          fontSize: '14px',
          fontWeight: '500',
          cursor: 'pointer'
        }}
      >
        @{authMode === 'demo' ? 'Demo Mode' : user?.username || 'User'}
      </span>

      {showUserMenu && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: '0',
          backgroundColor: '#2d3748',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 100,
          padding: '8px',
          width: '120px'
        }}>
          <button
            onClick={handleLogout}
            disabled={isLoading}
            style={{
              width: '100%',
              border: 'none',
              background: '#4a5568',
              color: 'white',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              borderRadius: '20px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: '500',
              textAlign: 'center',
              opacity: isLoading ? 0.5 : 1,
              outline: 'none'
            }}
            onMouseOver={(e) => {
              if (!isLoading) e.currentTarget.style.opacity = '0.8';
            }}
            onMouseOut={(e) => {
              if (!isLoading) e.currentTarget.style.opacity = '1';
            }}
          >
            {isLoading ? 'Logging out...' : 'Logout'}
          </button>
        </div>
      )}

      {/* Click outside to close */}
      {showUserMenu && (
        <div 
          style={{
            position: 'fixed',
            inset: '0',
            zIndex: 40
          }}
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </div>
  );
};
