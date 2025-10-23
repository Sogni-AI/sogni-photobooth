import { SogniClient, TokenType } from '@sogni-ai/sogni-client';

export interface ProductResponse {
  status: string;
  data: {
    products: Product[];
  };
}

export interface Product {
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

export async function getStripeProducts(api: SogniClient) {
  // Call Sogni API directly (same as sogni-web)
  const response = await api.apiClient.rest.get<ProductResponse>('/v1/iap/stripe/products');
  return response.data.products;
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
  // Call Sogni API directly (same as sogni-web)
  const response = await api.apiClient.rest.post<PurchaseResponse>('/v1/iap/stripe/purchase', {
    productId,
    redirectType: 'photobooth'
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
  // Call Sogni API directly (same as sogni-web)
  const response = await api.apiClient.rest.get<PurchaseStatusResponse>(
    `/v1/iap/status/${purchaseId}`
  );
  return response.data;
}

