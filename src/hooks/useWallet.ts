/**
 * Hook for managing wallet balance and payment method
 * Now uses useEntity to properly subscribe to SDK balance updates
 */
import { useState, useCallback } from 'react';
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
}

// Stable getter function defined outside component - prevents re-creation on every render
// This is critical for useEntity to work properly without excessive updates
function getBalanceFromAccount(currentAccount: any): Balances | null {
  if (!currentAccount?.balance) {
    return null;
  }
  return currentAccount.balance as Balances;
}

export function useWallet(): UseWalletResult {
  const { isAuthenticated, authMode, getSogniClient } = useSogniAuth();
  const [tokenType, setTokenType] = useState<TokenType>(getPaymentMethod());
  const [isLoading] = useState(false);
  const [error] = useState<string | null>(null);

  // Switch payment method
  const switchPaymentMethod = useCallback((newType: TokenType) => {
    console.log('💳 Switching payment method to:', newType);
    setTokenType(newType);
    savePaymentMethod(newType);
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

  return {
    balances: finalBalances,
    tokenType,
    isLoading,
    error,
    switchPaymentMethod
  };
}

