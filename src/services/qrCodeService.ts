/**
 * QR Code generation and caching service
 */
import QRCode from 'qrcode';

interface QRCodeCacheEntry {
  dataUrl: string;
  timestamp: number;
}

class QRCodeService {
  private cache: Map<string, QRCodeCacheEntry> = new Map();
  private readonly CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  
  /**
   * Generates a QR code for the given URL with caching
   * @param url - The URL to encode in the QR code
   * @param options - QR code generation options
   * @returns Promise that resolves to the QR code data URL
   */
  async generateQRCode(
    url: string, 
    options: {
      width?: number;
      margin?: number;
      color?: {
        dark?: string;
        light?: string;
      };
    } = {}
  ): Promise<string> {
    // Create cache key based on URL and options
    const cacheKey = this.createCacheKey(url, options);
    
    // Check if we have a valid cached entry
    const cached = this.getCachedQRCode(cacheKey);
    if (cached) {
      console.log('🔄 Using cached QR code for URL:', url);
      return cached;
    }
    
    console.log('🆕 Generating new QR code for URL:', url);
    
    // Set default options
    const qrOptions = {
      width: options.width || 300,
      margin: options.margin || 2,
      color: {
        dark: options.color?.dark || '#000000',
        light: options.color?.light || '#FFFFFF'
      }
    };
    
    try {
      // Generate QR code
      const dataUrl = await QRCode.toDataURL(url, qrOptions);
      
      // Cache the result
      this.cacheQRCode(cacheKey, dataUrl);
      
      return dataUrl;
    } catch (error) {
      console.error('Error generating QR code:', error);
      throw new Error(`Failed to generate QR code: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Creates a cache key based on URL and options
   */
  private createCacheKey(url: string, options: any): string {
    const optionsStr = JSON.stringify(options);
    return `${url}|${optionsStr}`;
  }
  
  /**
   * Gets a cached QR code if it exists and is not expired
   */
  private getCachedQRCode(cacheKey: string): string | null {
    const entry = this.cache.get(cacheKey);
    
    if (!entry) {
      return null;
    }
    
    // Check if cache entry is expired
    const now = Date.now();
    if (now - entry.timestamp > this.CACHE_EXPIRY) {
      this.cache.delete(cacheKey);
      return null;
    }
    
    return entry.dataUrl;
  }
  
  /**
   * Caches a QR code data URL
   */
  private cacheQRCode(cacheKey: string, dataUrl: string): void {
    this.cache.set(cacheKey, {
      dataUrl,
      timestamp: Date.now()
    });
    
    // Clean up expired entries periodically
    this.cleanupExpiredEntries();
  }
  
  /**
   * Removes expired entries from the cache
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.CACHE_EXPIRY) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.cache.delete(key));
    
    if (keysToDelete.length > 0) {
      console.log(`🧹 Cleaned up ${keysToDelete.length} expired QR code cache entries`);
    }
  }
  
  /**
   * Clears all cached QR codes
   */
  clearCache(): void {
    this.cache.clear();
    console.log('🗑️ QR code cache cleared');
  }
  
  /**
   * Gets cache statistics
   */
  getCacheStats(): { size: number; entries: Array<{ url: string; timestamp: number }> } {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      url: key.split('|')[0], // Extract URL from cache key
      timestamp: entry.timestamp
    }));
    
    return {
      size: this.cache.size,
      entries
    };
  }
}

// Export singleton instance
export const qrCodeService = new QRCodeService();
export default qrCodeService;
