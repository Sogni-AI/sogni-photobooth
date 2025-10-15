/**
 * Wallet service for managing balance and payment method
 */
import { TokenType, Balances } from '../types/wallet';

const PAYMENT_METHOD_KEY = 'sogni_payment_method';

/**
 * Get the stored payment method preference
 */
export function getPaymentMethod(): TokenType {
  try {
    const stored = localStorage.getItem(PAYMENT_METHOD_KEY);
    if (stored === 'spark' || stored === 'sogni') {
      return stored;
    }
  } catch (error) {
    console.warn('Failed to read payment method from localStorage:', error);
  }
  // Default to Spark
  return 'spark';
}

/**
 * Save the payment method preference
 */
export function setPaymentMethod(tokenType: TokenType): void {
  try {
    localStorage.setItem(PAYMENT_METHOD_KEY, tokenType);
  } catch (error) {
    console.warn('Failed to save payment method to localStorage:', error);
  }
}

/**
 * Format token amount for display
 */
export function formatTokenAmount(amount: string | number, decimals: number = 2): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(num)) return '0';
  
  // For very small numbers, show more decimals
  if (num > 0 && num < 0.01) {
    return num.toFixed(4);
  }
  
  // Format with commas for thousands
  return num.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals
  });
}

/**
 * Check if user has premium status based on balance and token type
 */
export function isPremiumBoosted(balances: Balances | null, tokenType: TokenType): boolean {
  if (!balances) return false;
  
  if (tokenType === 'sogni') {
    const sogniBalance = parseFloat(balances.sogni.net || '0');
    return sogniBalance > 1;
  } else {
    const premiumCredits = parseFloat(balances.spark.premiumCredit || '0');
    return premiumCredits > 1;
  }
}

/**
 * Get the token label for display
 */
export function getTokenLabel(tokenType: TokenType): string {
  return tokenType === 'sogni' ? 'SOGNI' : 'SPARK';
}

/**
 * Redirect to the wallet page to buy Premium Spark
 */
export function redirectToWallet(): void {
  // Determine the app URL based on environment (same logic as auth config)
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
  
  window.location.href = `${appUrl}/wallet`;
}

