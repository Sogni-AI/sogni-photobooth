/**
 * Hook for managing wallet balance and payment method
 */
import { useState, useEffect, useCallback } from 'react';
import { useSogniAuth } from '../services/sogniAuth';
import { TokenType, Balances } from '../types/wallet';
import { getPaymentMethod, setPaymentMethod as savePaymentMethod } from '../services/walletService';

interface UseWalletResult {
  balances: Balances | null;
  tokenType: TokenType;
  isLoading: boolean;
  error: string | null;
  switchPaymentMethod: (newType: TokenType) => void;
}

export function useWallet(): UseWalletResult {
  const { isAuthenticated, authMode, getSogniClient } = useSogniAuth();
  const [balances, setBalances] = useState<Balances | null>(null);
  const [tokenType, setTokenType] = useState<TokenType>(getPaymentMethod());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Switch payment method
  const switchPaymentMethod = useCallback((newType: TokenType) => {
    console.log('💳 Switching payment method to:', newType);
    setTokenType(newType);
    savePaymentMethod(newType);
  }, []);

  // Fetch balance and subscribe to updates
  useEffect(() => {
    // Only fetch balance if authenticated and NOT in demo mode
    if (!isAuthenticated || authMode === 'demo') {
      setBalances(null);
      setIsLoading(false);
      setError(null);
      return;
    }

    // Get the client inside the effect to avoid dependency issues
    const sogniClient = getSogniClient();
    if (!sogniClient) {
      console.warn('SogniClient not available for wallet balance fetch');
      return;
    }

    let isSubscribed = true;
    let hasFetched = false; // Prevent duplicate fetches

    const fetchBalance = async () => {
      // Prevent duplicate fetches
      if (hasFetched) {
        return;
      }
      hasFetched = true;

      try {
        setIsLoading(true);
        setError(null);

        // Explicitly fetch balance from API using refreshBalance()
        // This ensures we get the latest balance data
        console.log('💰 Calling refreshBalance() to fetch latest balance...');
        const balance = await sogniClient.account.refreshBalance();
        
        if (isSubscribed) {
          setBalances(balance as Balances);
          console.log('💰 Wallet balance loaded:', {
            sparkNet: balance.spark?.net,
            sparkSettled: balance.spark?.settled,
            sparkCredit: balance.spark?.credit,
            sparkDebit: balance.spark?.debit,
            sparkPremium: balance.spark?.premiumCredit,
            sogniNet: balance.sogni?.net,
            sogniSettled: balance.sogni?.settled,
            fullBalance: balance
          });
        }
      } catch (err) {
        console.error('Failed to fetch wallet balance:', err);
        if (isSubscribed) {
          setError(err instanceof Error ? err.message : 'Failed to load balance');
        }
      } finally {
        if (isSubscribed) {
          setIsLoading(false);
        }
      }
    };

    // Subscribe to balance update events from the socket
    const subscribeToBalanceUpdates = () => {
      try {
        // Access the socket via the client - use type assertion for TypeScript
        const socket = (sogniClient as any).socket;
        
        if (!socket || typeof socket.on !== 'function') {
          console.warn('Socket not available on SogniClient');
          return () => {};
        }

        const handleBalanceUpdate = (balances: any) => {
          console.log('💰 Balance update received via WebSocket:', {
            sparkNet: balances?.spark?.net,
            sparkPremium: balances?.spark?.premiumCredit,
            sogniNet: balances?.sogni?.net,
            fullBalances: balances
          });
          if (balances && isSubscribed) {
            setBalances(balances as Balances);
          }
        };

        // Listen on the socket for balanceUpdate events
        socket.on('balanceUpdate', handleBalanceUpdate);

        console.log('💰 Subscribed to balance updates on socket');

        // Return cleanup function
        return () => {
          if (socket && typeof socket.off === 'function') {
            socket.off('balanceUpdate', handleBalanceUpdate);
            console.log('💰 Unsubscribed from balance updates');
          }
        };
      } catch (err) {
        console.warn('Failed to subscribe to balance updates:', err);
      }
      return () => {}; // No-op cleanup
    };

    // Initial fetch
    fetchBalance();

    // Subscribe to updates
    const unsubscribe = subscribeToBalanceUpdates();

    // Cleanup
    return () => {
      isSubscribed = false;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, authMode]); // Removed getSogniClient to prevent infinite loop

  return {
    balances,
    tokenType,
    isLoading,
    error,
    switchPaymentMethod
  };
}

