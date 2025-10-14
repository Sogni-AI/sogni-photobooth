/**
 * WebSocket Error Handler Utility
 * 
 * This utility sets up WebSocket error listeners and displays appropriate toast notifications
 * based on the error types, similar to the sogni-web implementation.
 */

/**
 * Map WebSocket error codes to user-friendly messages
 */
const ERROR_CODE_MESSAGES = {
  4015: {
    type: 'warning',
    title: 'Connection Switched',
    message: 'Your connection was switched to a new session. Reconnecting...'
  },
  4052: {
    type: 'error',
    title: 'Email Verification Required',
    message: 'Please verify your email address to continue using Sogni.'
  },
  4001: {
    type: 'error',
    title: 'Authentication Failed',
    message: 'Your session has expired. Please log in again.'
  },
  4003: {
    type: 'error',
    title: 'Access Denied',
    message: 'You do not have permission to perform this action.'
  },
  4004: {
    type: 'error',
    title: 'Rate Limited',
    message: 'Too many requests. Please wait a moment before trying again.'
  },
  4005: {
    type: 'error',
    title: 'Server Error',
    message: 'A server error occurred. Please try again later.'
  }
};

/**
 * Map WebSocket error reasons to user-friendly messages
 */
const ERROR_REASON_MESSAGES = {
  'verify your email': {
    type: 'error',
    title: 'Email Verification Required',
    message: 'Please check your email and click the verification link to continue.'
  },
  'insufficient credits': {
    type: 'warning',
    title: 'Insufficient Credits',
    message: 'You need more credits to generate images. Please purchase more credits.'
  },
  'rate limit exceeded': {
    type: 'warning',
    title: 'Rate Limit Exceeded',
    message: 'Please wait a moment before making another request.'
  },
  'server maintenance': {
    type: 'info',
    title: 'Server Maintenance',
    message: 'The server is undergoing maintenance. Please try again later.'
  }
};

/**
 * Get user-friendly error message from WebSocket error
 */
export const getErrorMessage = (error) => {
  // Check for specific error codes first
  if (error && typeof error.code === 'number' && ERROR_CODE_MESSAGES[error.code]) {
    return ERROR_CODE_MESSAGES[error.code];
  }

  // Check for error reasons
  if (error && error.reason) {
    const reason = error.reason.toLowerCase();
    for (const [key, message] of Object.entries(ERROR_REASON_MESSAGES)) {
      if (reason.includes(key)) {
        return message;
      }
    }
  }

  // Check for error messages
  if (error && error.message) {
    const message = error.message.toLowerCase();
    
    if (message.includes('websocket not connected')) {
      return {
        type: 'error',
        title: 'Connection Lost',
        message: 'Lost connection to the server. Attempting to reconnect...'
      };
    }
    
    if (message.includes('network error') || message.includes('connection failed')) {
      return {
        type: 'error',
        title: 'Network Error',
        message: 'Please check your internet connection and try again.'
      };
    }
    
    if (message.includes('timeout')) {
      return {
        type: 'warning',
        title: 'Request Timeout',
        message: 'The request took too long to complete. Please try again.'
      };
    }
  }

  // Default error message
  return {
    type: 'error',
    title: 'Connection Error',
    message: error?.message || error?.reason || 'An unexpected error occurred with the connection.'
  };
};

/**
 * Set up WebSocket error listeners for a Sogni client
 * @param {Object} client - The Sogni client instance
 * @param {Function} showToast - Function to show toast notifications
 * @param {Object} options - Configuration options
 * @returns {Function} Cleanup function to remove listeners
 */
