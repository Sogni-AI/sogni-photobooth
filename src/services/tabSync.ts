/**
 * Tab Synchronization Service
 * 
 * Manages multi-tab sessions to ensure only one active tab per logged-in user.
 * When a user opens a new tab, previous tabs will be cosmetically logged out
 * with an error message.
 */

export interface TabSession {
  tabId: string;
  timestamp: number;
  isAuthenticated: boolean;
}

class TabSyncManager {
  private tabId: string;
  private broadcastChannel: BroadcastChannel | null = null;
  private storageKey = 'sogni_active_tab_session';
  private listeners: ((newTabDetected: boolean) => void)[] = [];
  
  constructor() {
    // Generate unique tab ID
    this.tabId = `tab_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    
    // Try to use BroadcastChannel API (modern browsers)
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('sogni_tab_sync');
        this.setupBroadcastChannelListeners();
      } catch (error) {
        console.warn('BroadcastChannel not available, falling back to localStorage');
        this.setupStorageListeners();
      }
    } else {
      // Fallback to localStorage events for older browsers
      this.setupStorageListeners();
    }
    
    // Cleanup on page unload
    window.addEventListener('beforeunload', () => {
      this.cleanup();
    });
    
    console.log(`🆔 Tab initialized with ID: ${this.tabId}`);
  }
  
  private setupBroadcastChannelListeners(): void {
    if (!this.broadcastChannel) return;
    
    this.broadcastChannel.addEventListener('message', (event) => {
      const { type, tabId } = event.data;
      
      // Ignore messages from this tab
      if (tabId === this.tabId) return;
      
      if (type === 'NEW_TAB_AUTHENTICATED') {
        console.log(`🚨 New authenticated tab detected (ID: ${tabId}), current tab will be logged out cosmetically`);
        this.notifyListeners(true);
      }
    });
  }
  
  private setupStorageListeners(): void {
    window.addEventListener('storage', (event) => {
      // Only respond to changes in our storage key
      if (event.key !== this.storageKey) return;
      
      if (event.newValue) {
        try {
          const session: TabSession = JSON.parse(event.newValue);
          
          // Ignore if this is our own tab
          if (session.tabId === this.tabId) return;
          
          // If a new authenticated tab appeared, notify listeners
          if (session.isAuthenticated) {
            console.log(`🚨 New authenticated tab detected via localStorage (ID: ${session.tabId})`);
            this.notifyListeners(true);
          }
        } catch (error) {
          console.error('Failed to parse tab session from localStorage:', error);
        }
      }
    });
  }
  
  /**
   * Notify other tabs that this tab is now the active authenticated session
   */
  notifyNewAuthenticatedTab(): void {
    const session: TabSession = {
      tabId: this.tabId,
      timestamp: Date.now(),
      isAuthenticated: true
    };
    
    // Broadcast via BroadcastChannel if available
    if (this.broadcastChannel) {
      this.broadcastChannel.postMessage({
        type: 'NEW_TAB_AUTHENTICATED',
        tabId: this.tabId,
        timestamp: session.timestamp
      });
    }
    
    // Also update localStorage for fallback compatibility
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(session));
    } catch (error) {
      console.warn('Failed to update localStorage for tab sync:', error);
    }
    
    console.log(`📢 Notified other tabs about new authenticated session (Tab ID: ${this.tabId})`);
  }
  
  /**
   * Clear this tab's session (on logout or cleanup)
   */
  clearSession(): void {
    try {
      const currentSession = localStorage.getItem(this.storageKey);
      if (currentSession) {
        const session: TabSession = JSON.parse(currentSession);
        
        // Only clear if this is our session
        if (session.tabId === this.tabId) {
          localStorage.removeItem(this.storageKey);
        }
      }
    } catch (error) {
      console.warn('Failed to clear tab session:', error);
    }
  }
  
  /**
   * Register a listener for new tab detection
   */
  onNewTabDetected(callback: (newTabDetected: boolean) => void): () => void {
    this.listeners.push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }
  
  private notifyListeners(newTabDetected: boolean): void {
    this.listeners.forEach(listener => {
      try {
        listener(newTabDetected);
      } catch (error) {
        console.error('Error in tab sync listener:', error);
      }
    });
  }
  
  private cleanup(): void {
    this.clearSession();
    
    if (this.broadcastChannel) {
      this.broadcastChannel.close();
    }
  }
  
  getTabId(): string {
    return this.tabId;
  }
}

// Export singleton instance
export const tabSync = new TabSyncManager();

