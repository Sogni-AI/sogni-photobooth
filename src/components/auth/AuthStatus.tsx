import React, { useState } from 'react';
import { useSogniAuth } from '../../services/sogniAuth';
import { redirectToAuth } from '../../config/auth';
import { useWallet } from '../../hooks/useWallet';
import { formatTokenAmount, isPremiumBoosted, getTokenLabel, redirectToWallet } from '../../services/walletService';
import { TokenType } from '../../types/wallet';

export const AuthStatus: React.FC = () => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { isAuthenticated, authMode, user, logout, isLoading } = useSogniAuth();
  const { balances, tokenType, switchPaymentMethod } = useWallet();

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  const handleLoginClick = () => {
    redirectToAuth('login');
  };

  const handleTogglePaymentMethod = () => {
    const newType: TokenType = tokenType === 'spark' ? 'sogni' : 'spark';
    switchPaymentMethod(newType);
  };

  const handleBuyPremiumSpark = () => {
    redirectToWallet();
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

  // Get balance display info
  const currentBalance = balances?.[tokenType]?.net || '0';
  const tokenLabel = getTokenLabel(tokenType);
  const isPremium = isPremiumBoosted(balances, tokenType);

  // If authenticated, show username with balance inline
  return (
    <div className="relative">
      <div
        onClick={() => setShowUserMenu(!showUserMenu)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: 'white',
          fontSize: '14px',
          fontWeight: '500',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <span>@{authMode === 'demo' ? 'Demo Mode' : user?.username || 'User'}</span>
        
        {/* Show balance only when NOT in demo mode */}
        {authMode !== 'demo' && balances && (
          <>
            <span style={{ opacity: 0.5 }}>|</span>
            <span style={{ 
              color: isPremium ? '#fbbf24' : 'white',
              fontWeight: isPremium ? '600' : '500'
            }}>
              {formatTokenAmount(currentBalance)} {tokenLabel}
            </span>
            {isPremium && (
              <span style={{ fontSize: '16px' }} title="Premium Boosted!">✨</span>
            )}
          </>
        )}
      </div>

      {showUserMenu && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: '0',
          backgroundColor: '#2d3748',
          borderRadius: '8px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 100,
          padding: '8px',
          minWidth: '200px'
        }}>
          {/* Payment Method Toggle - only show when NOT in demo mode */}
          {authMode !== 'demo' && balances && (
            <>
              <div style={{
                padding: '8px 12px',
                fontSize: '12px',
                color: '#a0aec0',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}>
                Payment Method
              </div>
              <button
                onClick={handleTogglePaymentMethod}
                style={{
                  width: '100%',
                  border: 'none',
                  background: tokenType === 'spark' ? '#8b5cf6' : '#10b981',
                  color: 'white',
                  cursor: 'pointer',
                  borderRadius: '6px',
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: '600',
                  textAlign: 'center',
                  marginBottom: '8px',
                  outline: 'none',
                  transition: 'opacity 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.opacity = '0.8';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
              >
                {tokenType === 'spark' ? '⚡ Paying with Spark' : '🎨 Paying with Sogni'}
              </button>

              {/* Premium Badge and Buy Link - only for Spark */}
              {tokenType === 'spark' && (
                <>
                  {isPremium ? (
                    <div style={{
                      padding: '8px 12px',
                      fontSize: '12px',
                      color: '#fbbf24',
                      fontWeight: '600',
                      textAlign: 'center',
                      marginBottom: '8px',
                      backgroundColor: 'rgba(251, 191, 36, 0.1)',
                      borderRadius: '6px'
                    }}>
                      ✨ Premium Boosted!
                      <div style={{ fontSize: '11px', marginTop: '4px', opacity: 0.9 }}>
                        {formatTokenAmount(balances?.spark.premiumCredit || '0')} Left
                      </div>
                    </div>
                  ) : (
                    <div style={{
                      padding: '6px 12px',
                      fontSize: '11px',
                      color: '#a0aec0',
                      fontWeight: '500',
                      textAlign: 'center',
                      marginBottom: '8px'
                    }}>
                      Get Premium Boosted
                    </div>
                  )}
                  
                  <button
                    onClick={handleBuyPremiumSpark}
                    style={{
                      width: '100%',
                      border: '1px solid #8b5cf6',
                      background: 'transparent',
                      color: '#8b5cf6',
                      cursor: 'pointer',
                      borderRadius: '6px',
                      padding: '8px 16px',
                      fontSize: '12px',
                      fontWeight: '600',
                      textAlign: 'center',
                      marginBottom: '8px',
                      outline: 'none',
                      transition: 'all 0.2s'
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.background = '#8b5cf6';
                      e.currentTarget.style.color = 'white';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = '#8b5cf6';
                    }}
                  >
                    Buy Premium Spark
                  </button>
                </>
              )}

              <div style={{ 
                height: '1px', 
                background: '#4a5568', 
                margin: '8px 0' 
              }} />
            </>
          )}

          {/* Logout Button */}
          <button
            onClick={() => { void handleLogout(); }}
            disabled={isLoading}
            style={{
              width: '100%',
              border: 'none',
              background: '#4a5568',
              color: 'white',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '13px',
              fontWeight: '500',
              textAlign: 'center',
              opacity: isLoading ? 0.5 : 1,
              outline: 'none',
              transition: 'opacity 0.2s'
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
