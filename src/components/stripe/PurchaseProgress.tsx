import { PurchaseStatus } from '../../services/stripe.ts';
import '../../styles/stripe/PurchaseProgress.css';
import { useEffect } from 'react';
import { trackEvent } from '../../utils/analytics';
import { getCampaignSource } from '../../utils/campaignAttribution';

interface Props {
  purchase: PurchaseStatus | null;
  loading: boolean;
  onReset: () => void;
  onRefresh: () => void;
  onClose: () => void;
  currentBalance?: number;
}

function PurchaseProgress({ purchase, loading, onReset, onRefresh, onClose, currentBalance }: Props) {
  const isCompleted = purchase?.status === 'completed' || purchase?.status === 'processing';
  const productId = purchase?.productId;

  useEffect(() => {
    if (isCompleted && productId) {
      console.log('Purchase completed:', productId);
      
      // Track purchase conversion with campaign attribution
      const campaignSource = getCampaignSource();
      trackEvent('User', 'purchase_complete', `${campaignSource || 'organic'}: ${productId}`);
      if (campaignSource) {
        trackEvent('Gimi Challenge', 'conversion_purchase', `Source: ${campaignSource}, Product: ${productId}`);
        console.log(`[Campaign] Purchase attributed to: ${campaignSource}`);
      }
    }
  }, [isCompleted, productId]);

  let status;
  let heading;
  switch (purchase?.status) {
    case 'processing':
    case 'completed':
      heading = 'Thank you';
      status =
        'Your purchase was successful, and your Spark Points have been added to your balance.';
      break;
    default:
      heading = 'Waiting for Stripe';
      status =
        'Please complete the purchase checkout in the Stripe tab. Once completed, your Spark Points will be added to your account and you will return here.';
  }

  return (
    <>
      <div className="stripe-header">
        <div className="stripe-sparkle-icon">✨</div>
        <h2>{heading}</h2>
        <p>{status}</p>
      </div>
      <div className="stripe-content">
        {currentBalance !== undefined && (
          <div className="stripe-account-summary">
            <div className="stripe-balance-label">Current Balance</div>
            <div className="stripe-balance-value">{currentBalance.toFixed(2)} ✨</div>
          </div>
        )}
        <div className="stripe-progress-buttons">
          {isCompleted ? (
            <button className="stripe-buy-more-button" onClick={onReset}>
              ✨ Buy more Spark Points
            </button>
          ) : (
            <button
              className="stripe-check-status-button"
              onClick={onRefresh}
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="stripe-spinner-small"></span> Checking...
                </>
              ) : (
                'Check status'
              )}
            </button>
          )}
          <button className="stripe-dismiss-button" onClick={onClose}>
            Dismiss
          </button>
        </div>
      </div>
    </>
  );
}

export default PurchaseProgress;


