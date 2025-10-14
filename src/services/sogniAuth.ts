import React from 'react';
import { SogniClient } from '@sogni-ai/sogni-client';

export interface SogniAuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: {
    username?: string;
    email?: string;
  } | null;
  authMode: 'frontend' | 'demo' | null;
  error: string | null;
}

export interface SogniAuthService {
  getAuthState(): SogniAuthState;
  logout(): Promise<boolean>;
  switchToDemoMode(): Promise<boolean>;
  checkExistingSession(): Promise<boolean>;
  onAuthStateChange(callback: (state: SogniAuthState) => void): () => void;
  getSogniClient(): SogniClient | null;
}

class SogniAuthManager implements SogniAuthService {
  private authState: SogniAuthState = {
    isAuthenticated: false,
    isLoading: false,
    user: null,
    authMode: null,
    error: null
  };

  private sogniClient: SogniClient | null = null;
  private authStateListeners: ((state: SogniAuthState) => void)[] = [];
  private initializationPromise: Promise<void> | null = null;

  constructor() {
    // Initialize on construction
    this.initializationPromise = this.initialize();
  }

  private async initialize(): Promise<void> {
    try {
      this.setAuthState({ isLoading: true, error: null });
      
      // Check for existing session first
      await this.checkExistingSession();
    } catch (error) {
      console.error('Failed to initialize auth manager:', error);
      this.setAuthState({ 
        error: error instanceof Error ? error.message : 'Failed to initialize authentication',
        isLoading: false 
      });
    }
  }

  private setAuthState(updates: Partial<SogniAuthState>): void {
    this.authState = { ...this.authState, ...updates };
    this.notifyListeners();
  }

  private notifyListeners(): void {
    this.authStateListeners.forEach(listener => listener(this.authState));
  }

  private getSogniUrls() {
    // Use the same URL configuration as the backend
    // In browser context, we need to check the current hostname to determine environment
    const hostname = window.location.hostname;
    
    // Only treat localhost and 127.0.0.1 as local development
    const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1';
    const isStaging = hostname.includes('staging');
    
    if (isLocalDev) {
      return {
        rest: 'https://api-local.sogni.ai',
        socket: 'wss://socket-local.sogni.ai'
      };
    } else if (isStaging) {
      return {
        rest: 'https://api-staging.sogni.ai',
        socket: 'wss://socket-staging.sogni.ai'
      };
    }
    
    // All sogni.ai subdomains (including photobooth-local.sogni.ai) use production APIs
    return {
      rest: 'https://api.sogni.ai',
      socket: 'wss://socket.sogni.ai'
    };
  }

  async checkExistingSession(): Promise<boolean> {
    try {
      this.setAuthState({ isLoading: true, error: null });


      // Create a temporary client to check for existing session
      const sogniUrls = this.getSogniUrls();
      const hostname = window.location.hostname;
      const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1';
      const isStaging = hostname.includes('staging');
      
      const tempClient = await SogniClient.createInstance({
        appId: `photobooth-auth-check-${Date.now()}`,
        network: 'fast',
        restEndpoint: sogniUrls.rest,
        socketEndpoint: sogniUrls.socket,
        testnet: isLocalDev || isStaging,
        authType: 'cookies'  // Enable cookie-based authentication
      });

      // Check for existing authentication using checkAuth (like dashboard does)
      console.log('🔐 Calling checkAuth to resume session...');
      const isAuthenticated = await tempClient.checkAuth().catch((error) => {
        console.log('🔐 checkAuth failed:', error);
        
        // Check for email verification error during auth check
        if (error && typeof error === 'object' && 
            (error.code === 4052 || (error.message && error.message.includes('verify your email')))) {
          console.error('❌ Email verification required during checkAuth');
          
          // Set error state immediately
          this.setAuthState({
            isAuthenticated: false,
            authMode: null,
            user: null,
            isLoading: false,
            error: 'Email verification required. Please verify your email at app.sogni.ai and try again.'
          });
          
          // Also emit the custom event for the App to handle
          window.dispatchEvent(new CustomEvent('sogni-email-verification-required', {
            detail: {
              error,
              message: 'Your Sogni account email needs to be verified to generate images.'
            }
          }));
        }
        
        return false;
      });
      
      console.log('🔐 Session check results:', {
        hostname,
        isLocalDev,
        isStaging,
        sogniUrls,
        isAuthenticated,
        currentAccount: tempClient.account.currentAccount,
        hasToken: !!(tempClient.account.currentAccount as any)?.token,
        hasRefreshToken: !!(tempClient.account.currentAccount as any)?.refreshToken
      });
      
      
      if (isAuthenticated) {
        // We have a valid session, use this client
        this.sogniClient = tempClient;
        
        // Set up error handling for email verification and other socket errors
        if (tempClient.apiClient) {
          (tempClient.apiClient as any).on('error', (error: any) => {
            console.error('Frontend client socket error:', error);
            
            // Check for email verification error (code 4052)
            if (error && typeof error === 'object' && 
                (error.code === 4052 || (error.reason && error.reason.includes('verify your email')))) {
              console.error('❌ Email verification required from frontend client');
              
              // Emit a custom event that the App can listen to
              window.dispatchEvent(new CustomEvent('sogni-email-verification-required', {
                detail: {
                  error,
                  message: 'Your Sogni account email needs to be verified to generate images.'
                }
              }));
            }
          });
        }
        
        this.setAuthState({
          isAuthenticated: true,
          authMode: 'frontend',
          user: {
            username: tempClient.account.currentAccount?.username,
            email: tempClient.account.currentAccount?.email
          },
          isLoading: false,
          error: null
        });
        
        console.log('✅ Existing Sogni session found and restored');
        return true;
      } else {
        // No existing session, clean up temp client
        if ((tempClient as any).disconnect) {
          await (tempClient as any).disconnect();
        }
        this.setAuthState({
          isAuthenticated: false,
          authMode: null,
          user: null,
          isLoading: false,
          error: null
        });
        
        console.log('ℹ️ No existing Sogni session found');
        return false;
      }
    } catch (error) {
      console.error('Error checking existing session:', error);
      this.setAuthState({
        isAuthenticated: false,
        authMode: null,
        user: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to check existing session'
      });
      return false;
    }
  }


