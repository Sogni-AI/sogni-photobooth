import useApiAction from './useApiAction';
import { getPurchase, getStripeProducts, startPurchase } from '../services/stripe';
import { useCallback, useEffect } from 'react';
import { SogniClient } from '@sogni-ai/sogni-client';
import useApiQuery from './useApiQuery';

function useSparkPurchase() {
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
    if (productsError) {
      console.error('Failed to load products:', productsError);
    }
  }, [productsError]);

  useEffect(() => {
    if (intentError) {
      console.error('Purchase failed:', intentError);
      resetIntent();
    }
  }, [intentError, resetIntent]);

  useEffect(() => {
    if (statusError) {
      console.error('Purchase status check failed:', statusError);
      resetStatus();
    }
  }, [statusError, resetStatus]);

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
