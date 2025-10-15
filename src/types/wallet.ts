/**
 * Wallet and balance types for Photobooth
 */

export type TokenType = 'spark' | 'sogni';

export interface TokenBalance {
  net: string;
  settled: string;
  credit: string;
  debit: string;
  premiumCredit?: string; // Only for spark
}

export interface Balances {
  spark: TokenBalance;
  sogni: TokenBalance;
}

export interface WalletState {
  balances: Balances | null;
  tokenType: TokenType;
  isLoading: boolean;
  error: string | null;
}

