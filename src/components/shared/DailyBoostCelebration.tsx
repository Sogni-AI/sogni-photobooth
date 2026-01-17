import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import Turnstile from 'react-turnstile';
import { getTurnstileKey } from '../../config/env';
import ConfettiCelebration from './ConfettiCelebration';
import './DailyBoostCelebration.css';

type CelebrationState = 'idle' | 'claiming' | 'success';

interface DailyBoostCelebrationProps {
  isVisible: boolean;
  creditAmount: number;
  onClaim: (turnstileToken: string) => void;
  onDismiss: () => void;
  isClaiming: boolean;
  claimSuccess: boolean;
  claimError: string | null;
}

const DailyBoostCelebration: React.FC<DailyBoostCelebrationProps> = ({
  isVisible,
  creditAmount,
  onClaim,
  onDismiss,
  isClaiming,
  claimSuccess,
  claimError
}) => {
  const [state, setState] = useState<CelebrationState>('idle');
  const [showTurnstile, setShowTurnstile] = useState(false);
  const [displayedCredits, setDisplayedCredits] = useState(0);
  const [showConfetti, setShowConfetti] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const autoCloseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const counterIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasHandledSuccessRef = useRef(false);

  // Reset state when modal visibility changes
  useEffect(() => {
    if (isVisible) {
      setState('idle');
      setShowTurnstile(false);
      setDisplayedCredits(0);
      setShowConfetti(false);
      setIsClosing(false);
      hasHandledSuccessRef.current = false;
    }
  }, [isVisible]);

  // Track claiming state from props
  useEffect(() => {
    if (isClaiming && state === 'idle') {
      setState('claiming');
    }
  }, [isClaiming, state]);

  // Handle claim error - close modal after brief delay
  useEffect(() => {
    if (claimError && state === 'claiming') {
      // Error occurred during claim - close the modal after a short delay
      // The toast will show the error message
      const errorTimeout = setTimeout(() => {
        setIsClosing(true);
        setTimeout(() => {
          onDismiss();
        }, 300);
      }, 500);

      return () => clearTimeout(errorTimeout);
    }
  }, [claimError, state, onDismiss]);

  // Handle successful claim - use ref to prevent re-running
  useEffect(() => {
    if (claimSuccess && !hasHandledSuccessRef.current && state !== 'success') {
      hasHandledSuccessRef.current = true;
      setState('success');
      setShowConfetti(true);
      setDisplayedCredits(creditAmount); // Set immediately to avoid showing 0

      // Animate the credit counter from a slight offset for effect
      const duration = 800;
      const steps = 16;
      const startValue = Math.max(0, creditAmount - 15);
      const increment = (creditAmount - startValue) / steps;
      let current = startValue;

      setDisplayedCredits(startValue);

      counterIntervalRef.current = setInterval(() => {
        current += increment;
        if (current >= creditAmount) {
          setDisplayedCredits(creditAmount);
          if (counterIntervalRef.current) {
            clearInterval(counterIntervalRef.current);
            counterIntervalRef.current = null;
          }
        } else {
          setDisplayedCredits(Math.round(current));
        }
      }, duration / steps);

      // Auto-close after 2.5 seconds with fade out animation
      autoCloseTimeoutRef.current = setTimeout(() => {
        setIsClosing(true);
        // Wait for fade out animation then dismiss
        setTimeout(() => {
          onDismiss();
        }, 400);
      }, 2500);
    }
  }, [claimSuccess, creditAmount, onDismiss, state]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoCloseTimeoutRef.current) {
        clearTimeout(autoCloseTimeoutRef.current);
      }
      if (counterIntervalRef.current) {
        clearInterval(counterIntervalRef.current);
      }
    };
  }, []);

  const handleClaimClick = useCallback(() => {
    setShowTurnstile(true);
  }, []);

  const handleTurnstileVerify = useCallback((token: string) => {
    setShowTurnstile(false);
    onClaim(token);
  }, [onClaim]);

  const handleDismiss = useCallback(() => {
    if (autoCloseTimeoutRef.current) {
      clearTimeout(autoCloseTimeoutRef.current);
    }
    setIsClosing(true);
    setTimeout(() => {
      onDismiss();
    }, 300);
  }, [onDismiss]);

  // Handle backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget && state === 'idle' && !showTurnstile) {
      handleDismiss();
    }
  }, [state, showTurnstile, handleDismiss]);

  if (!isVisible) return null;

  const modalContent = (
    <>
      {/* Confetti - render outside modal for full-screen effect */}
      <ConfettiCelebration isVisible={showConfetti} />

      {/* Modal backdrop */}
      <div
        className={`daily-boost-backdrop ${isClosing ? 'closing' : ''}`}
        onClick={handleBackdropClick}
      >
        {/* Modal content */}
        <div className={`daily-boost-modal ${state} ${isClosing ? 'closing' : ''}`}>
          {/* FREE badge */}
          <div className="free-badge">
            <span>FREE!</span>
          </div>

          {/* Corner decorations */}
          <div className="corner-deco corner-tl">🌸</div>
          <div className="corner-deco corner-tr">🌸</div>
          <div className="corner-deco corner-bl">🌸</div>
          <div className="corner-deco corner-br">🌸</div>

          {/* Sparkles background */}
          <div className="sparkle-container">
            {[...Array(12)].map((_, i) => (
              <div key={i} className={`sparkle sparkle-${i + 1}`} />
            ))}
          </div>

          {/* Header */}
          <div className="daily-boost-header">
            <span className="sparkle-emoji">✨</span>
            <span className="header-text">DAILY BOOST</span>
            <span className="sparkle-emoji">✨</span>
          </div>

          {/* Cute subheader */}
          <div className="cute-subheader">
            {state === 'success' ? '🎊 Yay! You got it! 🎊' : '🎀 Your daily gift awaits! 🎀'}
          </div>

          {/* Gift icon with animation */}
          <div className={`gift-container ${state}`}>
            {state === 'success' ? (
              <div className="gift-opened">
                <div className="gift-burst">
                  {[...Array(12)].map((_, i) => (
                    <div key={i} className={`burst-particle burst-${i + 1}`} />
                  ))}
                </div>
                <span className="gift-emoji opened">🎉</span>
                <div className="success-hearts">
                  <span className="heart heart-1">💖</span>
                  <span className="heart heart-2">💕</span>
                  <span className="heart heart-3">💗</span>
                  <span className="heart heart-4">💖</span>
                  <span className="heart heart-5">💕</span>
                </div>
              </div>
            ) : (
              <>
                <span className={`gift-emoji ${state === 'claiming' ? 'shaking' : 'bouncing'}`}>🎁</span>
                <div className="gift-sparkles">
                  <span className="gift-spark spark-1">✨</span>
                  <span className="gift-spark spark-2">💫</span>
                  <span className="gift-spark spark-3">⭐</span>
                </div>
              </>
            )}
          </div>

          {/* Credit amount display */}
          <div className="credit-display">
            {state === 'success' ? (
              <div className="credit-earned">
                <span className="plus-sign">+</span>
                <span className="credit-counter">{displayedCredits}</span>
                <span className="credit-label">CREDITS</span>
                <span className="credit-emoji">🌟</span>
              </div>
            ) : (
              <div className="credit-preview">
                <span className="plus-sign">+</span>
                <span className="credit-amount">{creditAmount}</span>
                <span className="credit-label">CREDITS</span>
                <span className="credit-emoji">🌟</span>
              </div>
            )}
          </div>

          {/* Claim button or turnstile */}
          {state === 'idle' && !showTurnstile && (
            <button
              className="claim-button"
              onClick={handleClaimClick}
            >
              <span className="btn-emoji">🎁</span>
              CLAIM NOW!
              <span className="btn-emoji">🎁</span>
            </button>
          )}

          {/* Turnstile verification */}
          {showTurnstile && state === 'idle' && (
            <div className="turnstile-container">
              <div className="turnstile-label">✨ Quick verification ✨</div>
              <Turnstile
                sitekey={getTurnstileKey()}
                onVerify={handleTurnstileVerify}
              />
            </div>
          )}

          {/* Claiming state */}
          {state === 'claiming' && (
            <div className="claiming-indicator">
              <div className="spinner" />
              <span>Opening your gift... 🎁</span>
            </div>
          )}

          {/* Success state */}
          {state === 'success' && (
            <div className="success-message">
              <span>Woohoo! 🎉</span>
            </div>
          )}

          {/* Dismiss link - only show when not claimed yet */}
          {state === 'idle' && !showTurnstile && (
            <button
              className="dismiss-link"
              onClick={handleDismiss}
            >
              maybe later 💭
            </button>
          )}
        </div>
      </div>
    </>
  );

  // Use portal to render at document body level, avoiding parent transform/overflow issues
  return createPortal(modalContent, document.body);
};

export default React.memo(DailyBoostCelebration);
