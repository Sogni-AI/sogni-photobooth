/**
 * Rewards Context Provider
 * Manages daily boost claims and reward fetching with Turnstile protection
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Turnstile from 'react-turnstile';
import { Reward } from '../types/rewards';
import { useSogniAuth } from '../services/sogniAuth';
import { getTurnstileKey } from '../config/env';
import { useToastContext } from './ToastContext';
import { playSogniSignatureIfEnabled } from '../utils/sonicLogos';
import { useApp } from './AppContext';

interface RewardsContextType {
  rewards: Reward[];
  claimableCount: number;
  error: string | null;
  loading: boolean;
  claimInProgress: boolean;
  lastClaimSuccess: boolean;
  refresh: () => void;
  claimReward: (id: string | string[], skipTurnstile?: boolean) => void;
  claimRewardWithToken: (id: string | string[], turnstileToken: string) => void;
  resetClaimState: () => void;
}

const RewardsContext = createContext<RewardsContextType>({
  rewards: [],
  claimableCount: 0,
  error: null,
  loading: false,
  claimInProgress: false,
  lastClaimSuccess: false,
  refresh: () => {},
  claimReward: () => {},
  claimRewardWithToken: () => {},
  resetClaimState: () => {}
});

function isTimeLocked(reward: Reward): boolean {
  return !!reward.nextClaim && reward.nextClaim.getTime() > Date.now();
}

function isClaimable(reward: Reward): boolean {
  return reward.canClaim && !isTimeLocked(reward);
}

interface RewardsProviderProps {
  children: React.ReactNode;
}

export const RewardsProvider: React.FC<RewardsProviderProps> = ({ children }) => {
  const { isAuthenticated, getSogniClient } = useSogniAuth();
  const { showToast } = useToastContext();
  const { settings } = useApp();
  const [rewards, setRewards] = useState<Reward[]>([]);
  const [claimIntent, setClaimIntent] = useState<{ id?: string | string[]; token?: string }>({});
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimInProgress, setClaimInProgress] = useState(false);
  const [lastClaimSuccess, setLastClaimSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Guard to prevent duplicate fetches
  const isFetchingRef = useRef(false);
  const hasInitialFetchRef = useRef(false);
  
  // Rate limit backoff state
  const rateLimitBackoffRef = useRef(0);
  const rateLimitTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch rewards from API with rate limit handling
  // Use a stable function that doesn't depend on getSogniClient in deps
  const fetchRewards = useCallback(async () => {
    // Don't fetch if not authenticated
    if (!isAuthenticated) {
      setRewards([]);
      hasInitialFetchRef.current = false;
      return;
    }

    // Prevent duplicate concurrent fetches
    if (isFetchingRef.current) {
      console.log('⏸️ Skipping duplicate rewards fetch request');
      return;
    }

    // Check if we're in rate limit backoff
    if (rateLimitBackoffRef.current > Date.now()) {
      const waitTime = Math.ceil((rateLimitBackoffRef.current - Date.now()) / 1000);
      console.log(`⏳ Rate limited, waiting ${waitTime}s before fetching rewards`);
      return;
    }

    // Get client inside the function without adding to dependencies
    const sogniClient = getSogniClient();
    if (!sogniClient) {
      console.warn('SogniClient not available for rewards fetch');
      return;
    }

    isFetchingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      // Fetch rewards from the account API
      const rewardsData = await sogniClient.account.rewards();
      
      // Transform the rewards data to include Date objects for nextClaim
      const transformedRewards = rewardsData.map((reward: any) => ({
        ...reward,
        nextClaim: reward.nextClaim ? new Date(reward.nextClaim) : undefined
      }));

      setRewards(transformedRewards);
      hasInitialFetchRef.current = true;
      
      // Reset backoff on success
      rateLimitBackoffRef.current = 0;
      
      console.log('✅ Rewards fetched successfully:', transformedRewards.length);
    } catch (err: any) {
      console.error('Failed to fetch rewards:', err);
      
      // Handle 429 rate limit errors with exponential backoff
      if (err.message?.includes('429') || err.statusCode === 429) {
        const backoffMinutes = rateLimitBackoffRef.current > 0 ? 5 : 2; // 2 min first time, 5 min after
        rateLimitBackoffRef.current = Date.now() + (backoffMinutes * 60 * 1000);
        
        console.warn(`⚠️ Rate limited (429). Backing off for ${backoffMinutes} minutes`);
        setError(`Rate limited. Please wait ${backoffMinutes} minutes before trying again.`);
        
        // Don't auto-retry on rate limit - user should manually refresh
        // This prevents further rate limiting
      } else {
        setError(err.message || 'Failed to load rewards');
      }
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]); // Only depend on isAuthenticated, not getSogniClient

  // Initial fetch only when authentication status changes
  useEffect(() => {
    if (isAuthenticated && !hasInitialFetchRef.current) {
      console.log('🎁 Initial rewards fetch');
      fetchRewards();
    } else if (!isAuthenticated) {
      setRewards([]);
      hasInitialFetchRef.current = false;
    }
    
    // Cleanup timeout on unmount
    return () => {
      if (rateLimitTimeoutRef.current) {
        clearTimeout(rateLimitTimeoutRef.current);
        rateLimitTimeoutRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated]); // Only trigger on auth change, not on fetchRewards change

  const claimReward = useCallback((id: string | string[], skipTurnstile = false) => {
    setClaimIntent({ id, token: skipTurnstile === true ? 'skip' : undefined });
  }, []);

  // Claim reward with a provided turnstile token (for modal flow)
  const claimRewardWithToken = useCallback((id: string | string[], turnstileToken: string) => {
    setClaimInProgress(true);
    setLastClaimSuccess(false);
    setClaimIntent({ id, token: turnstileToken });
  }, []);

  // Reset claim state (called after modal closes)
  const resetClaimState = useCallback(() => {
    setClaimInProgress(false);
    setLastClaimSuccess(false);
  }, []);

  const handleTurnstileToken = useCallback((token: string) => {
    setClaimIntent((prev) => ({ ...prev, token }));
  }, []);

  const handleCancelClaim = useCallback(() => {
    setClaimIntent({});
  }, []);

  // Handle the actual claim when we have both ID and token
  useEffect(() => {
    if (claimIntent.id && claimIntent.token) {
      const ids = Array.isArray(claimIntent.id) ? claimIntent.id : [claimIntent.id];
      const token = claimIntent.token === 'skip' ? undefined : claimIntent.token;
      const claimedRewards = rewards?.filter((reward) => ids.includes(reward.id));
      
      if (!claimedRewards?.length) {
        console.error('Rewards not found:', ids);
        setClaimIntent({});
        return;
      }

      const sogniClient = getSogniClient();
      if (!sogniClient) {
        console.warn('SogniClient not available for claim');
        setClaimIntent({});
        return;
      }

      setClaimIntent({});
      setClaimLoading(true);

      sogniClient.account
        .claimRewards(ids, {
          turnstileToken: token,
          provider: claimedRewards[0].provider
        })
        .then(() => {
          console.log('✅ Rewards claimed successfully:', claimedRewards.map(r => r.title));

          // Set success state for celebration modal
          setLastClaimSuccess(true);

          // Show success toast with credit amount
          const rewardTitles = claimedRewards.map(r => r.title).join(', ');
          const totalAmount = claimedRewards.reduce((sum, r) => sum + parseFloat(r.amount), 0);
          showToast({
            title: '🎁 Reward Claimed!',
            message: `Successfully claimed: ${rewardTitles} (${totalAmount} credits)`,
            type: 'success'
          });

          // Play sonic logo for reward claim (respects sound settings)
          playSogniSignatureIfEnabled(settings.soundEnabled);

          // Refresh rewards list
          return fetchRewards();
        })
        .catch((err: any) => {
          console.error('Failed to claim reward:', err);
          
          let errorTitle = 'Claim Failed';
          let errorMessage = err.message || 'Failed to claim reward';
          
          // Handle 429 rate limit errors
          if (err.message?.includes('429') || err.statusCode === 429) {
            const backoffMinutes = 2;
            rateLimitBackoffRef.current = Date.now() + (backoffMinutes * 60 * 1000);
            console.warn(`⚠️ Rate limited (429) on claim. Backing off for ${backoffMinutes} minutes`);
            errorTitle = 'Rate Limited';
            errorMessage = `Too many requests. Please wait ${backoffMinutes} minutes before trying again.`;
          }
          // Handle email verification errors
          else if (errorMessage.includes('verify your email')) {
            errorTitle = 'Email Verification Required';
            // Extract just the important part of the message
            errorMessage = 'Please verify your email to claim rewards. Check your inbox for the verification link.';
          }
          
          setError(errorMessage);
          
          // Show toast notification to user
          showToast({
            title: errorTitle,
            message: errorMessage,
            type: 'error'
          });
        })
        .finally(() => {
          setClaimLoading(false);
          setClaimInProgress(false);
        });
    }
  }, [claimIntent, rewards, getSogniClient, fetchRewards, showToast]);

  const contextValue = useMemo<RewardsContextType>(
    () => ({
      rewards,
      claimableCount: rewards?.filter(isClaimable).length || 0,
      error,
      loading: loading || claimLoading,
      claimInProgress,
      lastClaimSuccess,
      refresh: fetchRewards,
      claimReward,
      claimRewardWithToken,
      resetClaimState
    }),
    [rewards, error, loading, claimLoading, claimInProgress, lastClaimSuccess, fetchRewards, claimReward, claimRewardWithToken, resetClaimState]
  );

  return (
    <RewardsContext.Provider value={contextValue}>
      {children}
      
      {/* Turnstile Modal for bot protection */}
      {!!claimIntent.id && !claimIntent.token && (
        <>
          {/* Modal backdrop */}
          <div
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.5)',
              zIndex: 9998,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            onClick={handleCancelClaim}
          />
          
          {/* Modal content */}
          <div
            style={{
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              backgroundColor: '#2d3748',
              borderRadius: '12px',
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
              zIndex: 9999,
              padding: '24px',
              minWidth: '300px'
            }}
          >
            <div style={{
              fontSize: '18px',
              fontWeight: '600',
              color: 'white',
              marginBottom: '20px',
              textAlign: 'center'
            }}>
              Verify you are human
            </div>
            
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center'
            }}>
              <Turnstile
                sitekey={getTurnstileKey()}
                onVerify={handleTurnstileToken}
              />
            </div>
          </div>
        </>
      )}
    </RewardsContext.Provider>
  );
};

export const useRewards = (): RewardsContextType => {
  return useContext(RewardsContext);
};

