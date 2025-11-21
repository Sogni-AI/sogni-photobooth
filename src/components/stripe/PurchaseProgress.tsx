import { PurchaseStatus } from '../../services/stripe.ts';
import '../../styles/stripe/PurchaseProgress.css';
import { useEffect } from 'react';
import { trackEvent, trackPurchase } from '../../utils/analytics';
import { getCampaignSource } from '../../utils/campaignAttribution';
import { getReferralSource } from '../../utils/referralTracking';

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

      // Retrieve stored product info for accurate currency tracking
      let productInfo: any = null;
      try {
        const stored = sessionStorage.getItem('sogni_pending_purchase');
        if (stored) {
          productInfo = JSON.parse(stored);
          // Clear it after use
          sessionStorage.removeItem('sogni_pending_purchase');
        }
      } catch (error) {
        console.error('Error retrieving product info for tracking:', error);
      }

      // Track GA4 ecommerce purchase event
      if (purchase) {
        const currency = productInfo?.currency || 'USD';
        const price = productInfo?.price || purchase.amountInDollars;
        const itemName = productInfo?.name || `${purchase.amountInTokens} Spark Points`;
        const priceId = productInfo?.priceId || purchase.productId;

        trackPurchase({
          transaction_id: purchase.transactionId,
          value: price,
          currency: currency,
          items: [
            {
              item_id: priceId,
              item_name: itemName,
              price: price,
              quantity: 1,
              item_category: 'Spark Points',
              item_brand: 'Sogni',
              spark_value: purchase.amountInTokens.toString()
            }
          ],
          affiliation: 'Sogni Photobooth'
        });
      }

      // Track purchase conversion with campaign attribution
      const campaignSource = getCampaignSource();
      trackEvent('User', 'purchase_complete', `${campaignSource || 'organic'}: ${productId}`);
      if (campaignSource) {
        trackEvent('Gimi Challenge', 'conversion_purchase', `Source: ${campaignSource}, Product: ${productId}`);
        console.log(`[Campaign] Purchase attributed to: ${campaignSource}`);
      }

      // Track referral conversion
      const referralSource = getReferralSource();
      if (referralSource) {
        trackEvent('Referral', 'conversion_purchase', `Referred by: ${referralSource}, Product: ${productId}`);
        console.log(`[Referral] Purchase attributed to referrer: ${referralSource}`);
        // Note: The referral cookie persists for 30 days, so multiple conversions can be tracked
      }
    }
  }, [isCompleted, productId, purchase]);

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


