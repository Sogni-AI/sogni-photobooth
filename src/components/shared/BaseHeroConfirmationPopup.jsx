import React from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { getTokenLabel } from '../../services/walletService';

/**
 * BaseHeroConfirmationPopup
 * Confirmation popup for BASE Hero video generation with cost display and Base.org branding
 */
const BaseHeroConfirmationPopup = ({ 
  visible, 
  onConfirm, 
  onClose,
  loading,
  costRaw,
  costUSD,
  videoResolution,
  tokenType = 'spark',
  isBatch = false,
  itemCount = 1
}) => {
  const formatCost = (tokenCost, usdCost) => {
    if (!tokenCost || !usdCost) return null;
    // Format token cost to reasonable precision (max 2 decimal places)
    const formattedTokenCost = typeof tokenCost === 'number' ? tokenCost.toFixed(2) : parseFloat(tokenCost).toFixed(2);
    return `${formattedTokenCost} (≈ $${usdCost.toFixed(2)} USD)`;
  };

  if (!visible) return null;

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return createPortal(
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: '20px',
        backdropFilter: 'blur(8px)',
        animation: 'fadeIn 0.2s ease'
      }}
      onClick={handleBackdropClick}
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #0052FF 0%, #0039CC 100%)',
          borderRadius: '20px',
          padding: '30px',
          maxWidth: '500px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(0, 82, 255, 0.5)',
          animation: 'slideUp 0.3s ease',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '15px',
            right: '15px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            background: 'rgba(255, 255, 255, 0.2)',
            color: 'white',
            fontSize: '20px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
            e.currentTarget.style.transform = 'scale(1.1)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
            e.currentTarget.style.transform = 'scale(1)';
          }}
        >
          ×
        </button>

        {/* Header with Base.org branding */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '12px'
          }}>
            <span style={{ fontSize: '40px' }}>🦸</span>
            <h2 style={{
              margin: 0,
              color: 'white',
              fontSize: '28px',
              fontWeight: '700'
            }}>
              BASE Hero Video{isBatch ? ' (Batch)' : ''}
            </h2>
          </div>
        </div>

        {/* Marketing Content */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '16px',
          padding: '24px',
          marginBottom: '24px',
          textAlign: 'center'
        }}>
          <div style={{
            fontSize: '18px',
            fontWeight: '700',
            color: 'white',
            marginBottom: '12px',
            lineHeight: '1.4'
          }}>
            🎉 Introducing Base App
          </div>
          <p style={{
            margin: '0 0 16px 0',
            color: 'rgba(255, 255, 255, 0.95)',
            fontSize: '15px',
            lineHeight: '1.6'
          }}>
            Base App is here! An everything app that brings together social, payments, and finance in one place.
          </p>
          <p style={{
            margin: '0 0 16px 0',
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '14px',
            lineHeight: '1.6'
          }}>
            <strong style={{ color: 'white' }}>SOGNI + Photobooth</strong> will be available in Base App soon! 
            Create amazing AI photos and videos directly in the app.
          </p>
          <a
            href="https://blog.base.org/baseapp"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'inline-block',
              padding: '10px 20px',
              background: 'rgba(255, 255, 255, 0.2)',
              borderRadius: '8px',
              color: 'white',
              fontSize: '14px',
              fontWeight: '600',
              textDecoration: 'none',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.3)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Learn More About Base App ↗
          </a>
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '12px'
        }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              flex: 1,
              padding: '14px',
              borderRadius: '12px',
              border: '2px solid rgba(255, 255, 255, 0.4)',
              background: 'transparent',
              color: 'white',
              fontSize: '15px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              touchAction: 'manipulation'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              flex: 2,
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: loading ? 'rgba(255, 255, 255, 0.3)' : 'white',
              color: loading ? 'rgba(255, 255, 255, 0.7)' : '#0052FF',
              fontSize: '15px',
              fontWeight: '700',
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: loading ? 'none' : '0 4px 15px rgba(255, 255, 255, 0.3)',
              touchAction: 'manipulation'
            }}
            onMouseOver={(e) => {
              if (!loading) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.95)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 255, 255, 0.4)';
              }
            }}
            onMouseOut={(e) => {
              if (!loading) {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(255, 255, 255, 0.3)';
              }
            }}
          >
            {loading 
              ? '⏳ Calculating...' 
              : isBatch 
                ? `🦸 Generate ${itemCount} BASE Hero Videos`
                : '🦸 Generate BASE Hero Video'
            }
          </button>
        </div>

        {/* Cost Footer - Small footer like other video popups */}
        {!loading && formatCost(costRaw, costUSD) ? (
          <div style={{
            padding: '8px 16px 12px 16px',
            borderTop: '1px solid rgba(255, 255, 255, 0.15)',
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '11px',
            textAlign: 'center'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '4px'
            }}>
              <span style={{ fontSize: '10px', fontWeight: '500', opacity: 0.8 }}>
                {`${isBatch ? `📹 ${itemCount} videos • ` : ''}📐 ${videoResolution || '480p'} • ⏱️ 5s (fixed)`}
              </span>
              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                {costRaw && (
                  <span style={{ fontSize: '11px', fontWeight: '700', color: 'white' }}>
                    {(() => {
                      const costValue = typeof costRaw === 'number' ? costRaw : parseFloat(costRaw);
                      if (isNaN(costValue)) return null;
                      const tokenLabel = getTokenLabel(tokenType);
                      return `${costValue.toFixed(2)} ${tokenLabel}`;
                    })()}
                  </span>
                )}
                {costUSD && (
                  <span style={{ fontWeight: '400', opacity: 0.75, fontSize: '10px', color: 'rgba(255, 255, 255, 0.8)' }}>
                    ≈ ${costUSD.toFixed(2)} USD
                  </span>
                )}
              </div>
            </div>
          </div>
        ) : loading ? (
          <div style={{
            padding: '8px 16px 12px 16px',
            fontSize: '11px',
            fontWeight: '700',
            textAlign: 'center',
            borderTop: '1px solid rgba(255, 255, 255, 0.15)',
            color: 'rgba(255, 255, 255, 0.9)'
          }}>
            Calculating cost...
          </div>
        ) : null}
      </div>

      {/* CSS animations */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>,
    document.body
  );
};

BaseHeroConfirmationPopup.propTypes = {
  visible: PropTypes.bool.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  costRaw: PropTypes.number,
  costUSD: PropTypes.number,
  videoResolution: PropTypes.string,
  tokenType: PropTypes.oneOf(['spark', 'sogni']),
  isBatch: PropTypes.bool,
  itemCount: PropTypes.number
};

export default BaseHeroConfirmationPopup;

