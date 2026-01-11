/**
 * Cancellation Service
 *
 * Manages project cancellation with rate limiting, confirmation popups,
 * and refund estimation based on Sogni server constraints.
 *
 * Key server constraints (from sogni-socket):
 * - MIN_CANCEL_INTERVAL: 20 seconds between cancels
 * - Server returns artistCancelConfirmation with { didCancel, error_message, jobID }
 * - Partial refunds based on steps completed vs expected
 */

// Rate limit: 20 seconds between cancels (matches server MIN_CANCEL_INTERVAL)
const CANCEL_RATE_LIMIT_MS = 20000;

// Cookie name for "don't remind me again" preference
const CANCEL_CONFIRMATION_COOKIE = 'sogni_cancel_no_confirm';

// Local storage key for tracking last cancel time (backup for rate limiting)
const LAST_CANCEL_TIME_KEY = 'sogni_last_cancel_time';

export interface CancellationState {
  lastCancelTime: number | null;
  canCancel: boolean;
  cooldownRemaining: number; // seconds
}

export interface CancelResult {
  success: boolean;
  didCancel: boolean;
  errorMessage?: string;
  projectId: string;
  rateLimited?: boolean;
  cooldownRemaining?: number;
}

export interface RefundEstimate {
  estimatedRefundPercent: number;
  stepsCompleted: number;
  totalSteps: number;
  message: string;
}

// Track last cancel time in memory for immediate feedback
let lastCancelTime: number | null = null;

// Initialize from localStorage
if (typeof window !== 'undefined') {
  const stored = localStorage.getItem(LAST_CANCEL_TIME_KEY);
  if (stored) {
    const parsed = parseInt(stored, 10);
    if (!isNaN(parsed)) {
      lastCancelTime = parsed;
    }
  }
}

/**
 * Check if the user has opted out of cancel confirmations
 */
export function shouldSkipConfirmation(): boolean {
  if (typeof document === 'undefined') return false;

  const cookies = document.cookie.split(';');
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split('=');
    if (name === CANCEL_CONFIRMATION_COOKIE && value === 'true') {
      return true;
    }
  }
  return false;
}

/**
 * Set the "don't remind me again" preference
 */
export function setSkipConfirmation(skip: boolean): void {
  if (typeof document === 'undefined') return;

  if (skip) {
    // Set cookie for 1 year
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    document.cookie = `${CANCEL_CONFIRMATION_COOKIE}=true; expires=${expires.toUTCString()}; path=/; SameSite=Lax`;
  } else {
    // Remove cookie
    document.cookie = `${CANCEL_CONFIRMATION_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
  }
}

/**
 * Get the current cancellation state (whether user can cancel, cooldown remaining)
 */
export function getCancellationState(): CancellationState {
  const now = Date.now();
  const timeSinceLastCancel = lastCancelTime ? now - lastCancelTime : Infinity;
  const canCancel = timeSinceLastCancel >= CANCEL_RATE_LIMIT_MS;
  const cooldownRemaining = canCancel ? 0 : Math.ceil((CANCEL_RATE_LIMIT_MS - timeSinceLastCancel) / 1000);

  return {
    lastCancelTime,
    canCancel,
    cooldownRemaining
  };
}

/**
 * Update the last cancel time (called after successful cancellation)
 */
export function recordCancelAttempt(): void {
  lastCancelTime = Date.now();
  if (typeof window !== 'undefined') {
    localStorage.setItem(LAST_CANCEL_TIME_KEY, lastCancelTime.toString());
  }
}

/**
 * Estimate the refund percentage based on progress
 */
export function estimateRefund(progress: number, totalSteps?: number, completedSteps?: number): RefundEstimate {
  // Progress is typically 0-100
  const normalizedProgress = Math.min(100, Math.max(0, progress));
  const estimatedRefundPercent = Math.max(0, 100 - normalizedProgress);

  // Calculate steps if provided
  const stepsCompleted = completedSteps ?? Math.round((normalizedProgress / 100) * (totalSteps ?? 100));
  const steps = totalSteps ?? 100;

  let message: string;
  if (estimatedRefundPercent >= 90) {
    message = 'You\'ll receive a nearly full refund';
  } else if (estimatedRefundPercent >= 70) {
    message = `~${Math.round(estimatedRefundPercent)}% refund for remaining work`;
  } else if (estimatedRefundPercent >= 40) {
    message = `~${Math.round(estimatedRefundPercent)}% refund - generation is partially complete`;
  } else if (estimatedRefundPercent >= 10) {
    message = `~${Math.round(estimatedRefundPercent)}% refund - generation is mostly complete`;
  } else {
    message = 'Generation is nearly complete - minimal refund expected';
  }

  return {
    estimatedRefundPercent,
    stepsCompleted,
    totalSteps: steps,
    message
  };
}

/**
 * Format cooldown time for display
 */
export function formatCooldown(seconds: number): string {
  if (seconds <= 0) return '';
  if (seconds === 1) return '1 second';
  return `${seconds} seconds`;
}

/**
 * Cancel listeners for real-time updates
 */
type CancelStateListener = (state: CancellationState) => void;
const cancelStateListeners: CancelStateListener[] = [];

export function subscribeToCancelState(listener: CancelStateListener): () => void {
  cancelStateListeners.push(listener);
  return () => {
    const index = cancelStateListeners.indexOf(listener);
    if (index > -1) {
      cancelStateListeners.splice(index, 1);
    }
  };
}

/**
 * Notify listeners of state change and start cooldown timer
 */
export function notifyCancelStateChange(): void {
  const state = getCancellationState();
  cancelStateListeners.forEach(listener => {
    try {
      listener(state);
    } catch (error) {
      console.warn('Error in cancel state listener:', error);
    }
  });

  // If in cooldown, set up timer to notify when cooldown ends
  if (!state.canCancel && state.cooldownRemaining > 0) {
    const checkInterval = setInterval(() => {
      const newState = getCancellationState();
      cancelStateListeners.forEach(listener => {
        try {
          listener(newState);
        } catch (error) {
          console.warn('Error in cancel state listener:', error);
        }
      });
      if (newState.canCancel) {
        clearInterval(checkInterval);
      }
    }, 1000);

    // Safety cleanup after 30 seconds max
    setTimeout(() => clearInterval(checkInterval), 30000);
  }
}

/**
 * Check if a project/job is in a cancellable state
 */
export function isCancellableStatus(status: string): boolean {
  const cancellableStatuses = [
    'pending',
    'queued',
    'initiating',
    'processing',
    'generating',
    'Generating',
    'Queue',
    'Initializing Model',
    'Processing'
  ];
  return cancellableStatuses.some(s =>
    status.toLowerCase().includes(s.toLowerCase())
  );
}

export default {
  shouldSkipConfirmation,
  setSkipConfirmation,
  getCancellationState,
  recordCancelAttempt,
  estimateRefund,
  formatCooldown,
  subscribeToCancelState,
  notifyCancelStateChange,
  isCancellableStatus,
  CANCEL_RATE_LIMIT_MS
};
