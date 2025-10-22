/**
 * Rewards types for daily boost and other claim features
 */

export interface Reward {
  id: string;
  title: string;
  description?: string;
  amount: string;
  tokenType: 'spark' | 'sogni';
  canClaim: boolean;
  claimed?: boolean;
  nextClaim?: Date;
  provider?: string;
}

