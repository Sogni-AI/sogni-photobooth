import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import PropTypes from 'prop-types';
import { getTokenLabel } from '../../services/walletService';

/**
 * PromptVideoConfirmationPopup
 * Confirmation popup for custom prompt video generation with cost display
 */
const PromptVideoConfirmationPopup = ({ 
  visible, 
  onConfirm, 
  onClose,
  loading,
  costRaw,
  costUSD,
  videoResolution,
  videoDuration,
  tokenType = 'spark',
  isBatch = false,
  itemCount = 1
}) => {
  const [positivePrompt, setPositivePrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('slow motion, talking, blurry, low quality, static, deformed overexposed, blurred details, worst quality, low quality, JPEG compression, ugly, still picture, walking backwards');
  const [error, setError] = useState('');

  const formatCost = (tokenCost, usdCost) => {
    if (!tokenCost || !usdCost) return null;
    // Format token cost to reasonable precision (max 2 decimal places)
    const formattedTokenCost = typeof tokenCost === 'number' ? tokenCost.toFixed(2) : parseFloat(tokenCost).toFixed(2);
    return `${formattedTokenCost} (≈ $${usdCost.toFixed(2)} USD)`;
  };

  if (!visible) return null;

  const handleConfirm = () => {
    if (!positivePrompt.trim()) {
      setError('Please enter a prompt');
      return;
    }
    if (positivePrompt.trim().length < 10) {
      setError('Prompt must be at least 10 characters');
      return;
    }
    setError('');
    onConfirm(positivePrompt.trim(), negativePrompt.trim());
  };

  const handleClose = () => {
    setPositivePrompt('');
    setNegativePrompt('slow motion, talking, blurry, low quality, static, deformed overexposed, blurred details, worst quality, low quality, JPEG compression, ugly, still picture, walking backwards');
    setError('');
    onClose();
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
    >
      <div
        style={{
          background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
          borderRadius: '20px',
          padding: '30px',
          maxWidth: '500px',
          width: '100%',
          boxShadow: '0 20px 60px rgba(139, 92, 246, 0.5)',
          animation: 'slideUp 0.3s ease',
          position: 'relative'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleClose}
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

        {/* Header */}
        <div style={{ marginBottom: '24px', textAlign: 'center' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginBottom: '12px'
          }}>
            <span style={{ fontSize: '40px' }}>✨</span>
            <h2 style={{
              margin: 0,
              color: 'white',
              fontSize: '28px',
              fontWeight: '700'
            }}>
              Prompt Video{isBatch ? ' (Batch)' : ''}
            </h2>
          </div>
        </div>

        {/* Positive Prompt Input */}
        <div style={{ marginBottom: '16px' }}>
          <label style={{
            display: 'block',
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '8px'
          }}>
            ✨ Motion Prompt:
          </label>
          <textarea
            value={positivePrompt}
            onChange={(e) => {
              setPositivePrompt(e.target.value);
              setError('');
            }}
            placeholder="E.g., subject tilts head and smiles warmly at camera..."
            style={{
              width: '100%',
              minHeight: '100px',
              padding: '12px',
              borderRadius: '12px',
              border: error ? '2px solid rgba(255, 0, 0, 0.5)' : '2px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
            onFocus={(e) => {
              e.currentTarget.style.border = '2px solid rgba(255, 255, 255, 0.4)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.border = error ? '2px solid rgba(255, 0, 0, 0.5)' : '2px solid rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
          />
          {error && (
            <div style={{
              color: 'rgba(255, 200, 200, 0.9)',
              fontSize: '12px',
              marginTop: '6px',
              fontWeight: '500'
            }}>
              {error}
            </div>
          )}
          <div style={{
            color: 'rgba(255, 255, 255, 0.7)',
            fontSize: '11px',
            marginTop: '6px'
          }}>
            {positivePrompt.length} characters {positivePrompt.length < 10 ? `(minimum 10)` : ''}
          </div>
        </div>

        {/* Negative Prompt Input */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{
            display: 'block',
            color: 'rgba(255, 255, 255, 0.9)',
            fontSize: '14px',
            fontWeight: '600',
            marginBottom: '8px'
          }}>
            🚫 Avoid (Optional):
          </label>
          <textarea
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="Things to avoid in the video..."
            style={{
              width: '100%',
              minHeight: '70px',
              padding: '12px',
              borderRadius: '12px',
              border: '2px solid rgba(255, 255, 255, 0.2)',
              background: 'rgba(255, 255, 255, 0.1)',
              color: 'white',
              fontSize: '14px',
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
            onFocus={(e) => {
              e.currentTarget.style.border = '2px solid rgba(255, 255, 255, 0.4)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.border = '2px solid rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
            }}
          />
        </div>

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '12px'
        }}>
          <button
            type="button"
            onClick={handleClose}
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
            onClick={handleConfirm}
            disabled={loading || !positivePrompt.trim() || positivePrompt.trim().length < 10}
            style={{
              flex: 2,
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: loading || !positivePrompt.trim() || positivePrompt.trim().length < 10 
                ? 'rgba(255, 255, 255, 0.3)' 
                : 'white',
              color: loading || !positivePrompt.trim() || positivePrompt.trim().length < 10 
                ? 'rgba(255, 255, 255, 0.7)' 
                : '#8B5CF6',
              fontSize: '15px',
              fontWeight: '700',
              cursor: loading || !positivePrompt.trim() || positivePrompt.trim().length < 10 
                ? 'not-allowed' 
                : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: loading || !positivePrompt.trim() || positivePrompt.trim().length < 10 
                ? 'none' 
                : '0 4px 15px rgba(255, 255, 255, 0.3)',
              touchAction: 'manipulation'
            }}
            onMouseOver={(e) => {
              if (!loading && positivePrompt.trim() && positivePrompt.trim().length >= 10) {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.95)';
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 20px rgba(255, 255, 255, 0.4)';
              }
            }}
            onMouseOut={(e) => {
              if (!loading && positivePrompt.trim() && positivePrompt.trim().length >= 10) {
                e.currentTarget.style.background = 'white';
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 15px rgba(255, 255, 255, 0.3)';
              }
            }}
          >
            {loading 
              ? '⏳ Calculating...' 
              : isBatch 
                ? `✨ Generate ${itemCount} Prompt Videos`
                : '✨ Generate Prompt Video'
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
                {`${isBatch ? `📹 ${itemCount} videos • ` : ''}📐 ${videoResolution || '480p'} • ⏱️ ${videoDuration || 5}s`}
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

PromptVideoConfirmationPopup.propTypes = {
  visible: PropTypes.bool.isRequired,
  onConfirm: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  costRaw: PropTypes.number,
  costUSD: PropTypes.number,
  videoResolution: PropTypes.string,
  videoDuration: PropTypes.number,
  tokenType: PropTypes.oneOf(['spark', 'sogni']),
  isBatch: PropTypes.bool,
  itemCount: PropTypes.number
};

export default PromptVideoConfirmationPopup;

