/**
 * Hook for managing wallet balance and payment method
 * Now uses useEntity to properly subscribe to SDK balance updates
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { useSogniAuth } from '../services/sogniAuth';
import { TokenType, Balances } from '../types/wallet';
import { getPaymentMethod, setPaymentMethod as savePaymentMethod } from '../services/walletService';
import useEntity from './useEntity';

interface UseWalletResult {
  balances: Balances | null;
  tokenType: TokenType;
  isLoading: boolean;
  error: string | null;
  switchPaymentMethod: (newType: TokenType) => void;
  onBalanceIncrease?: (callback: (tokenType: TokenType, oldBalance: number, newBalance: number) => void) => void;
}

// Stable getter function defined outside component - prevents re-creation on every render
// This is critical for useEntity to work properly without excessive updates
function getBalanceFromAccount(currentAccount: any): Balances | null {
  if (!currentAccount?.balance) {
    return null;
  }
  return currentAccount.balance as Balances;
}

// Custom event for syncing payment method across all hook instances
const PAYMENT_METHOD_CHANGE_EVENT = 'payment-method-change';

export function useWallet(): UseWalletResult {
  const { isAuthenticated, authMode, getSogniClient } = useSogniAuth();
  const [tokenType, setTokenType] = useState<TokenType>(getPaymentMethod());
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  // Track previous balances to detect increases
  const previousBalancesRef = useRef<Balances | null>(null);
  const balanceIncreaseCallbackRef = useRef<((tokenType: TokenType, oldBalance: number, newBalance: number) => void) | null>(null);
  const isInitialLoadRef = useRef(true);

  // Listen for payment method changes from other component instances
  useEffect(() => {
    const handlePaymentMethodChange = (event: Event) => {
      const customEvent = event as CustomEvent<TokenType>;
      console.log('💳 Received payment method change event:', customEvent.detail);
      setTokenType(customEvent.detail);
    };

    window.addEventListener(PAYMENT_METHOD_CHANGE_EVENT, handlePaymentMethodChange);
    return () => {
      window.removeEventListener(PAYMENT_METHOD_CHANGE_EVENT, handlePaymentMethodChange);
    };
  }, []);

  // Switch payment method
  const switchPaymentMethod = useCallback((newType: TokenType) => {
    console.log('💳 Switching payment method to:', newType);
    setTokenType(newType);
    savePaymentMethod(newType);
    
    // Notify all other useWallet instances about the change
    const event = new CustomEvent(PAYMENT_METHOD_CHANGE_EVENT, { detail: newType });
    window.dispatchEvent(event);
  }, []);

  // Allow setting a callback for balance increases
  const onBalanceIncrease = useCallback((callback: (tokenType: TokenType, oldBalance: number, newBalance: number) => void) => {
    balanceIncreaseCallbackRef.current = callback;
  }, []);

  // Get the sogni client
  const sogniClient = getSogniClient();

  // Use useEntity to subscribe to balance updates via SDK's DataEntity pattern
  // This will automatically update when the SDK receives balance updates from the API
  // The getter function MUST be stable (defined outside) to prevent excessive re-renders
  const balances = useEntity(
    sogniClient?.account?.currentAccount || null,
    getBalanceFromAccount
  );

  // Return null balances if not authenticated or in demo mode
  const finalBalances = (isAuthenticated && authMode !== 'demo') ? balances : null;

  // Detect balance increases and trigger callback
  useEffect(() => {
    if (!finalBalances) {
      return;
    }

    // On first load, just store the balances without triggering notifications
    if (isInitialLoadRef.current) {
      previousBalancesRef.current = finalBalances;
      isInitialLoadRef.current = false;
      return;
    }

    // If we don't have previous balances yet, store current and return
    if (!previousBalancesRef.current) {
      previousBalancesRef.current = finalBalances;
      return;
    }

    const previousBalances = previousBalancesRef.current;
    const currentBalances = finalBalances;

    // Check for Spark balance increase
    const previousSparkNet = parseFloat(previousBalances.spark?.net || '0');
    const currentSparkNet = parseFloat(currentBalances.spark?.net || '0');
    if (currentSparkNet > previousSparkNet && balanceIncreaseCallbackRef.current) {
      balanceIncreaseCallbackRef.current('spark', previousSparkNet, currentSparkNet);
    }

    // Check for Sogni balance increase
    const previousSogniNet = parseFloat(previousBalances.sogni?.net || '0');
    const currentSogniNet = parseFloat(currentBalances.sogni?.net || '0');
    if (currentSogniNet > previousSogniNet && balanceIncreaseCallbackRef.current) {
      balanceIncreaseCallbackRef.current('sogni', previousSogniNet, currentSogniNet);
    }

    // Update the previous balances
    previousBalancesRef.current = currentBalances;
  }, [finalBalances]);

  return {
    balances: finalBalances,
    tokenType,
    isLoading,
    error,
    switchPaymentMethod,
    onBalanceIncrease
  };
}

