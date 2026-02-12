import { SogniClient, TokenType } from '@sogni-ai/sogni-client';

export interface ProductResponse {
  status: string;
  data: {
    products: ProductRaw[];
  };
}

export interface ProductRaw {
  id: string;
  object: string;
  active: boolean;
  billing_scheme: string;
  created: number;
  currency: string;
  custom_unit_amount: null;
  livemode: boolean;
  lookup_key: null;
  metadata: Metadata;
  nickname: string;
  product: string;
  recurring: null;
  tax_behavior: string;
  tiers_mode: null;
  transform_quantity: null;
  type: string;
  unit_amount: number;
  unit_amount_decimal: string;
}

export interface Metadata {
  localDescription: string;
  sparkValue: string;
}

export interface Product {
  id: string;
  name: string;
  fullName: string;
  description: string;
  price: number;
  discount: number;
  isDefault: boolean;
}

const nameFormatter = new Intl.NumberFormat('en-US', {
  style: 'decimal',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1
});

export async function getStripeProducts(api: SogniClient): Promise<Product[]> {
  const response = await api.apiClient.rest.get<ProductResponse>('/v1/iap/stripe/products');
  const maxTokenPrice = response.data.products.reduce((current, p) => {
    const tokenAmount = Number(p.metadata.sparkValue);
    const tokenPrice = p.unit_amount / tokenAmount;
    return Math.max(current, tokenPrice);
  }, 0);
  response.data.products.sort((a, b) => {
    return a.unit_amount - b.unit_amount;
  });
  return response.data.products.map((p): Product => {
    const tokenAmount = Number(p.metadata.sparkValue);
    const tokenPrice = p.unit_amount / tokenAmount;
    const discount = Math.round(((maxTokenPrice - tokenPrice) / maxTokenPrice) * 100);
    const name =
      tokenAmount < 1000 ? tokenAmount.toString() : `${nameFormatter.format(tokenAmount / 1000)}K`;
    return {
      id: p.product,
      name: name,
      fullName: p.nickname,
      description: p.metadata.localDescription,
      price: p.unit_amount / 100,
      discount: discount,
      isDefault: tokenAmount === 2000
    };
  });
}

interface PurchaseResponse {
  status: 'success';
  data: Purchase;
}

export interface Purchase {
  message: string;
  url: string;
  purchaseId: string;
}

export interface PurchaseIntent extends Purchase {
  productId: string;
}

export async function startPurchase(api: SogniClient, productId: string): Promise<PurchaseIntent> {
  const response = await api.apiClient.rest.post<PurchaseResponse>('/v1/iap/stripe/purchase', {
    productId,
    redirectType: 'photobooth',
    appSource: 'sogni-photobooth'
  });
  return { ...response.data, productId };
}

export interface PurchaseStatusResponse {
  status: 'success';
  data: PurchaseStatus;
}

export interface PurchaseStatus {
  _id: string;
  productId: string;
  transactionId: string;
  purchaseTime: number;
  status: 'initiated' | 'processing' | 'completed' | string;
  amountInDollars: number;
  amountInTokens: number;
  tokenType: TokenType;
}

export async function getPurchase(api: SogniClient, purchaseId: string) {
  const response = await api.apiClient.rest.get<PurchaseStatusResponse>(
    `/v1/iap/status/${purchaseId}`
  );
  return response.data;
}

export function formatUSD(value: number): string {
  return new Intl.NumberFormat(navigator.language, {
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'symbol',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2
  }).format(value);
}
