import { Product, formatUSD } from '../../services/stripe';
import '../../styles/stripe/ProductList.css';
import { Swiper, SwiperClass, SwiperSlide } from 'swiper/react';
import { Mousewheel } from 'swiper/modules';
import { useEffect, useMemo, useState } from 'react';
import 'swiper/css';

const SparkPointIcon = ({ size = 17 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 17 16" width={size} height={size} fill="currentColor">
    <path d="M9.92301 1.1764C10.6242 0.251095 12.0169 0.251096 12.0445 1.1764L12.1576 4.97111C12.1663 5.26202 12.3269 5.49138 12.5973 5.59903L16.1244 7.0032C16.9845 7.34559 16.5082 8.65433 15.3989 8.99672L10.8495 10.4009C10.5008 10.5085 10.1732 10.7379 9.95276 11.0288L7.07732 14.8235C6.37616 15.7488 4.98344 15.7488 4.95585 14.8235L4.84273 11.0288C4.83406 10.7379 4.67346 10.5085 4.40305 10.4009L0.875887 8.99672C0.015819 8.65433 0.492163 7.34559 1.60147 7.0032L6.15079 5.59903C6.49955 5.49138 6.82712 5.26202 7.04756 4.97111L9.92301 1.1764Z" />
  </svg>
);

const Sparkle2Icon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width={size} height={size} fill="currentColor">
    <path d="M5.9 10.938a1.103 1.103 0 0 0-.176-1.107L3.5 7.134a.276.276 0 0 1 .312-.43L7.063 7.99a1.103 1.103 0 0 0 1.107-.175l2.697-2.224a.276.276 0 0 1 .43.312l-1.285 3.251a1.103 1.103 0 0 0 .175 1.107l2.225 2.697a.276.276 0 0 1-.313.43l-3.251-1.285a1.104 1.104 0 0 0-1.107.175L5.044 14.5a.275.275 0 0 1-.43-.312L5.9 10.938Z" />
    <path d="M5.215 3.777a.444.444 0 0 0-.117-.435l-1.003-.985a.11.11 0 0 1 .106-.185l1.355.377a.444.444 0 0 0 .435-.117l.985-1.003a.111.111 0 0 1 .185.107L6.784 2.89a.444.444 0 0 0 .116.435l1.004.985a.11.11 0 0 1-.107.185l-1.354-.377a.444.444 0 0 0-.436.117l-.984 1.003a.11.11 0 0 1-.185-.107l.377-1.354ZM10.449 2.644a.31.31 0 0 0-.082-.305l-.702-.689a.078.078 0 0 1 .074-.13l.948.264a.31.31 0 0 0 .305-.082l.69-.702a.078.078 0 0 1 .129.075l-.264.948a.31.31 0 0 0 .082.305l.702.689a.078.078 0 0 1-.075.13l-.948-.264a.31.31 0 0 0-.304.081l-.69.702a.077.077 0 0 1-.13-.074l.265-.948Z" />
  </svg>
);

const ChequeredFlagIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width={size} height={size} fill="currentColor">
    <path d="M3.09668 1.66495C4.39689 1.62726 5.61206 1.73985 6.54883 1.99015C7.48956 2.24242 8.79805 2.34942 10.1406 2.28214C11.2962 2.22494 12.4121 2.04606 13.2812 1.77628C13.4539 1.72215 13.6355 1.74198 13.79 1.82999L13.8545 1.87101C14.0198 1.99211 14.1181 2.18711 14.1182 2.39151L14.1191 9.46476C14.119 9.74248 13.9435 9.98798 13.6836 10.0761C12.7308 10.401 11.4833 10.615 10.1719 10.6796C9.89377 10.693 9.61835 10.7001 9.34766 10.7001C8.23208 10.7001 7.20006 10.5844 6.38086 10.3651C5.51238 10.1323 4.32994 10.0254 3.09668 10.0624V14.8974H2.33984L2.34082 1.66495H3.09668ZM3.0957 2.30753V4.73331C3.99729 4.70708 4.89928 4.75117 5.68945 4.8837V7.14444C4.89933 7.01191 3.9973 6.96848 3.0957 6.99405V9.41202C3.25915 9.40798 3.42099 9.40616 3.58105 9.40616C4.33603 9.40616 5.05125 9.45918 5.68945 9.56143V7.14542C5.96156 7.18712 6.22081 7.24296 6.46387 7.30753C6.99885 7.44949 7.622 7.54229 8.2832 7.59073V10.0116C8.87143 10.0554 9.50172 10.0654 10.1406 10.0331L10.1396 10.0302C10.3889 10.0181 10.6342 9.99837 10.876 9.9755V7.56632C10.6512 7.58782 10.4208 7.60478 10.1934 7.6171C9.56626 7.64962 8.93691 7.64199 8.33594 7.59659V5.32022C8.93696 5.36562 9.56694 5.37228 10.1934 5.33976C10.4211 5.32741 10.6519 5.3115 10.877 5.28995V2.87393C10.6446 2.89547 10.4089 2.91328 10.1719 2.92472C9.51618 2.95632 8.88011 2.94951 8.2832 2.90714V5.32901C7.62191 5.28058 6.99878 5.1868 6.46387 5.04483C6.22085 4.98029 5.96147 4.92539 5.68945 4.8837V2.46378C4.92908 2.33394 4.02699 2.2786 3.0957 2.30753ZM13.4717 4.79581C12.7279 5.03811 11.8305 5.20367 10.9062 5.2919V7.55265C11.8316 7.46505 12.7284 7.2978 13.4727 7.05558L13.4717 4.79581Z" />
  </svg>
);

const BoxIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5" />
    <path d="M12 22V12" />
  </svg>
);

const TrophyIcon = ({ size = 16 }: { size?: number }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
    <path d="M4 22h16" />
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22" />
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22" />
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z" />
  </svg>
);

interface Props {
  loading: boolean;
  products: Product[] | null;
  onPurchase: (productId: string) => void;
}

function ProductList({ loading, products, onPurchase }: Props) {
  const initialSlide = useMemo(() => {
    return products?.findIndex((p) => p.isDefault) || 1;
  }, [products]);
  const [swiper, setSwiper] = useState<SwiperClass | null>(null);
  const [activeIndex, setActiveIndex] = useState<number>(initialSlide);

  const activeProduct = products?.[activeIndex] || null;

  useEffect(() => {
    if (swiper && swiper.activeIndex !== initialSlide) {
      swiper.slideTo(initialSlide);
    }
  }, [initialSlide, swiper]);

  useEffect(() => {
    if (!swiper) return;
    const handler = (s: SwiperClass) => {
      setActiveIndex(s.activeIndex);
    };
    setActiveIndex(swiper.activeIndex);
    swiper.on('slideChange', handler);
    return () => {
      swiper.off('slideChange', handler);
    };
  }, [swiper]);

  let content;
  if (products) {
    content = products.map((product, index) => (
      <SwiperSlide
        key={product.id}
        className={`stripe-product-slide ${index === activeIndex ? 'stripe-product-active' : ''}`}
      >
        <div className="stripe-slide-header">
          <h3>
            {product.name} <SparkPointIcon size={14} />
          </h3>
          {product.isDefault && <div className="stripe-most-popular">Most popular</div>}
        </div>
        <p>{product.description}</p>
        <div className="stripe-slide-footer">
          <div className="stripe-slide-price">{formatUSD(product.price)}</div>
          {product.discount > 0 && <div className="stripe-discount-badge">Save {product.discount}%</div>}
        </div>
      </SwiperSlide>
    ));
  } else {
    content = [0, 1, 2].map((i) => (
      <SwiperSlide key={i} className="stripe-product-slide stripe-product-placeholder">
        <div className="stripe-spinner"></div>
      </SwiperSlide>
    ));
  }

  return (
    <>
      <div className="stripe-header">
        <div className="stripe-spark-label">
          <SparkPointIcon size={18} />
          Premium Spark
        </div>
        <h2>Supercharge Your Creativity</h2>
      </div>
      <div className="stripe-slider-container">
        <Swiper
          key={content.length}
          className="stripe-product-slider"
          centeredSlides
          slidesPerView="auto"
          spaceBetween={16}
          slideToClickedSlide
          initialSlide={initialSlide}
          onSwiper={setSwiper}
          modules={[Mousewheel]}
          mousewheel={{ forceToAxis: true }}
        >
          {content}
        </Swiper>
      </div>
      <div className="stripe-content">
        <ul className="stripe-perks">
          <li>
            <span className="stripe-perk-icons">
              <ChequeredFlagIcon size={16} />
              <Sparkle2Icon size={16} />
            </span>
            Instant queue priority.
          </li>
          <li>
            <BoxIcon size={16} /> Exclusive features & models.
          </li>
          <li>
            <TrophyIcon size={16} />
            10x boost on the artist leaderboard.
          </li>
        </ul>
        <p className="stripe-cta-description">
          Premium Spark Points unlock ultra-fast, high-quality image creation powered by the
          Supernet. They never expire, aren&apos;t transferable, and are always ready when inspiration
          strikes.
        </p>
        <button
          className="stripe-cta-button"
          disabled={!activeProduct || loading}
          onClick={() => activeProduct && onPurchase(activeProduct.id)}
        >
          {activeProduct
            ? `Get ${activeProduct.name} Premium Spark for ${formatUSD(activeProduct.price)}`
            : 'Fetching Spark Point packages...'}
        </button>
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
