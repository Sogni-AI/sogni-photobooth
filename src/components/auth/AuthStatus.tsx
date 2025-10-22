import React, { useState } from 'react';
import { useSogniAuth } from '../../services/sogniAuth';
import { redirectToAuth } from '../../config/auth';
import { useWallet } from '../../hooks/useWallet';
import { formatTokenAmount, getTokenLabel } from '../../services/walletService';
import { useRewards } from '../../context/RewardsContext';

// Helper to format time remaining
const formatTimeRemaining = (ms: number): string => {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

export const AuthStatus: React.FC = () => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { isAuthenticated, authMode, user, logout, isLoading } = useSogniAuth();
  const { balances, tokenType, switchPaymentMethod } = useWallet();
  const { rewards, claimReward, loading: rewardsLoading } = useRewards();

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  const handleLoginClick = () => {
    redirectToAuth('login');
  };

  const handleBuyPremiumSpark = () => {
    // Determine the app URL based on environment
    const hostname = window.location.hostname;
    const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1';
    const isStaging = hostname.includes('staging');
    
    let appUrl: string;
    if (isLocalDev) {
      appUrl = 'https://app-local.sogni.ai';
    } else if (isStaging) {
      appUrl = 'https://app-staging.sogni.ai';
    } else {
      appUrl = 'https://app.sogni.ai';
    }
    
    window.open(`${appUrl}/wallet`, '_blank');
  };

  // Get daily boost reward (ID "2" is the daily boost)
  const dailyBoostReward = rewards.find(r => r.id === '2');
  const canClaimDailyBoost = dailyBoostReward?.canClaim && 
    (!dailyBoostReward?.nextClaim || dailyBoostReward.nextClaim.getTime() <= Date.now());
  const hasClaimedToday = dailyBoostReward?.nextClaim && dailyBoostReward.nextClaim.getTime() > Date.now();

  const handleClaimDailyBoost = () => {
    if (dailyBoostReward && canClaimDailyBoost) {
      claimReward(dailyBoostReward.id);
    }
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
  
  // Check if user has Premium Spark credits specifically (for the blue sparkle icon and premium styling)
  const hasPremiumSpark = balances ? parseFloat(balances.spark.premiumCredit || '0') > 1 : false;

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
        <span style={{
          background: 'linear-gradient(90deg, #a4e836, #ffe033, #ff8c00, #ff4500)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
          fontWeight: '600'
        }}>
          @{authMode === 'demo' ? 'Demo Mode' : user?.username || 'User'}
        </span>
        
        {/* Show balance only when NOT in demo mode */}
        {authMode !== 'demo' && balances && (
          <>
            <span style={{ opacity: 0.5 }}>|</span>
            <span style={{ 
              color: (tokenType === 'spark' && hasPremiumSpark) ? '#00D5FF' : 'white',
              fontWeight: (tokenType === 'spark' && hasPremiumSpark) ? '600' : '500'
            }}>
              {formatTokenAmount(currentBalance)} {tokenLabel}
            </span>
            {tokenType === 'spark' && hasPremiumSpark && (
              <span title="Premium Boosted!">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style={{ width: '16px', height: '16px', fill: '#00D5FF', display: 'block' }}>
                  <path d="M5.9 10.938a1.103 1.103 0 0 0-.176-1.107L3.5 7.134a.276.276 0 0 1 .312-.43L7.063 7.99a1.103 1.103 0 0 0 1.107-.175l2.697-2.224a.276.276 0 0 1 .43.312l-1.285 3.251a1.103 1.103 0 0 0 .175 1.107l2.225 2.697a.276.276 0 0 1-.313.43l-3.251-1.285a1.104 1.104 0 0 0-1.107.175L5.044 14.5a.275.275 0 0 1-.43-.312L5.9 10.938Z" />
                  <path fillRule="evenodd" clipRule="evenodd" d="M11.025 5.255a.552.552 0 0 1 .529.743l-.002.006-1.285 3.25a.828.828 0 0 0 .13.83l2.229 2.7a.552.552 0 0 1-.626.86h-.004l-3.25-1.286a.827.827 0 0 0-.832.131l-2.7 2.228a.552.552 0 0 1-.86-.625l.002-.005 1.285-3.25a.828.828 0 0 0-.131-.831L3.28 7.304a.552.552 0 0 1 .625-.858l.006.002 3.251 1.284a.828.828 0 0 0 .83-.13l2.701-2.229a.552.552 0 0 1 .331-.118Zm.011.551L8.344 8.027a1.38 1.38 0 0 1-1.384.218L3.716 6.964l2.22 2.69a1.38 1.38 0 0 1 .218 1.385l-1.283 3.245 2.692-2.22a1.379 1.379 0 0 1 1.385-.219l3.246 1.283-2.222-2.692a1.38 1.38 0 0 1-.219-1.384l1.283-3.246Z" />
                  <path d="M5.215 3.777a.444.444 0 0 0-.117-.435l-1.003-.985a.11.11 0 0 1 .106-.185l1.355.377a.444.444 0 0 0 .435-.117l.985-1.003a.111.111 0 0 1 .185.107L6.784 2.89a.444.444 0 0 0 .116.435l1.004.985a.11.11 0 0 1-.107.185l-1.354-.377a.444.444 0 0 0-.436.117l-.984 1.003a.11.11 0 0 1-.185-.107l.377-1.354ZM10.449 2.644a.31.31 0 0 0-.082-.305l-.702-.689a.078.078 0 0 1 .074-.13l.948.264a.31.31 0 0 0 .305-.082l.69-.702a.078.078 0 0 1 .129.075l-.264.948a.31.31 0 0 0 .082.305l.702.689a.078.078 0 0 1-.075.13l-.948-.264a.31.31 0 0 0-.304.081l-.69.702a.077.077 0 0 1-.13-.074l.265-.948Z" />
                  <path fillRule="evenodd" clipRule="evenodd" d="M7.01 1.178a.333.333 0 0 1 .365.413l-.001.004-.377 1.354a.222.222 0 0 0 .058.218l1.006.987a.333.333 0 0 1-.32.556l-.004-.001-1.354-.377a.222.222 0 0 0-.218.058l-.988 1.007a.333.333 0 0 1-.555-.32l.001-.005L5 3.718a.222.222 0 0 0-.058-.218l-1.007-.988a.333.333 0 0 1 .32-.555l.005.001 1.354.377a.222.222 0 0 0 .218-.058L6.82 1.27a.333.333 0 0 1 .19-.092Zm-.18.715-.26.937a.666.666 0 0 0 .174.654l.695.681-.938-.26a.666.666 0 0 0-.653.174l-.681.695.26-.937a.666.666 0 0 0-.174-.654l-.695-.681.937.26a.666.666 0 0 0 .654-.174l.681-.695ZM11.709.825a.233.233 0 0 1 .254.289v.003l-.264.947a.155.155 0 0 0 .04.153l.705.69a.232.232 0 0 1-.225.39l-.002-.001-.948-.264a.155.155 0 0 0-.152.041l-.692.704a.233.233 0 0 1-.388-.224V3.55l.264-.948a.155.155 0 0 0-.04-.152l-.706-.692a.233.233 0 0 1 .225-.388h.003l.948.264a.155.155 0 0 0 .152-.04l.692-.705a.233.233 0 0 1 .134-.064Zm-.127.5-.182.656a.466.466 0 0 0 .122.457l.486.478-.656-.183a.466.466 0 0 0-.457.122l-.477.487.182-.657a.466.466 0 0 0-.122-.457l-.486-.477.656.183a.466.466 0 0 0 .457-.123l.477-.486Z" />
                </svg>
              </span>
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
                letterSpacing: '0.05em'
              }}>
                Paying with:
              </div>
              <div style={{
                display: 'flex',
                marginBottom: '8px',
                padding: '4px',
                backgroundColor: '#1a1f2e',
                borderRadius: '8px',
                gap: '4px'
              }}>
                <button
                  onClick={() => switchPaymentMethod('sogni')}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: tokenType === 'sogni' ? '#00D5FF' : 'transparent',
                    color: tokenType === 'sogni' ? '#0a0e1a' : '#6b7280',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    padding: '12px 16px',
                    fontSize: '13px',
                    fontWeight: tokenType === 'sogni' ? '600' : '500',
                    textAlign: 'center',
                    outline: 'none',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseOver={(e) => {
                    if (tokenType !== 'sogni') {
                      e.currentTarget.style.color = '#9ca3af';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (tokenType !== 'sogni') {
                      e.currentTarget.style.color = '#6b7280';
                    }
                  }}
                >
                  SOGNI Token
                </button>
                <button
                  onClick={() => switchPaymentMethod('spark')}
                  style={{
                    flex: 1,
                    border: 'none',
                    background: tokenType === 'spark' ? '#00D5FF' : 'transparent',
                    color: tokenType === 'spark' ? '#0a0e1a' : '#6b7280',
                    cursor: 'pointer',
                    borderRadius: '6px',
                    padding: '12px 16px',
                    fontSize: '13px',
                    fontWeight: '600',
                    textAlign: 'center',
                    outline: 'none',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                  }}
                  onMouseOver={(e) => {
                    if (tokenType !== 'spark') {
                      e.currentTarget.style.color = '#9ca3af';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (tokenType !== 'spark') {
                      e.currentTarget.style.color = '#6b7280';
                    }
                  }}
                >
                  Spark Points
                </button>
              </div>

              {/* Action Buttons Section - Daily Boost and Buy Spark */}
              <div style={{
                padding: '8px 12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {/* Premium Badge - only for Spark */}
                {tokenType === 'spark' && hasPremiumSpark && (
                  <div style={{
                    fontSize: '12px',
                    color: '#00D5FF',
                    fontWeight: '600',
                    textAlign: 'left',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    gap: '4px'
                  }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style={{ width: '16px', height: '16px', fill: 'currentColor' }}>
                          <path d="M3.09668 1.66495C4.39689 1.62726 5.61206 1.73985 6.54883 1.99015C7.48956 2.24242 8.79805 2.34942 10.1406 2.28214C11.2962 2.22494 12.4121 2.04606 13.2812 1.77628C13.4539 1.72215 13.6355 1.74198 13.79 1.82999L13.8545 1.87101C14.0198 1.99211 14.1181 2.18711 14.1182 2.39151L14.1191 9.46476C14.119 9.74248 13.9435 9.98798 13.6836 10.0761C12.7308 10.401 11.4833 10.615 10.1719 10.6796C9.89377 10.693 9.61835 10.7001 9.34766 10.7001C8.23208 10.7001 7.20006 10.5844 6.38086 10.3651C5.51238 10.1323 4.32994 10.0254 3.09668 10.0624V14.8974H2.33984L2.34082 1.66495H3.09668ZM3.0957 2.30753V4.73331C3.99729 4.70708 4.89928 4.75117 5.68945 4.8837V7.14444C4.89933 7.01191 3.9973 6.96848 3.0957 6.99405V9.41202C3.25915 9.40798 3.42099 9.40616 3.58105 9.40616C4.33603 9.40616 5.05125 9.45918 5.68945 9.56143V7.14542C5.96156 7.18712 6.22081 7.24296 6.46387 7.30753C6.99885 7.44949 7.622 7.54229 8.2832 7.59073V10.0116C8.87143 10.0554 9.50172 10.0654 10.1406 10.0331L10.1396 10.0302C10.3889 10.0181 10.6342 9.99837 10.876 9.9755V7.56632C10.6512 7.58782 10.4208 7.60478 10.1934 7.6171C9.56626 7.64962 8.93691 7.64199 8.33594 7.59659V5.32022C8.93696 5.36562 9.56694 5.37228 10.1934 5.33976C10.4211 5.32741 10.6519 5.3115 10.877 5.28995V2.87393C10.6446 2.89547 10.4089 2.91328 10.1719 2.92472C9.51618 2.95632 8.88011 2.94951 8.2832 2.90714V5.32901C7.62191 5.28058 6.99878 5.1868 6.46387 5.04483C6.22085 4.98029 5.96147 4.92539 5.68945 4.8837V2.46378C4.92908 2.33394 4.02699 2.2786 3.0957 2.30753ZM13.4717 4.79581C12.7279 5.03811 11.8305 5.20367 10.9062 5.2919V7.55265C11.8316 7.46505 12.7284 7.2978 13.4727 7.05558L13.4717 4.79581Z" />
                        </svg>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" style={{ width: '16px', height: '16px', fill: 'currentColor' }}>
                          <path d="M5.9 10.938a1.103 1.103 0 0 0-.176-1.107L3.5 7.134a.276.276 0 0 1 .312-.43L7.063 7.99a1.103 1.103 0 0 0 1.107-.175l2.697-2.224a.276.276 0 0 1 .43.312l-1.285 3.251a1.103 1.103 0 0 0 .175 1.107l2.225 2.697a.276.276 0 0 1-.313.43l-3.251-1.285a1.104 1.104 0 0 0-1.107.175L5.044 14.5a.275.275 0 0 1-.43-.312L5.9 10.938Z" />
                          <path fillRule="evenodd" clipRule="evenodd" d="M11.025 5.255a.552.552 0 0 1 .529.743l-.002.006-1.285 3.25a.828.828 0 0 0 .13.83l2.229 2.7a.552.552 0 0 1-.626.86h-.004l-3.25-1.286a.827.827 0 0 0-.832.131l-2.7 2.228a.552.552 0 0 1-.86-.625l.002-.005 1.285-3.25a.828.828 0 0 0-.131-.831L3.28 7.304a.552.552 0 0 1 .625-.858l.006.002 3.251 1.284a.828.828 0 0 0 .83-.13l2.701-2.229a.552.552 0 0 1 .331-.118Zm.011.551L8.344 8.027a1.38 1.38 0 0 1-1.384.218L3.716 6.964l2.22 2.69a1.38 1.38 0 0 1 .218 1.385l-1.283 3.245 2.692-2.22a1.379 1.379 0 0 1 1.385-.219l3.246 1.283-2.222-2.692a1.38 1.38 0 0 1-.219-1.384l1.283-3.246Z" />
                          <path d="M5.215 3.777a.444.444 0 0 0-.117-.435l-1.003-.985a.11.11 0 0 1 .106-.185l1.355.377a.444.444 0 0 0 .435-.117l.985-1.003a.111.111 0 0 1 .185.107L6.784 2.89a.444.444 0 0 0 .116.435l1.004.985a.11.11 0 0 1-.107.185l-1.354-.377a.444.444 0 0 0-.436.117l-.984 1.003a.11.11 0 0 1-.185-.107l.377-1.354ZM10.449 2.644a.31.31 0 0 0-.082-.305l-.702-.689a.078.078 0 0 1 .074-.13l.948.264a.31.31 0 0 0 .305-.082l.69-.702a.078.078 0 0 1 .129.075l-.264.948a.31.31 0 0 0 .082.305l.702.689a.078.078 0 0 1-.075.13l-.948-.264a.31.31 0 0 0-.304.081l-.69.702a.077.077 0 0 1-.13-.074l.265-.948Z" />
                          <path fillRule="evenodd" clipRule="evenodd" d="M7.01 1.178a.333.333 0 0 1 .365.413l-.001.004-.377 1.354a.222.222 0 0 0 .058.218l1.006.987a.333.333 0 0 1-.32.556l-.004-.001-1.354-.377a.222.222 0 0 0-.218.058l-.988 1.007a.333.333 0 0 1-.555-.32l.001-.005L5 3.718a.222.222 0 0 0-.058-.218l-1.007-.988a.333.333 0 0 1 .32-.555l.005.001 1.354.377a.222.222 0 0 0 .218-.058L6.82 1.27a.333.333 0 0 1 .19-.092Zm-.18.715-.26.937a.666.666 0 0 0 .174.654l.695.681-.938-.26a.666.666 0 0 0-.653.174l-.681.695.26-.937a.666.666 0 0 0-.174-.654l-.695-.681.937.26a.666.666 0 0 0 .654-.174l.681-.695ZM11.709.825a.233.233 0 0 1 .254.289v.003l-.264.947a.155.155 0 0 0 .04.153l.705.69a.232.232 0 0 1-.225.39l-.002-.001-.948-.264a.155.155 0 0 0-.152.041l-.692.704a.233.233 0 0 1-.388-.224V3.55l.264-.948a.155.155 0 0 0-.04-.152l-.706-.692a.233.233 0 0 1 .225-.388h.003l.948.264a.155.155 0 0 0 .152-.04l.692-.705a.233.233 0 0 1 .134-.064Zm-.127.5-.182.656a.466.466 0 0 0 .122.457l.486.478-.656-.183a.466.466 0 0 0-.457.122l-.477.487.182-.657a.466.466 0 0 0-.122-.457l-.486-.477.656.183a.466.466 0 0 0 .457-.123l.477-.486Z" />
                        </svg>
                      </span>
                      Premium Boosted!
                    </div>
                    <div style={{ fontSize: '11px', opacity: 0.9 }}>
                      {formatTokenAmount(balances?.spark.premiumCredit || '0')} boosts left
                    </div>
                  </div>
                )}

                {/* Buttons Row - Daily Boost and Buy Spark side by side */}
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'flex-start'
                }}>
                  {/* Daily Boost Button with countdown */}
                  {dailyBoostReward && (
                    <div style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px'
                    }}>
                      <button
                        onClick={handleClaimDailyBoost}
                        disabled={!canClaimDailyBoost || rewardsLoading}
                        style={{
                          width: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          border: canClaimDailyBoost ? '2px solid #10b981' : '2px solid #4a5568',
                          background: canClaimDailyBoost ? 'rgba(16, 185, 129, 0.1)' : 'transparent',
                          color: canClaimDailyBoost ? '#10b981' : '#6b7280',
                          cursor: canClaimDailyBoost ? 'pointer' : 'not-allowed',
                          borderRadius: '8px',
                          padding: '10px 12px',
                          fontSize: '12px',
                          fontWeight: '600',
                          outline: 'none',
                          transition: 'all 0.2s',
                          opacity: rewardsLoading ? 0.6 : 1,
                          whiteSpace: 'nowrap'
                        }}
                        onMouseOver={(e) => {
                          if (canClaimDailyBoost && !rewardsLoading) {
                            e.currentTarget.style.background = 'rgba(16, 185, 129, 0.2)';
                          }
                        }}
                        onMouseOut={(e) => {
                          if (canClaimDailyBoost && !rewardsLoading) {
                            e.currentTarget.style.background = 'rgba(16, 185, 129, 0.1)';
                          }
                        }}
                      >
                        {/* Gift Icon */}
                        <svg 
                          xmlns="http://www.w3.org/2000/svg" 
                          width="14" 
                          height="14" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="2" 
                          strokeLinecap="round" 
                          strokeLinejoin="round"
                        >
                          <polyline points="20 12 20 22 4 22 4 12"></polyline>
                          <rect x="2" y="7" width="20" height="5"></rect>
                          <line x1="12" y1="22" x2="12" y2="7"></line>
                          <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path>
                          <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>
                        </svg>
                        {hasClaimedToday ? 'Claimed' : rewardsLoading ? 'Loading...' : 'Daily Boost'}
                      </button>
                      
                      {/* Countdown text below Daily Boost button - left aligned */}
                      {hasClaimedToday && dailyBoostReward.nextClaim && (
                        <div style={{
                          fontSize: '11px',
                          color: '#9ca3af',
                          textAlign: 'left',
                          paddingLeft: '4px',
                          whiteSpace: 'nowrap'
                        }}>
                          Available in {formatTimeRemaining(dailyBoostReward.nextClaim.getTime() - Date.now())}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Buy Spark Button - only for Spark token type */}
                  {tokenType === 'spark' && (
                    <button
                      onClick={handleBuyPremiumSpark}
                      style={{
                        flex: dailyBoostReward ? 1 : 'auto',
                        border: '2px solid #00D5FF',
                        background: 'transparent',
                        color: '#00D5FF',
                        cursor: 'pointer',
                        borderRadius: '8px',
                        padding: '10px 12px',
                        fontSize: '12px',
                        fontWeight: '600',
                        textAlign: 'center',
                        outline: 'none',
                        transition: 'all 0.2s',
                        whiteSpace: 'nowrap'
                      }}
                      onMouseOver={(e) => {
                        e.currentTarget.style.background = '#00D5FF';
                        e.currentTarget.style.color = '#1a202c';
                      }}
                      onMouseOut={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.color = '#00D5FF';
                      }}
                    >
                      Buy Spark
                    </button>
                  )}
                </div>
              </div>

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