export const setupWebSocketErrorHandler = (client, showToast, options = {}) => {
  if (!client || !showToast) {
    console.warn('WebSocket error handler: client or showToast function not provided');
    return () => {};
  }

  const {
    showDisconnectionToasts = true,
    showReconnectionToasts = true,
    showGeneralErrors = true,
    autoCloseTimeout = 5000
  } = options;

  const listeners = [];

  try {
    // Handle general socket errors
    if (client.apiClient && typeof client.apiClient.on === 'function') {
      const errorHandler = (error) => {
        if (!showGeneralErrors) return;

        const errorMessage = getErrorMessage(error);
        
        showToast({
          title: errorMessage.title,
          message: errorMessage.message,
          type: errorMessage.type,
          timeout: autoCloseTimeout
        });
      };

      client.apiClient.on('error', errorHandler);
      listeners.push(() => {
        if (client.apiClient && typeof client.apiClient.off === 'function') {
          client.apiClient.off('error', errorHandler);
        }
      });
    }

    // Handle disconnection events
    if (client.apiClient && typeof client.apiClient.on === 'function') {
      const disconnectHandler = (data) => {
        if (!showDisconnectionToasts) return;

        const reason = data?.reason || 'Connection lost';
        showToast({
          title: 'Disconnected',
          message: `${reason}. Attempting to reconnect...`,
          type: 'warning',
          timeout: autoCloseTimeout
        });
      };

      client.apiClient.on('disconnected', disconnectHandler);
      listeners.push(() => {
        if (client.apiClient && typeof client.apiClient.off === 'function') {
          client.apiClient.off('disconnected', disconnectHandler);
        }
      });
    }

    // Handle reconnection events
    if (client.apiClient && typeof client.apiClient.on === 'function') {
      const reconnectHandler = () => {
        if (!showReconnectionToasts) return;

        showToast({
          title: 'Reconnected',
          message: 'Connection to the server has been restored.',
          type: 'success',
          timeout: 3000
        });
      };

      client.apiClient.on('connected', reconnectHandler);
      listeners.push(() => {
        if (client.apiClient && typeof client.apiClient.off === 'function') {
          client.apiClient.off('connected', reconnectHandler);
        }
      });
    }

    // Handle toast messages from server (similar to sogni-web)
    if (client.apiClient && client.apiClient.socket && typeof client.apiClient.socket.on === 'function') {
      const toastHandler = (data) => {
        showToast({
          title: data.title || 'Server Message',
          message: data.message || '',
          type: data.type || 'info',
          timeout: data.autoClose || autoCloseTimeout
        });
      };

      client.apiClient.socket.on('toastMessage', toastHandler);
      listeners.push(() => {
        if (client.apiClient && client.apiClient.socket && typeof client.apiClient.socket.off === 'function') {
          client.apiClient.socket.off('toastMessage', toastHandler);
        }
      });
    }

  } catch (error) {
    console.error('Error setting up WebSocket error handlers:', error);
  }

  // Return cleanup function
  return () => {
    listeners.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.error('Error cleaning up WebSocket listener:', error);
      }
    });
  };
};

/**
 * Handle specific WebSocket error scenarios
 */
export const handleSpecificErrors = {
  emailVerification: (showToast) => {
    showToast({
      title: 'Email Verification Required',
      message: 'Please check your email and click the verification link to continue using Sogni.',
      type: 'error',
      timeout: 10000 // Longer timeout for important messages
    });
  },

  connectionSwitched: (showToast) => {
    showToast({
      title: 'Connection Switched',
      message: 'Your connection was switched to a new session. Reconnecting...',
      type: 'warning',
      timeout: 5000
    });
  },

  insufficientCredits: (showToast) => {
    showToast({
      title: 'Insufficient Credits',
      message: 'You need more credits to generate images. Please purchase more credits.',
      type: 'warning',
      timeout: 8000
    });
  },

  networkError: (showToast) => {
    showToast({
      title: 'Network Error',
      message: 'Please check your internet connection and try again.',
      type: 'error',
      timeout: 6000
    });
  }
};

export default {
  setupWebSocketErrorHandler,
  getErrorMessage,
  handleSpecificErrors
};