  async logout(): Promise<boolean> {
    try {
      this.setAuthState({ isLoading: true, error: null });

      if (this.sogniClient) {
        // Use the new synchronous logout for cookie auth
        await this.sogniClient.account.logout();
        if ((this.sogniClient as any).disconnect) {
          await (this.sogniClient as any).disconnect();
        }
        this.sogniClient = null;
      }

      this.setAuthState({
        isAuthenticated: false,
        authMode: null,
        user: null,
        isLoading: false,
        error: null
      });

      console.log('✅ Successfully logged out from Sogni');
      return true;

    } catch (error) {
      console.error('Logout failed:', error);
      
      // Force cleanup even on error
      this.sogniClient = null;
      this.setAuthState({
        isAuthenticated: false,
        authMode: null,
        user: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Logout failed'
      });
      
      return false;
    }
  }

  async switchToDemoMode(): Promise<boolean> {
    try {
      this.setAuthState({ isLoading: true, error: null });

      // Clean up any existing frontend client
      if (this.sogniClient) {
        if ((this.sogniClient as any).disconnect) {
          await (this.sogniClient as any).disconnect();
        }
        this.sogniClient = null;
      }

      // Set demo mode state (backend will handle the actual authentication)
      this.setAuthState({
        isAuthenticated: true,
        authMode: 'demo',
        user: null, // Demo mode doesn't have user info
        isLoading: false,
        error: null
      });

      console.log('✅ Switched to demo mode');
      return true;

    } catch (error) {
      console.error('Failed to switch to demo mode:', error);
      this.setAuthState({
        isAuthenticated: false,
        authMode: null,
        user: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to switch to demo mode'
      });
      
      return false;
    }
  }

  getAuthState(): SogniAuthState {
    return { ...this.authState };
  }

  getSogniClient(): SogniClient | null {
    return this.sogniClient;
  }

  onAuthStateChange(callback: (state: SogniAuthState) => void): () => void {
    this.authStateListeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.authStateListeners.indexOf(callback);
      if (index > -1) {
        this.authStateListeners.splice(index, 1);
      }
    };
  }

  // Ensure initialization is complete before using the service
  async waitForInitialization(): Promise<void> {
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
  }
}

// Export singleton instance
export const sogniAuth = new SogniAuthManager();

// Export hook for React components
export function useSogniAuth() {
  const [authState, setAuthState] = React.useState<SogniAuthState>(sogniAuth.getAuthState());

  React.useEffect(() => {
    // Wait for initialization and then subscribe to changes
    sogniAuth.waitForInitialization().then(() => {
      setAuthState(sogniAuth.getAuthState());
    });

    const unsubscribe = sogniAuth.onAuthStateChange(setAuthState);
    return unsubscribe;
  }, []);

  return {
    ...authState,
    logout: sogniAuth.logout.bind(sogniAuth),
    switchToDemoMode: sogniAuth.switchToDemoMode.bind(sogniAuth),
    checkExistingSession: sogniAuth.checkExistingSession.bind(sogniAuth),
    getSogniClient: sogniAuth.getSogniClient.bind(sogniAuth)
  };
}
