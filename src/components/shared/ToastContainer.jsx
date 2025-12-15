import React from 'react';
import PropTypes from 'prop-types';
import './ToastContainer.css';

const ToastContainer = ({ toasts }) => {
  if (!toasts || toasts.length === 0) {
    return null;
  }

  const getToastIcon = (type) => {
    switch (type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
      default:
        return 'ℹ️';
    }
  };

  const getToastColor = (type) => {
    switch (type) {
      case 'success':
        return {
          background: 'linear-gradient(135deg, #4caf50 0%, #45a049 100%)',
          shadowColor: 'rgba(76, 175, 80, 0.3)'
        };
      case 'error':
        return {
          background: 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)',
          shadowColor: 'rgba(244, 67, 54, 0.3)'
        };
      case 'warning':
        return {
          background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)',
          shadowColor: 'rgba(255, 152, 0, 0.3)'
        };
      case 'info':
      default:
        return {
          background: 'linear-gradient(135deg, #2196f3 0%, #1976d2 100%)',
          shadowColor: 'rgba(33, 150, 243, 0.3)'
        };
    }
  };

  return (
    <div className="toast-container">
      {toasts.map((toast) => {
        const colors = getToastColor(toast.type);
        return (
          <div
            key={toast.id}
            className={`toast toast-${toast.type} ${toast.visible ? 'toast-visible' : 'toast-hidden'}`}
            style={{
              background: colors.background,
              boxShadow: `0 8px 32px ${colors.shadowColor}`,
              cursor: toast.onClick ? 'pointer' : 'default'
            }}
            onClick={() => {
              if (toast.onClick) {
                toast.onClick();
              }
              toast.hideToast();
            }}
          >
            <div className="toast-icon">
              {getToastIcon(toast.type)}
            </div>
            <div className="toast-content">
              <div className="toast-title">{toast.title}</div>
              {toast.message && (
                <div className="toast-message">{toast.message}</div>
              )}
            </div>
            <button
              className="toast-close"
              onClick={(e) => {
                e.stopPropagation();
                toast.hideToast();
              }}
              aria-label="Close notification"
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
};

ToastContainer.propTypes = {
  toasts: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      title: PropTypes.string.isRequired,
      message: PropTypes.string,
      type: PropTypes.oneOf(['success', 'error', 'warning', 'info']).isRequired,
      visible: PropTypes.bool.isRequired,
      hideToast: PropTypes.func.isRequired
    })
  ).isRequired
};

export default ToastContainer;
