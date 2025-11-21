import { Product } from '../../services/stripe.ts';
import '../../styles/stripe/ProductList.css';
import { trackBeginCheckout } from '../../utils/analytics.js';

interface Props {
  loading: boolean;
  products: Product[] | null;
  onPurchase: (productId: string) => void;
  currentBalance?: number;
}

function ProductList({ loading, products, onPurchase, currentBalance }: Props) {
  const formatUSD = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const handlePurchaseClick = (product: Product) => {
    // Store product info in sessionStorage for GA4 tracking
    // This allows us to track the correct currency and product details when purchase completes
    try {
      sessionStorage.setItem('sogni_pending_purchase', JSON.stringify({
        productId: product.product,
        priceId: product.id,
        name: product.nickname,
        price: product.unit_amount / 100,
        currency: product.currency.toUpperCase(),
        sparkValue: product.metadata?.sparkValue || '0',
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Error storing product info for tracking:', error);
    }

    // Track begin_checkout event for GA4 ecommerce
    trackBeginCheckout({
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
    });

    // Proceed with purchase
    onPurchase(product.product);
  };

  let content;
  if (products) {
    content = (
      <div className="stripe-products">
        {products.map((product) => {
          return (
            <div key={product.id} className="stripe-product">
              <h3>
                {product.nickname} ✨
              </h3>
              <p>{product.metadata.localDescription}</p>
              <div className="stripe-product-actions">
                <div className="stripe-product-price">{formatUSD(product.unit_amount / 100)}</div>
                <button
                  className="stripe-buy-button"
                  onClick={() => handlePurchaseClick(product)}
                  disabled={loading}
                >
                  Buy
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  } else {
    content = (
      <div className="stripe-placeholder">
        <div className="stripe-spinner"></div>
        <p>Loading products...</p>
      </div>
    );
  }

  return (
    <>
      <div className="stripe-header">
        <div className="stripe-sparkle-icon">✨</div>
        <h2>Boost your creativity, instantly.</h2>
        <p>
          Spark Points unlock fast, high-quality image creation--powered by the Supernet. They never
          expire, can't be transferred, and are always ready when inspiration strikes.
        </p>
      </div>
      <div className="stripe-content">
        {currentBalance !== undefined && (
          <div className="stripe-account-summary">
            <div className="stripe-balance-label">Current Balance</div>
            <div className="stripe-balance-value">{currentBalance.toFixed(2)} ✨</div>
          </div>
        )}
        <div className="stripe-products-wrapper">{content}</div>
      </div>
      {loading && (
        <div className="stripe-loading-overlay">
          <div className="stripe-spinner"></div>
        </div>
      )}
    </>
  );
}

export default ProductList;


