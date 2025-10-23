import useApiAction from './useApiAction.ts';
import { getPurchase, getStripeProducts, startPurchase } from '../services/stripe.ts';
import { useCallback, useEffect } from 'react';
import { SogniClient } from '@sogni-ai/sogni-client';
import useApiQuery from './useApiQuery.ts';

/**
 * Hook for managing Spark Point purchases via Stripe
 * 
 * Note: Balance updates are handled automatically via WebSocket through the useWallet hook.
 * The SDK's DataEntity emits 'updated' events when balance changes, which are caught by
 * useEntity and trigger React state updates. No polling needed!
 * 
 * This hook only manages the purchase flow state (products, checkout, status checking).
 */
function useSparkPurchase(showAlert?: (alert: { variant: string; title: string; text: string }) => void) {
  const { data: products, error: productsError } = useApiQuery(getStripeProducts);
  const {
    data: purchaseIntent,
    loading: intentLoading,
    error: intentError,
    execute: makePurchase,
    reset: resetIntent
  } = useApiAction(startPurchase);
  const purchaseId = purchaseIntent?.purchaseId;
  const fetchPurchaseStatus = useCallback(
    async (api: SogniClient) => {
      if (!purchaseId) return null;
      return getPurchase(api, purchaseId);
    },
    [purchaseId]
  );
  const {
    data: purchaseStatus,
    loading: loadingStatus,
    error: statusError,
    execute: refreshStatus,
    reset: resetStatus
  } = useApiAction(fetchPurchaseStatus);

  const reset = useCallback(() => {
    resetIntent();
    resetStatus();
  }, [resetIntent, resetStatus]);

  useEffect(() => {
    if (productsError && showAlert) {
      showAlert({
        variant: 'error',
        title: 'Failed to load products',
        text: 'Failed to load products. Please try again later.'
      });
    }
  }, [productsError, showAlert]);

  useEffect(() => {
    if (intentError && showAlert) {
      showAlert({
        variant: 'error',
        title: 'Purchase failed',
        text: 'Failed to start purchase. Please try again later.'
      });
      resetIntent();
    }
  }, [intentError, showAlert, resetIntent]);

  useEffect(() => {
    if (statusError && showAlert) {
      showAlert({
        variant: 'error',
        title: 'Purchase may have failed',
        text: 'Failed to get purchase status. Please try again later.'
      });
      resetStatus();
    }
  }, [statusError, showAlert, resetStatus]);

  return {
    products,
    purchaseIntent,
    purchaseStatus,
    makePurchase,
    refreshStatus,
    loading: loadingStatus || intentLoading,
    reset
  };
}

export default useSparkPurchase;


