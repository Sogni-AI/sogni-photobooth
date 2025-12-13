import React from 'react';
import { SogniClient } from '@sogni-ai/sogni-client';
import { getOrCreateAppId } from '../utils/appId';
import { tabSync } from './tabSync';

export interface SogniAuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: {
    username?: string;
    email?: string;
  } | null;
  authMode: 'frontend' | 'demo' | null;
  error: string | null;
  sessionTransferred?: boolean; // Flag for when session is transferred to new tab
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
    
    // Setup tab synchronization listener
    tabSync.onNewTabDetected((newTabDetected) => {
      if (newTabDetected && this.authState.isAuthenticated) {
        console.log('🔄 New authenticated tab detected, setting session transfer flag');
        // Just set the flag - don't change auth state
        this.setAuthState({
          sessionTransferred: true,
          error: 'Your Photobooth Session has been transferred to a new tab. Please refresh the browser to resume in this tab.'
        });
      }
    });
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

      // Create or reuse client to check for existing session
      const sogniUrls = this.getSogniUrls();
      const hostname = window.location.hostname;
      const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1';
      const isStaging = hostname.includes('staging');

      // If we already have a client, check if it's authenticated
      if (this.sogniClient) {
        const currentAccount = this.sogniClient.account.currentAccount;
        const isAlreadyAuthenticated = currentAccount?.isAuthenicated;
        
        console.log('🔐 Checking existing client auth state:', {
          isAuthenticated: isAlreadyAuthenticated,
          username: currentAccount?.username,
          hasToken: !!(currentAccount as any)?.token
        });

        if (isAlreadyAuthenticated) {
          // Client is already authenticated (e.g., just logged in or signed up)
          console.log('✅ Client already authenticated, updating auth state:', {
            username: currentAccount?.username,
            email: currentAccount?.email
          });
          
        this.setAuthState({
          isAuthenticated: true,
          authMode: 'frontend',
          user: {
            username: currentAccount?.username,
            email: currentAccount?.email
          },
          isLoading: false,
          error: null,
          sessionTransferred: false
        });

        // Notify other tabs about this authenticated session
        tabSync.notifyNewAuthenticatedTab();

        console.log('✅ Auth state updated, listeners notified');
        return true;
        }
      }

      // If we don't have a client or it's not authenticated, create/check one
      if (!this.sogniClient) {
        // Use persistent app ID for this browser installation
        const appId = getOrCreateAppId();
        
        this.sogniClient = await SogniClient.createInstance({
          appId,
          network: 'fast',
          restEndpoint: sogniUrls.rest,
          socketEndpoint: sogniUrls.socket,
          testnet: isLocalDev || isStaging,
          authType: 'cookies'  // Enable cookie-based authentication
        });
      }

      // Check for existing authentication using checkAuth
      console.log('🔐 Calling checkAuth to resume session...');
      const isAuthenticated = await this.sogniClient?.checkAuth().catch((error: any) => {
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
        currentAccount: this.sogniClient?.account?.currentAccount,
        hasToken: !!(this.sogniClient?.account?.currentAccount as any)?.token,
        hasRefreshToken: !!(this.sogniClient?.account?.currentAccount as any)?.refreshToken
      });


      if (isAuthenticated) {
        // We have a valid session, set up error handling
        if (this.sogniClient?.apiClient) {
          (this.sogniClient.apiClient as any).on('error', (error: any) => {
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
            username: this.sogniClient?.account?.currentAccount?.username,
            email: this.sogniClient?.account?.currentAccount?.email
          },
          isLoading: false,
          error: null,
          sessionTransferred: false
        });

        // Notify other tabs about this authenticated session
        tabSync.notifyNewAuthenticatedTab();

        console.log('✅ Existing Sogni session found and restored');
        return true;
      } else {
        // No existing session, but keep the client for login/signup
        this.setAuthState({
          isAuthenticated: false,
          authMode: null,
          user: null,
          isLoading: false,
          error: null,
          sessionTransferred: false
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
        error: error instanceof Error ? error.message : 'Failed to check existing session',
        sessionTransferred: false
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

      // Clear tab session when explicitly logging out
      tabSync.clearSession();

      this.setAuthState({
        isAuthenticated: false,
        authMode: null,
        user: null,
        isLoading: false,
        error: null,
        sessionTransferred: false
      });

      console.log('✅ Successfully logged out from Sogni');
      return true;

    } catch (error) {
      console.error('Logout failed:', error);
      
      // Force cleanup even on error
      this.sogniClient = null;
      tabSync.clearSession();
      
      this.setAuthState({
        isAuthenticated: false,
        authMode: null,
        user: null,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Logout failed',
        sessionTransferred: false
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
        error: null,
        sessionTransferred: false
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
        error: error instanceof Error ? error.message : 'Failed to switch to demo mode',
        sessionTransferred: false
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

  // Ensure client is initialized (create if needed)
  async ensureClient(): Promise<SogniClient> {
    if (this.sogniClient) {
      return this.sogniClient;
    }

    // Create a new client if one doesn't exist
    const sogniUrls = this.getSogniUrls();
    const hostname = window.location.hostname;
    const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1';
    const isStaging = hostname.includes('staging');

    // Use persistent app ID for this browser installation
    const appId = getOrCreateAppId();

    this.sogniClient = await SogniClient.createInstance({
      appId,
      network: 'fast',
      restEndpoint: sogniUrls.rest,
      socketEndpoint: sogniUrls.socket,
      testnet: isLocalDev || isStaging,
      authType: 'cookies'
    });

    if (!this.sogniClient) {
      throw new Error('Failed to create Sogni client');
    }

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

  // Directly set authenticated state after successful login/signup
  setAuthenticatedState(username: string, email?: string): void {
    if (!this.sogniClient) {
      console.error('Cannot set authenticated state: no client available');
      return;
    }
    
    this.setAuthState({
      isAuthenticated: true,
      authMode: 'frontend',
      user: {
        username,
        email
      },
      isLoading: false,
      error: null,
      sessionTransferred: false
    });

    // Notify other tabs about this authenticated session
    tabSync.notifyNewAuthenticatedTab();

    console.log('✅ Auth state set to authenticated');
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
    getSogniClient: sogniAuth.getSogniClient.bind(sogniAuth),
    ensureClient: sogniAuth.ensureClient.bind(sogniAuth),
    setAuthenticatedState: sogniAuth.setAuthenticatedState.bind(sogniAuth),
    waitForInitialization: sogniAuth.waitForInitialization.bind(sogniAuth)
  };
}
