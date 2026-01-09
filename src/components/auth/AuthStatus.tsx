import React, { useState, useEffect, useRef } from 'react';
import { useSogniAuth } from '../../services/sogniAuth';
import { useWallet } from '../../hooks/useWallet';
import { formatTokenAmount, getTokenLabel } from '../../services/walletService';
import { useRewards } from '../../context/RewardsContext';
import LoginModal, { LoginModalMode } from './LoginModal';
import { getAuthButtonText, getDefaultModalMode, markAsVisited, incrementLoggedInVisitCount, hasShownProjectsTooltip, markProjectsTooltipShown } from '../../utils/visitorTracking';
import '../../styles/components/AuthStatus.css';

// Helper to format time remaining
const formatTimeRemaining = (ms: number): string => {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

interface AuthStatusProps {
  onPurchaseClick?: () => void;
  onSignupComplete?: () => void;
  onHistoryClick?: () => void;
  textColor?: string;
  playRandomFlashSound?: () => void;
}

export const AuthStatus: React.FC<AuthStatusProps> = ({ onPurchaseClick, onSignupComplete, onHistoryClick, textColor = '#ffffff', playRandomFlashSound }) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginModalMode, setLoginModalMode] = useState<LoginModalMode>('login');
  const [highlightDailyBoost, setHighlightDailyBoost] = useState(false);
  const [showProjectsTooltip, setShowProjectsTooltip] = useState(false);
  const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
  // Track if we've already shown the login boost prompt for this session
  const hasShownLoginBoostRef = useRef(false);
  // Track if we've already shown the projects tooltip for this session
  const hasShownProjectsTooltipRef = useRef(false);
  // Compute button text ONCE based on visitor status (before marking as visited)
  // Use useRef to preserve the initial value across renders
  const authButtonTextRef = useRef<string>(getAuthButtonText());
  const authButtonText = authButtonTextRef.current;
  const menuContainerRef = useRef<HTMLDivElement>(null);
  const projectsButtonRef = useRef<HTMLDivElement>(null);
  
  const { isAuthenticated, authMode, user, logout, isLoading } = useSogniAuth();
  const { balances, tokenType, switchPaymentMethod } = useWallet();
  const { rewards, claimReward, loading: rewardsLoading } = useRewards();

  // Debug: Log when showProjectsTooltip changes
  useEffect(() => {
    console.log('🎯 [DEBUG] showProjectsTooltip state changed:', showProjectsTooltip);
  }, [showProjectsTooltip]);

  // Mark visitor on mount (after we've already computed the initial button text)
  useEffect(() => {
    markAsVisited();
  }, [authButtonText]);

  // Get daily boost reward (ID "2" is the daily boost)
  const dailyBoostReward = rewards.find(r => r.id === '2');
  const canClaimDailyBoost = dailyBoostReward?.canClaim && 
    (!dailyBoostReward?.nextClaim || dailyBoostReward.nextClaim.getTime() <= Date.now());
  const hasClaimedToday = dailyBoostReward?.nextClaim && dailyBoostReward.nextClaim.getTime() > Date.now();

  // Auto-open wallet view on login/session resume if Daily Boost is available
  useEffect(() => {
    // Skip if already shown
    if (hasShownLoginBoostRef.current) {
      return;
    }

    // Only proceed once authenticated, rewards are loaded, and we have reward data
    if (!isAuthenticated || rewardsLoading || rewards.length === 0) {
      return;
    }

    // Check if daily boost is claimable
    if (!canClaimDailyBoost) {
      console.log('🎁 Daily Boost check: not claimable', {
        dailyBoostReward,
        canClaimDailyBoost,
        hasClaimedToday
      });
      return;
    }

    // All conditions met - show the wallet prompt!
    console.log('🎁 User has available Daily Boost - opening wallet view', {
      isAuthenticated,
      rewardsLoading,
      canClaimDailyBoost,
      rewardsCount: rewards.length
    });
    
    hasShownLoginBoostRef.current = true;
    
    // Wait a moment for any animations to complete
    setTimeout(() => {
      setShowUserMenu(true);
      setHighlightDailyBoost(true);
      
      // Remove highlight after 8 seconds to give user time to notice
      setTimeout(() => {
        setHighlightDailyBoost(false);
      }, 8000);
    }, 800);
  }, [isAuthenticated, canClaimDailyBoost, rewardsLoading, rewards.length, dailyBoostReward, hasClaimedToday]);

  // Track logged-in visits and show Recent Projects tooltip on second visit or later
  useEffect(() => {
    console.log('🔍 [Tooltip Check] useEffect triggered', { isAuthenticated, authMode });
    
    // Only track visits when authenticated and not in demo mode
    if (!isAuthenticated || authMode === 'demo') {
      console.log('🔍 [Tooltip Check] Skipping - not authenticated or demo mode', { isAuthenticated, authMode });
      return;
    }

    // Skip if we've already shown the tooltip in a previous session
    if (hasShownProjectsTooltip()) {
      console.log('📊 Projects tooltip already shown in a previous session, skipping');
      return;
    }

    // Skip if we've already shown it in this session
    if (hasShownProjectsTooltipRef.current) {
      console.log('📊 Projects tooltip already shown in this session, skipping');
      return;
    }

    // Increment the visit count
    const visitCount = incrementLoggedInVisitCount();
    console.log('📊 Logged-in visit count:', visitCount);

    // On the second visit OR LATER (as long as they haven't seen it), show the Recent Projects tooltip
    if (visitCount >= 2) {
      console.log('🎯 Second+ logged-in visit detected - showing Recent Projects tooltip');
      
      hasShownProjectsTooltipRef.current = true;
      
      // Wait a moment for any animations to complete, then open wallet
      setTimeout(() => {
        console.log('🎯 Opening wallet menu...');
        setShowUserMenu(true);
        
          // Show tooltip after menu is open
          setTimeout(() => {
            console.log('🎯 Showing tooltip...', { showProjectsTooltip: true });
            
            // Calculate tooltip position based on button position
            if (projectsButtonRef.current) {
              const buttonElement = projectsButtonRef.current.querySelector('button');
              if (buttonElement) {
                const buttonRect = buttonElement.getBoundingClientRect();
                
                setTooltipPosition({
                  top: buttonRect.top + (buttonRect.height / 2) - 22,
                  left: buttonRect.right - 7
                });
              }
            }
            
            setShowProjectsTooltip(true);
            markProjectsTooltipShown();
            
            // Tooltip stays visible until manually dismissed or wallet closes
          }, 300);
      }, 1000);
    } else {
      console.log('🔍 [Tooltip Check] Visit count too low, need >= 2, got:', visitCount);
    }
  }, [isAuthenticated, authMode]);

  // Close user menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showUserMenu && menuContainerRef.current && !menuContainerRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
        // Also hide tooltip when menu closes
        setShowProjectsTooltip(false);
      }
    };

    if (showUserMenu) {
      // Use setTimeout to avoid closing immediately when opening
      setTimeout(() => {
        document.addEventListener('mousedown', handleClickOutside);
      }, 0);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showUserMenu]);

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  const handleLoginClick = () => {
    setLoginModalMode(getDefaultModalMode());
    setShowLoginModal(true);
  };


  const handleCloseLoginModal = () => {
    setShowLoginModal(false);
  };

  const handleSignupComplete = () => {
    // Called when signup is successfully completed
    console.log('🎉 Signup complete - opening user menu and highlighting Daily Boost');
    setShowLoginModal(false);
    
    // Trigger confetti celebration
    if (onSignupComplete) {
      onSignupComplete();
    }
    
    // Wait a moment for the modal to close, then open user menu
    setTimeout(() => {
      setShowUserMenu(true);
      setHighlightDailyBoost(true);
      
      // Remove highlight after 5 seconds
      setTimeout(() => {
        setHighlightDailyBoost(false);
      }, 5000);
    }, 500);
  };

  const handleBuyPremiumSpark = () => {
    // If we have the onPurchaseClick callback (Stripe integration), use it
    if (onPurchaseClick) {
      onPurchaseClick();
      return;
    }

    // Fallback: redirect to external wallet (for cases where Stripe isn't available)
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

  const handleClaimDailyBoost = () => {
    if (dailyBoostReward && canClaimDailyBoost) {
      // Play flash sound when claiming Daily Boost
      if (playRandomFlashSound) {
        playRandomFlashSound();
      }
      claimReward(dailyBoostReward.id);
    }
  };

  // Prepare variables for authenticated state (used in conditional rendering)
  const currentBalance = balances?.[tokenType]?.net || '0';
  const tokenLabel = getTokenLabel(tokenType);
  const hasPremiumSpark = balances ? parseFloat(balances.spark.premiumCredit || '0') > 1 : false;

  // Single return statement to prevent remounting modal
  return (
    <>
    {!isAuthenticated ? (
      // Show simple login button
      <button
        onClick={handleLoginClick}
        disabled={isLoading}
        style={{
          background: 'transparent',
          color: textColor,
          border: 'none',
          padding: '8px 16px',
          fontSize: '14px',
          fontWeight: '700',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          textDecoration: 'underline',
          opacity: isLoading ? 0.5 : 1,
          transition: 'opacity 0.2s ease'
        }}
        onMouseEnter={(e) => !isLoading && (e.currentTarget.style.opacity = '0.8')}
        onMouseLeave={(e) => !isLoading && (e.currentTarget.style.opacity = '1')}
      >
        {isLoading ? 'Loading...' : authButtonText}
      </button>
    ) : (
    // Show username with balance inline
    <div className="relative auth-status-container" ref={menuContainerRef}>
      <div
        onClick={() => setShowUserMenu(!showUserMenu)}
        className="auth-status-content"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          color: textColor,
          fontSize: '14px',
          fontWeight: '500',
          cursor: 'pointer',
          userSelect: 'none',
          flexWrap: 'wrap'
        }}
      >
        <span style={{
          color: textColor,
          fontWeight: '700'
        }}>
          @{authMode === 'demo' ? 'Demo Mode' : user?.username || 'User'}
        </span>
        
        {/* Show balance only when NOT in demo mode */}
        {authMode !== 'demo' && balances && (
          <>
            <span className="auth-separator" style={{ color: textColor, opacity: 0.7 }}>|</span>
            <span className="auth-balance" style={{ 
              color: (tokenType === 'spark' && hasPremiumSpark) ? '#00D5FF' : textColor,
              fontWeight: (tokenType === 'spark' && hasPremiumSpark) ? '600' : '500',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              {formatTokenAmount(currentBalance)} {tokenLabel}
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
            </span>
          </>
        )}
      </div>

      {showUserMenu && (
        <div 
          className="cosmic-wallet-container"
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: '0',
            borderRadius: '8px',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
            zIndex: 1001,
            padding: '8px',
            minWidth: '200px'
          }}
        >
          <div className="star-trail-1" />
          <div className="star-trail-2" />
          <div className="cosmic-wallet-content" style={{ position: 'relative', zIndex: 1 }}>
          {/* Payment Method Toggle - only show when NOT in demo mode */}
          {authMode !== 'demo' && balances && (
            <>
              <div style={{
                padding: '8px 12px',
                fontSize: '13px',
                color: '#ffffff',
                fontWeight: '600',
                letterSpacing: '0.02em',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                position: 'relative'
              }}>
                <span>Paying with</span>
                <a
                  href="https://www.sogni.ai/assets"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    position: 'absolute',
                    top: '4px',
                    right: '8px',
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    background: 'rgba(102, 126, 234, 0.3)',
                    border: '1px solid rgba(102, 126, 234, 0.5)',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: '700',
                    textDecoration: 'none',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    zIndex: 10
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.background = 'rgba(102, 126, 234, 0.6)';
                    e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.8)';
                    e.currentTarget.style.transform = 'scale(1.1)';
                    e.currentTarget.style.boxShadow = '0 0 10px rgba(102, 126, 234, 0.5)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.background = 'rgba(102, 126, 234, 0.3)';
                    e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.5)';
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  title="Learn about SOGNI Token vs Spark Points"
                >
                  ?
                </a>
              </div>
              <div 
                style={{
                  display: 'flex',
                  marginBottom: '8px',
                  padding: '6px',
                  borderRadius: '12px',
                  gap: '6px',
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(102, 126, 234, 0.1)'
                }}
              >
                <button
                  onClick={() => {
                    if (tokenType !== 'sogni' && playRandomFlashSound) {
                      playRandomFlashSound();
                    }
                    switchPaymentMethod('sogni');
                  }}
                  style={{
                    flex: 1,
                    border: tokenType === 'sogni' ? '2px solid #00D5FF' : '2px solid transparent',
                    background: tokenType === 'sogni' 
                      ? 'linear-gradient(135deg, #00D5FF, #0099CC)' 
                      : 'rgba(255, 255, 255, 0.05)',
                    color: tokenType === 'sogni' ? '#0a0e1a' : 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    fontSize: '13px',
                    fontWeight: tokenType === 'sogni' ? '700' : '500',
                    textAlign: 'center',
                    outline: 'none',
                    transition: 'all 0.3s ease',
                    whiteSpace: 'nowrap',
                    boxShadow: tokenType === 'sogni' 
                      ? '0 4px 15px rgba(0, 213, 255, 0.4), 0 0 0 1px rgba(0, 213, 255, 0.2)' 
                      : 'none',
                    transform: tokenType === 'sogni' ? 'scale(1.02)' : 'scale(1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    position: 'relative',
                    zIndex: 2,
                    overflow: 'visible'
                  }}
                  onMouseOver={(e) => {
                    if (tokenType !== 'sogni') {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
                      e.currentTarget.style.transform = 'scale(1.02)';
                      const svg = e.currentTarget.querySelector('svg');
                      if (svg) {
                        svg.style.opacity = '0.9';
                        svg.style.transform = 'scale(1.15)';
                      }
                    } else {
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 6px 20px rgba(0, 213, 255, 0.5), 0 0 0 1px rgba(0, 213, 255, 0.3)';
                      const svg = e.currentTarget.querySelector('svg');
                      if (svg) {
                        svg.style.transform = 'scale(1.3)';
                        svg.style.filter = 'drop-shadow(0 0 6px rgba(0, 213, 255, 0.8)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4))';
                      }
                    }
                  }}
                  onMouseOut={(e) => {
                    if (tokenType !== 'sogni') {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                      e.currentTarget.style.transform = 'scale(1)';
                      const svg = e.currentTarget.querySelector('svg');
                      if (svg) {
                        svg.style.opacity = '0.6';
                        svg.style.transform = 'scale(1)';
                      }
                    } else {
                      e.currentTarget.style.transform = 'scale(1.02)';
                      e.currentTarget.style.boxShadow = '0 4px 15px rgba(0, 213, 255, 0.4), 0 0 0 1px rgba(0, 213, 255, 0.2)';
                      const svg = e.currentTarget.querySelector('svg');
                      if (svg) {
                        svg.style.transform = 'scale(1.2)';
                        svg.style.filter = 'drop-shadow(0 0 4px rgba(0, 213, 255, 0.6)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))';
                      }
                    }
                  }}
                >
                  <div 
                    className={tokenType === 'sogni' ? 'sogni-logo-container active' : 'sogni-logo-container'}
                    style={{
                      position: 'absolute',
                      left: '-4px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '32px',
                      height: '32px',
                      zIndex: 1
                    }}
                  >
                    {tokenType === 'sogni' && (
                      <>
                        <div className="sogni-particle sogni-particle-1" />
                        <div className="sogni-particle sogni-particle-2" />
                        <div className="sogni-particle sogni-particle-3" />
                        <div className="sogni-particle sogni-particle-4" />
                        <div className="sogni-particle sogni-particle-5" />
                        <div className="sogni-particle sogni-particle-6" />
                        <div className="sogni-particle sogni-particle-7" />
                        <div className="sogni-particle sogni-particle-8" />
                      </>
                    )}
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      viewBox="0 0 120 110" 
                      style={{ 
                        width: '32px', 
                        height: '32px', 
                        fill: 'currentColor',
                        display: 'block',
                        flexShrink: 0,
                        transform: tokenType === 'sogni' 
                          ? 'scale(1.2)' 
                          : 'scale(1)',
                        filter: tokenType === 'sogni' 
                          ? 'drop-shadow(0 0 4px rgba(0, 213, 255, 0.6)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))' 
                          : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))',
                        transition: 'all 0.3s ease',
                        opacity: tokenType === 'sogni' ? 1 : 0.6
                      }}
                    >
                    <defs>
                      <clipPath id="sogni-circle-clip">
                        <circle cx="51" cy="51" r="50" />
                      </clipPath>
                    </defs>
                    <g clipPath="url(#sogni-circle-clip)">
                      <path d="M1 1h100v100H1z" style={{ opacity: 0.08 }} />
                      <path d="M44.6 94.8h-1.9l-1.9 6.3h1.9l1.9-6.3zM92 94.8H47.2l-1.9 6.3H90l2-6.3zM58 88.5h-1.9l-1.8 6.3h1.9l1.8-6.3zM100.1 88.5H60l-1.8 6.3h40.1l1.8-6.3zM50.8 82.3h-1.7l-1.8 6.3H49l1.8-6.3z" />
                      <path d="M100 82.3H52.8l-1.7 6.3h47.2l1.7-6.3z" />
                      <path d="M68 82.3h-2l-2.1 6.3h2l2.1-6.3zM44.2 76h-1.7l-1.8 6.3h1.7l1.8-6.3zM94.4 76h-5.2L86 82.3h5.2l3.2-6.3z" />
                      <path d="M86.8 76H46.6l-1.8 6.3h39l3-6.3z" />
                      <path d="M72.7 69.8h46.2l-2 6.3H71.4l1.3-6.3zM69 69.8h1.7L69.3 76h-1.7l1.4-6.2zM111 63.5H63.3l-1.5 6.3h47.4l1.8-6.3zM61.3 63.5h-1.7l-1.5 6.3h1.7l1.5-6.3zM58 63.5h42l1-6.3H59.6L58 63.5zM54.3 63.5H56l1.5-6.3h-1.7l-1.5 6.3z" />
                      <path d="M74.4 51h31.2l-1 6.3H74.1l.3-6.3zM70.7 51h1.7l-.4 6.3h-1.7l.4-6.3zM60 44.7h25.9l.7 6.3H61.5L60 44.7zM88 44.7h41.4l1.8 6.3H88.8l-.8-6.3zM56.3 44.7H58l1.5 6.3h-1.7l-1.5-6.3z" />
                      <path d="M56.6 38.5h43.2l1.2 6.3H58l-1.4-6.3zM52.8 38.5h1.7l1.5 6.3h-1.7l-1.5-6.3zM72.8 32.2h31.8v6.3H73.3l-.5-6.3zM69 32.2h1.7l.5 6.3h-1.7l-.5-6.3z" />
                      <path d="M44.6 26h43.2l3.3 6.3h-45L44.6 26zM90.2 26h43.1l1.8 6.3H93.6L90.2 26zM40.9 26h1.7l1.5 6.3h-1.7L40.9 26zM69.7 19.7h43.6L115 26H71.5l-1.8-6.3zM66.1 19.7h1.7l1.7 6.3h-1.7l-1.7-6.3z" />
                      <path d="M51 13.5h39.2l1.7 6.3H52.3L51 13.5zM93 13.5h39.2l1.6 6.3h-39L93 13.5zM47.3 13.5H49l1.5 6.3h-1.7l-1.5-6.3zM64.3 7.2h45.4l1.8 6.3H68.2l-3.9-6.3z" />
                      <path d="M60.1 7.2h2l3.8 6.3h-2l-3.8-6.3zM91.3 1h39.1l1.8 6.3H93L91.3 1z" />
                      <path d="M44.6 1h43.2l1.8 6.3H46.1L44.6 1zM40.9 1h1.7L44 7.2h-1.7L40.9 1z" />
                    </g>
                    </svg>
                  </div>
                  <span style={{ marginLeft: '24px' }}>SOGNI Token</span>
                </button>
                <button
                  onClick={() => {
                    if (tokenType !== 'spark' && playRandomFlashSound) {
                      playRandomFlashSound();
                    }
                    switchPaymentMethod('spark');
                  }}
                  style={{
                    flex: 1,
                    border: tokenType === 'spark' ? '2px solid #ff6b6b' : '2px solid transparent',
                    background: tokenType === 'spark' 
                      ? 'linear-gradient(135deg, #ff6b6b, #ffa502)' 
                      : 'rgba(255, 255, 255, 0.05)',
                    color: tokenType === 'spark' ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
                    cursor: 'pointer',
                    borderRadius: '10px',
                    padding: '12px 16px',
                    fontSize: '13px',
                    fontWeight: tokenType === 'spark' ? '700' : '500',
                    textAlign: 'center',
                    outline: 'none',
                    transition: 'all 0.3s ease',
                    whiteSpace: 'nowrap',
                    boxShadow: tokenType === 'spark' 
                      ? '0 4px 15px rgba(255, 107, 107, 0.4), 0 0 0 1px rgba(255, 107, 107, 0.2)' 
                      : 'none',
                    transform: tokenType === 'spark' ? 'scale(1.02)' : 'scale(1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    position: 'relative',
                    overflow: 'visible',
                    zIndex: 2
                  }}
                  onMouseOver={(e) => {
                    if (tokenType !== 'spark') {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
                      e.currentTarget.style.transform = 'scale(1.02)';
                      const svg = e.currentTarget.querySelector('svg');
                      if (svg) {
                        svg.style.opacity = '0.9';
                        svg.style.transform = 'scale(1.15) rotate(8deg)';
                      }
                    } else {
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 107, 107, 0.5), 0 0 0 1px rgba(255, 107, 107, 0.3)';
                      const svg = e.currentTarget.querySelector('svg');
                      if (svg) {
                        svg.style.transform = 'scale(1.3) rotate(8deg)';
                        svg.style.filter = 'drop-shadow(0 0 8px rgba(255, 107, 107, 1)) drop-shadow(0 0 12px rgba(255, 165, 2, 0.6)) drop-shadow(0 2px 6px rgba(0, 0, 0, 0.4))';
                      }
                    }
                  }}
                  onMouseOut={(e) => {
                    if (tokenType !== 'spark') {
                      e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                      e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
                      e.currentTarget.style.transform = 'scale(1)';
                      const svg = e.currentTarget.querySelector('svg');
                      if (svg) {
                        svg.style.opacity = '0.6';
                        svg.style.transform = 'scale(1) rotate(0deg)';
                      }
                    } else {
                      e.currentTarget.style.transform = 'scale(1.02)';
                      e.currentTarget.style.boxShadow = '0 4px 15px rgba(255, 107, 107, 0.4), 0 0 0 1px rgba(255, 107, 107, 0.2)';
                      const svg = e.currentTarget.querySelector('svg');
                      if (svg) {
                        svg.style.transform = 'scale(1.2) rotate(5deg)';
                        svg.style.filter = 'drop-shadow(0 0 6px rgba(255, 107, 107, 0.8)) drop-shadow(0 0 10px rgba(255, 165, 2, 0.4)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))';
                      }
                    }
                  }}
                >
                  <div 
                    className={tokenType === 'spark' ? 'spark-logo-container active' : 'spark-logo-container'}
                    style={{
                      position: 'absolute',
                      left: '-4px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: '32px',
                      height: '32px',
                      zIndex: 1
                    }}
                  >
                    {tokenType === 'spark' && (
                      <>
                        <div className="sparkler-particle sparkler-particle-1" />
                        <div className="sparkler-particle sparkler-particle-2" />
                        <div className="sparkler-particle sparkler-particle-3" />
                        <div className="sparkler-particle sparkler-particle-4" />
                        <div className="sparkler-particle sparkler-particle-5" />
                        <div className="sparkler-particle sparkler-particle-6" />
                        <div className="sparkler-particle sparkler-particle-7" />
                        <div className="sparkler-particle sparkler-particle-8" />
                        <div className="sparkler-particle sparkler-particle-9" />
                        <div className="sparkler-particle sparkler-particle-10" />
                        <div className="sparkler-particle sparkler-particle-11" />
                        <div className="sparkler-particle sparkler-particle-12" />
                      </>
                    )}
                    <svg 
                      xmlns="http://www.w3.org/2000/svg" 
                      viewBox="0 0 17 16" 
                      style={{ 
                        width: '32px', 
                        height: '32px', 
                        fill: 'currentColor',
                        display: 'block',
                        flexShrink: 0,
                        transform: tokenType === 'spark' 
                          ? 'scale(1.2) rotate(5deg)' 
                          : 'scale(1) rotate(0deg)',
                        filter: tokenType === 'spark' 
                          ? 'drop-shadow(0 0 6px rgba(255, 107, 107, 0.8)) drop-shadow(0 0 10px rgba(255, 165, 2, 0.4)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3))' 
                          : 'drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2))',
                        transition: 'all 0.3s ease',
                        opacity: tokenType === 'spark' ? 1 : 0.6
                      }}
                    >
                    <path d="M9.92301 1.1764C10.6242 0.251095 12.0169 0.251096 12.0445 1.1764L12.1576 4.97111C12.1663 5.26202 12.3269 5.49138 12.5973 5.59903L16.1244 7.0032C16.9845 7.34559 16.5082 8.65433 15.3989 8.99672L10.8495 10.4009C10.5008 10.5085 10.1732 10.7379 9.95276 11.0288L7.07732 14.8235C6.37616 15.7488 4.98344 15.7488 4.95585 14.8235L4.84273 11.0288C4.83406 10.7379 4.67346 10.5085 4.40305 10.4009L0.875887 8.99672C0.015819 8.65433 0.492163 7.34559 1.60147 7.0032L6.15079 5.59903C6.49955 5.49138 6.82712 5.26202 7.04756 4.97111L9.92301 1.1764Z" />
                    </svg>
                  </div>
                  <span style={{ marginLeft: '24px' }}>Spark Points</span>
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
                      {formatTokenAmount(balances?.spark.premiumCredit || '0')} premium credits left
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
                          whiteSpace: 'nowrap',
                          // Always glow when claimable, extra intense glow when highlighted
                          boxShadow: canClaimDailyBoost 
                            ? (highlightDailyBoost 
                              ? '0 0 0 4px rgba(16, 185, 129, 0.8), 0 0 30px rgba(16, 185, 129, 0.9)' 
                              : '0 0 0 3px rgba(16, 185, 129, 0.6), 0 0 20px rgba(16, 185, 129, 0.7)')
                            : 'none',
                          animation: canClaimDailyBoost ? 'dailyBoostGlow 1.2s ease-in-out infinite' : 'none'
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
            </>
          )}

          {/* Recent Projects Button - only show when NOT in demo mode */}
          {authMode !== 'demo' && onHistoryClick && (
            <div 
              ref={projectsButtonRef}
              style={{
                marginTop: '8px',
                paddingTop: '8px',
                borderTop: '1px solid rgba(255, 255, 255, 0.1)',
                position: 'relative'
              }}>
              <button
                onClick={() => {
                  setShowUserMenu(false);
                  setShowProjectsTooltip(false);
                  onHistoryClick();
                }}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  border: '1px solid rgba(114, 227, 242, 0.3)',
                  background: 'rgba(114, 227, 242, 0.1)',
                  color: '#72e3f2',
                  cursor: 'pointer',
                  borderRadius: '8px',
                  padding: '10px 12px',
                  fontSize: '13px',
                  fontWeight: '500',
                  outline: 'none',
                  transition: 'all 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.background = 'rgba(114, 227, 242, 0.2)';
                  e.currentTarget.style.borderColor = 'rgba(114, 227, 242, 0.5)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.background = 'rgba(114, 227, 242, 0.1)';
                  e.currentTarget.style.borderColor = 'rgba(114, 227, 242, 0.3)';
                }}
              >
                {/* History Icon */}
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                Recent Projects
              </button>
              
              {/* Tooltip for Recent Projects - shown on second visit */}
              {showProjectsTooltip && (
                <div
                  onClick={() => {
                    console.log('🎯 Tooltip clicked - dismissing');
                    setShowProjectsTooltip(false);
                  }}
                  style={{
                    position: 'fixed',
                    top: `${tooltipPosition.top}px`,
                    left: `${tooltipPosition.left}px`,
                    transform: 'translateY(-50%)',
                    background: 'linear-gradient(135deg, #ff6b9d 0%, #ffa06b 100%)',
                    color: '#ffffff',
                    padding: '16px 20px',
                    borderRadius: '16px',
                    fontSize: '15px',
                    fontWeight: '600',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
                    zIndex: 99999,
                    animation: 'tooltipBounce 0.5s ease-out',
                    width: '260px',
                    lineHeight: '1.4',
                    cursor: 'pointer',
                    pointerEvents: 'auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '14px'
                  }}
                >
                  {/* Arrow pointing left to the button */}
                  <div
                    style={{
                      position: 'absolute',
                      left: '-12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      width: 0,
                      height: 0,
                      borderTop: '12px solid transparent',
                      borderBottom: '12px solid transparent',
                      borderRight: '12px solid #ff6b9d',
                      filter: 'drop-shadow(-2px 0 4px rgba(0, 0, 0, 0.3))'
                    }}
                  />
                  
                  {/* Large lightbulb icon */}
                  <div style={{
                    fontSize: '32px',
                    lineHeight: '1',
                    flexShrink: 0,
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    💡
                  </div>
                  
                  {/* Text content */}
                  <div style={{
                    flex: 1
                  }}>
                    Access your last 24 hours of projects here!
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Logout Button - Discrete */}
          <div style={{
            marginTop: '8px',
            paddingTop: '8px',
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            textAlign: 'center'
          }}>
            <button
              onClick={() => { void handleLogout(); }}
              disabled={isLoading}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'rgba(255, 255, 255, 0.4)',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                borderRadius: '4px',
                padding: '4px 8px',
                fontSize: '11px',
                fontWeight: '400',
                textAlign: 'center',
                opacity: isLoading ? 0.3 : 1,
                outline: 'none',
                transition: 'all 0.2s',
                textDecoration: 'underline',
                textDecorationColor: 'rgba(255, 255, 255, 0.2)'
              }}
              onMouseOver={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.6)';
                  e.currentTarget.style.textDecorationColor = 'rgba(255, 255, 255, 0.4)';
                }
              }}
              onMouseOut={(e) => {
                if (!isLoading) {
                  e.currentTarget.style.color = 'rgba(255, 255, 255, 0.4)';
                  e.currentTarget.style.textDecorationColor = 'rgba(255, 255, 255, 0.2)';
                }
              }}
            >
              {isLoading ? 'Logging out...' : 'Logout'}
            </button>
          </div>
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {showUserMenu && (
        <div
          style={{
            position: 'fixed',
            inset: '0',
            zIndex: 1000
          }}
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </div>
    )}
    
    {/* Render modal once, outside conditional to preserve state during auth changes */}
    <LoginModal
      open={showLoginModal}
      mode={loginModalMode}
      onModeChange={setLoginModalMode}
      onClose={handleCloseLoginModal}
      onSignupComplete={handleSignupComplete}
    />
    </>
  );
};
