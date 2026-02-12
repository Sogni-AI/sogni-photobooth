import { useCallback, useEffect, useState } from 'react';
import '../../styles/stripe/StripePurchase.css';
import ProductList from './ProductList';
import PurchaseProgress from './PurchaseProgress';
import useSparkPurchase from '../../hooks/useSparkPurchase';

interface Props {
  onClose: () => void;
}

function StripePurchase({ onClose }: Props) {
  const [open, setOpen] = useState(true);
  const { products, purchaseIntent, purchaseStatus, loading, makePurchase, reset, refreshStatus } =
    useSparkPurchase();
  const purchaseId = purchaseIntent?.purchaseId;

  useEffect(() => {
    if (purchaseIntent) {
      window.open(purchaseIntent.url, '_blank');
      refreshStatus();
    }
  }, [purchaseIntent, refreshStatus]);

  useEffect(() => {
    const channel = new BroadcastChannel('sogni-purchase-status');
    const handleMessage = (message: MessageEvent) => {
      if (message.data?.type === 'spark-purchase-complete') {
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
    setTimeout(onClose, 300);
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
      />
    );
  } else {
    content = (
      <ProductList
        loading={loading}
        products={products}
        onPurchase={makePurchase}
      />
    );
  }

  return (
    <div className={`stripe-modal-overlay ${open ? 'open' : ''}`} onClick={handleClose}>
      <div
        className={`stripe-modal ${open ? 'open' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="stripe-modal-inner">
          <button className="stripe-close-button" onClick={handleClose}>
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </button>
          {content}
        </div>
      </div>
    </div>
  );
}

export default StripePurchase;
