import { createContext, useContext } from 'react';
import { SogniClient } from '@sogni-ai/sogni-client';

const ApiContext = createContext<SogniClient | undefined>(undefined);

export const ApiProvider = ApiContext.Provider;

export function useSogniApi() {
  const api = useContext(ApiContext);
  if (!api) {
    throw new Error('useSogniApi must be used within a ApiProvider');
  }
  return api;
}

export default useSogniApi;


