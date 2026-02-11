import { useCallback, useEffect, useState } from 'react';
import '../../styles/stripe/StripePurchase.css';
import ProductList from './ProductList.tsx';
import PurchaseProgress from './PurchaseProgress.tsx';
import useSparkPurchase from '../../hooks/useSparkPurchase.ts';
import { trackViewItem } from '../../utils/analytics.js';

interface Props {
  onClose: () => void;
  currentBalance?: number;
  showAlert?: (alert: { variant: string; title: string; text: string }) => void;
}

function StripePurchase({ onClose, currentBalance, showAlert }: Props) {

  const [open, setOpen] = useState(true);
  const { products, purchaseIntent, purchaseStatus, loading, makePurchase, reset, refreshStatus } =
    useSparkPurchase(showAlert);
  const purchaseId = purchaseIntent?.purchaseId;

  // Note: Balance updates happen automatically via WebSocket (useEntity hook in useWallet)
  // No polling needed - the SDK's DataEntity emits 'updated' events when balance changes

  useEffect(() => {
    if (!products) {
      return;
    }

    // Track view_item event for GA4 ecommerce
    const items = products.map((product: any) => ({
      item_id: product.id,
      item_name: product.nickname,
      price: product.unit_amount / 100, // Convert cents to currency unit
      currency: product.currency.toUpperCase(),
      quantity: 1,
      item_category: 'Spark Points',
      item_brand: 'Sogni',
      // Include spark value in custom dimension if available
      ...(product.metadata?.sparkValue && {
        spark_value: product.metadata.sparkValue
      })
    }));

    trackViewItem(items);
  }, [products]);

  // If new purchase URL available, open it in new window
  useEffect(() => {
    if (purchaseIntent) {
      window.open(purchaseIntent.url, '_blank');
      refreshStatus();
    }
  }, [purchaseIntent, refreshStatus]);

  // Listen for purchase completion from success page (opened in new tab)
  useEffect(() => {
    const channel = new BroadcastChannel('sogni-purchase-status');
    const handleMessage = (message: MessageEvent) => {
      if (message.data?.type === 'spark-purchase-complete') {
        // Refresh purchase status to show completion UI
        // Balance will update automatically via WebSocket
        refreshStatus();
      }
    };
    channel.addEventListener('message', handleMessage);
    return () => {
      channel.removeEventListener('message', handleMessage);
      channel.close();
    };
  }, [refreshStatus]);

  const handleClose = useCallback(() => {
    setOpen(false);
    setTimeout(onClose, 300); // Allow animation to complete
  }, [onClose]);

  let content;
  if (purchaseId) {
    content = (
      <PurchaseProgress
        purchase={purchaseStatus}
        onReset={reset}
        onRefresh={refreshStatus}
        onClose={handleClose}
        loading={loading}
        currentBalance={currentBalance}
      />
    );
  } else {
    content = (
      <ProductList
        loading={loading}
        products={products}
        onPurchase={makePurchase}
        currentBalance={currentBalance}
      />
    );
  }

  return (
    <div className={`stripe-modal-overlay ${open ? 'open' : ''}`} onClick={handleClose}>
      <div
        className={`stripe-modal ${purchaseId ? 'stripe-modal-small' : ''} ${open ? 'open' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="stripe-close-button" onClick={handleClose}>
          ✕
        </button>
        <div className="stripe-modal-inner">
          {content}
        </div>
      </div>
    </div>
  );
}

export default StripePurchase;
