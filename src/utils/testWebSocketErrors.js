/**
 * Test utility for WebSocket error handling
 * 
 * This utility provides functions to simulate various WebSocket errors
 * for testing the toast notification system.
 * 
 * Usage in browser console:
 * - window.testWebSocketErrors.simulateEmailVerificationError()
 * - window.testWebSocketErrors.simulateConnectionSwitched()
 * - window.testWebSocketErrors.simulateNetworkError()
 * - window.testWebSocketErrors.simulateToastMessage()
 */

import { handleSpecificErrors } from './websocketErrorHandler';

class WebSocketErrorTester {
  constructor() {
    this.showToast = null;
  }

  // Initialize with the toast function from context
  init(showToastFunction) {
    this.showToast = showToastFunction;
  }

  // Quick test function for immediate use
  quickTest() {
    if (!this.showToast) {
      return;
    }

    this.showToast({
      title: 'Quick Test',
      message: 'This is a quick test of the toast system!',
      type: 'success',
      timeout: 3000
    });
  }

  // Simulate email verification error (code 4052)
  simulateEmailVerificationError() {
    if (!this.showToast) {
      return;
    }

    handleSpecificErrors.emailVerification(this.showToast);
  }

  // Simulate connection switched error (code 4015)
  simulateConnectionSwitched() {
    if (!this.showToast) {
      return;
    }

    handleSpecificErrors.connectionSwitched(this.showToast);
  }

  // Simulate network error
  simulateNetworkError() {
    if (!this.showToast) {
      return;
    }

    handleSpecificErrors.networkError(this.showToast);
  }

  // Simulate insufficient credits error
  simulateInsufficientCredits() {
    if (!this.showToast) {
      return;
    }

    handleSpecificErrors.insufficientCredits(this.showToast);
  }

  // Simulate internal error (code 4007) that should cancel batch
  simulateInternalError() {
    if (!this.showToast) {
      return;
    }

    this.showToast({
      title: 'Processing Failed',
      message: 'Image generation failed due to an internal error. Your batch has been cancelled.',
      type: 'error',
      timeout: 8000
    });
  }

  // Simulate project failure (this tests the actual project failure path)
  simulateProjectFailure() {
    if (!this.showToast) {
      return;
    }

    // This simulates what happens when a project fails with code 4007
    console.log('🧪 Simulating project failure with code 4007...');
    
    // Note: This only shows the toast - actual batch cancellation happens in the project.on('failed') handler
    this.showToast({
      title: 'Processing Failed',
      message: 'Image generation failed due to an internal error. Your batch has been cancelled.',
      type: 'error',
      timeout: 8000
    });
  }

  // Simulate a server toast message
  simulateToastMessage(type = 'info', title = 'Test Message', message = 'This is a test toast message from the server') {
    if (!this.showToast) {
      return;
    }

    this.showToast({
      title,
      message,
      type,
      timeout: 5000
    });
  }

  // Test all error types in sequence
  testAllErrors() {
    if (!this.showToast) {
      return;
    }
    
    // Test different error types with delays
    setTimeout(() => this.simulateEmailVerificationError(), 500);
    setTimeout(() => this.simulateConnectionSwitched(), 2000);
    setTimeout(() => this.simulateNetworkError(), 4000);
    setTimeout(() => this.simulateInsufficientCredits(), 6000);
    setTimeout(() => this.simulateToastMessage('success', 'Test Complete', 'All error types have been tested!'), 8000);
  }

  // Show help information
  help() {
    console.log(`
🧪 WebSocket Error Tester Help
==============================

Available methods:
- quickTest() - Quick test to verify toast system is working
- simulateEmailVerificationError() - Test email verification required error
- simulateConnectionSwitched() - Test connection switched error (code 4015)
- simulateNetworkError() - Test network connection error
- simulateInsufficientCredits() - Test insufficient credits error
- simulateInternalError() - Test internal error (code 4007) that cancels batch
- simulateProjectFailure() - Test project failure with code 4007
- simulateToastMessage(type, title, message) - Test custom toast message
- testAllErrors() - Test all error types in sequence
- help() - Show this help message

Example usage:
window.testWebSocketErrors.quickTest();
window.testWebSocketErrors.simulateEmailVerificationError();
window.testWebSocketErrors.simulateToastMessage('warning', 'Custom Warning', 'This is a custom warning message');
window.testWebSocketErrors.testAllErrors();
    `);
  }
}

// Create a singleton instance
const webSocketErrorTester = new WebSocketErrorTester();

// Make it available globally for testing
if (typeof window !== 'undefined') {
  window.testWebSocketErrors = webSocketErrorTester;
}

export default webSocketErrorTester;
