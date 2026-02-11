import { useMemo, useRef, useState, useEffect } from 'react';
import { Product } from '../../services/stripe.ts';
import '../../styles/stripe/ProductList.css';
import { trackBeginCheckout } from '../../utils/analytics.js';

// Professional SVG icon for sparks
const SparkIcon = ({ size = 24 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <path
      d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"
      fill="url(#spark-product-gradient)"
    />
    <defs>
      <linearGradient id="spark-product-gradient" x1="2" y1="2" x2="22" y2="22">
        <stop stopColor="#667eea" />
        <stop offset="1" stopColor="#a78bfa" />
      </linearGradient>
    </defs>
  </svg>
);

interface Props {
  loading: boolean;
  products: Product[] | null;
  onPurchase: (productId: string) => void;
  currentBalance?: number;
}

function ProductList({ loading, products, onPurchase, currentBalance }: Props) {
  const carouselRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true); // Default true until we know

  // Sort products by price (cheapest first)
  const sortedProducts = useMemo(() => {
    if (!products) return null;
    return [...products].sort((a, b) => a.unit_amount - b.unit_amount);
  }, [products]);

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

  // Check scroll state
  const updateScrollState = () => {
    if (carouselRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = carouselRef.current;
      // Only show left arrow if scrolled away from start
      const isAtStart = scrollLeft <= 5;
      // Only show right arrow if there's more content to scroll to
      const isAtEnd = scrollLeft >= scrollWidth - clientWidth - 5;

      setCanScrollLeft(!isAtStart);
      setCanScrollRight(!isAtEnd && scrollWidth > clientWidth);
    }
  };

  useEffect(() => {
    // Reset scroll position and state when products change
    if (carouselRef.current) {
      carouselRef.current.scrollLeft = 0;
    }
    setCanScrollLeft(false);

    // Use requestAnimationFrame to ensure DOM has rendered
    const rafId = requestAnimationFrame(() => {
      requestAnimationFrame(updateScrollState);
    });

    const carousel = carouselRef.current;
    if (carousel) {
      carousel.addEventListener('scroll', updateScrollState);
      window.addEventListener('resize', updateScrollState);
      return () => {
        cancelAnimationFrame(rafId);
        carousel.removeEventListener('scroll', updateScrollState);
        window.removeEventListener('resize', updateScrollState);
      };
    }
    return () => cancelAnimationFrame(rafId);
  }, [sortedProducts]);

  const scrollCarousel = (direction: 'left' | 'right') => {
    if (carouselRef.current) {
      const scrollAmount = 280; // Card width + gap
      carouselRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  let content;
  if (sortedProducts) {
    content = (
      <div className="stripe-carousel-container">
        {canScrollLeft && (
          <button
            className="stripe-carousel-arrow stripe-carousel-arrow-left"
            onClick={() => scrollCarousel('left')}
            aria-label="Scroll left"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        <div className="stripe-products-carousel" ref={carouselRef}>
          {sortedProducts.map((product) => {
            return (
              <div key={product.id} className="stripe-product">
                <h3>
                  <SparkIcon size={20} />
                  {product.nickname}
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
        {canScrollRight && (
          <button
            className="stripe-carousel-arrow stripe-carousel-arrow-right"
            onClick={() => scrollCarousel('right')}
            aria-label="Scroll right"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        )}
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
        <div className="stripe-sparkle-icon">
          <SparkIcon size={48} />
        </div>
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
            <div className="stripe-balance-value">{currentBalance.toFixed(2)}</div>
          </div>
        )}
        <div className="stripe-products-wrapper">{content}</div>
      </div>
      {loading && (
        <div className="stripe-loading-overlay">
          <div className="stripe-spinner"></div>
          <p>Processing...</p>
        </div>
      )}
    </>
  );
}

export default ProductList;
