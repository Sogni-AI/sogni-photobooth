declare module '@sogni-ai/sogni-client' {
  export class SogniClient {
    constructor(config: any);
    static createInstance(config: any): SogniClient;
    checkAuth(): Promise<boolean>;
    projects: any;
    account: any;
    apiClient: {
      rest: {
        get: <T = any>(url: string, config?: any) => Promise<T>;
        post: <T = any>(url: string, data?: any, config?: any) => Promise<T>;
        put: <T = any>(url: string, data?: any, config?: any) => Promise<T>;
        delete: <T = any>(url: string, config?: any) => Promise<T>;
      };
      on?: (event: string, handler: (error: any) => void) => void;
      off?: (event: string, handler: (error: any) => void) => void;
    };
  }

  export class ApiError extends Error {
    code?: number;
    statusCode?: number;
  }

  export type TokenType = string;
  
  export function estimateCost<T = any>(sogniClient: any, params: any): Promise<T>;
}

declare module '@sogni-ai/sogni-client/dist/lib/DataEntity' {
  export default class DataEntity<T = any, E = any> {
    data: T;
    on(event: string, listener: (...args: any[]) => void): void;
    off(event: string, listener: (...args: any[]) => void): void;
    emit(event: string, ...args: any[]): void;
  }
}

