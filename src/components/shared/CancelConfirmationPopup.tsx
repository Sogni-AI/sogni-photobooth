import React, { useRef, useEffect, useState } from 'react';
import {
  shouldSkipConfirmation,
  setSkipConfirmation,
  estimateRefund,
  type RefundEstimate
} from '../../services/cancellationService';
import '../../styles/components/CancelConfirmationPopup.css';

interface CancelConfirmationPopupProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  projectType?: 'image' | 'video' | 'enhancement' | 'transition';
  progress?: number; // 0-100
  itemsCompleted?: number;
  totalItems?: number;
  isRateLimited?: boolean;
  cooldownSeconds?: number;
}

const CancelConfirmationPopup: React.FC<CancelConfirmationPopupProps> = ({
  isOpen,
  onClose,
  onConfirm,
  projectType = 'image',
  progress = 0,
  itemsCompleted = 0,
  totalItems = 1,
  isRateLimited = false,
  cooldownSeconds = 0
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [dontRemindChecked, setDontRemindChecked] = useState(true); // Default checked
  const [refundEstimate, setRefundEstimate] = useState<RefundEstimate | null>(null);

  // Calculate refund estimate when popup opens
  useEffect(() => {
    if (isOpen) {
      const estimate = estimateRefund(progress);
      setRefundEstimate(estimate);
    }
  }, [isOpen, progress]);

  // Handle overlay click to close
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  // Prevent modal content clicks from bubbling
  const handleModalClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  const handleConfirm = () => {
    // Save preference if checked
    if (dontRemindChecked) {
      setSkipConfirmation(true);
    }
    onConfirm();
  };

  const getProjectTypeLabel = () => {
    switch (projectType) {
      case 'video':
        return 'video generation';
      case 'enhancement':
        return 'image enhancement';
      case 'transition':
        return 'transition video';
      default:
        return 'image generation';
    }
  };

  const getProgressDisplay = () => {
    if (totalItems > 1 && itemsCompleted > 0) {
      return `${itemsCompleted} of ${totalItems} items completed`;
    }
    if (progress > 0) {
      return `${Math.round(progress)}% complete`;
    }
    return 'Just started';
  };

  if (!isOpen) return null;

  return (
    <div
      className="cancel-confirmation-overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
    >
      <div
        className="cancel-confirmation-modal"
        ref={modalRef}
        onClick={handleModalClick}
      >
        <button className="cancel-confirmation-close" onClick={onClose}>
          ×
        </button>

        <div className="cancel-confirmation-header">
          <div className="cancel-icon">⚠️</div>
          <h2>Cancel {getProjectTypeLabel()}?</h2>
        </div>

        <div className="cancel-confirmation-content">
          {isRateLimited ? (
            <div className="rate-limit-warning">
              <p className="rate-limit-message">
                <span className="warning-icon">⏱️</span>
                You can cancel again in <strong>{cooldownSeconds} seconds</strong>
              </p>
              <p className="rate-limit-hint">
                To prevent abuse, cancellations are limited to once every 20 seconds.
              </p>
            </div>
          ) : (
            <>
              <div className="progress-info">
                <p className="progress-status">{getProgressDisplay()}</p>
                {refundEstimate && (
                  <p className="refund-estimate">
                    <span className="refund-icon">💰</span>
                    {refundEstimate.message}
                  </p>
                )}
              </div>

              <div className="cancel-warning">
                <p>
                  {totalItems > 1 && itemsCompleted > 0 ? (
                    <>
                      <strong>{itemsCompleted} item{itemsCompleted !== 1 ? 's' : ''}</strong> already completed will be kept.
                      Remaining items will be cancelled.
                    </>
                  ) : (
                    'This will stop the current generation. Any completed work will be kept.'
                  )}
                </p>
              </div>

              <label className="dont-remind-checkbox">
                <input
                  type="checkbox"
                  checked={dontRemindChecked}
                  onChange={(e) => setDontRemindChecked(e.target.checked)}
                />
                <span className="checkbox-label">Don&apos;t remind me again</span>
              </label>
            </>
          )}
        </div>

        <div className="cancel-confirmation-footer">
          {isRateLimited ? (
            <button className="cancel-confirmation-btn secondary" onClick={onClose}>
              OK
            </button>
          ) : (
            <>
              <button
                className="cancel-confirmation-btn primary"
                onClick={handleConfirm}
              >
                Yes, Cancel
              </button>
              <button
                className="cancel-confirmation-btn secondary"
                onClick={onClose}
              >
                Keep Generating
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CancelConfirmationPopup;

// Convenience hook for managing cancel confirmation state
export function useCancelConfirmation() {
  const [showPopup, setShowPopup] = useState(false);
  const [pendingCancel, setPendingCancel] = useState<{
    projectId: string;
    projectType: 'image' | 'video' | 'enhancement' | 'transition';
    progress: number;
    itemsCompleted: number;
    totalItems: number;
    onConfirm: () => void;
  } | null>(null);

  const requestCancel = (params: {
    projectId: string;
    projectType?: 'image' | 'video' | 'enhancement' | 'transition';
    progress?: number;
    itemsCompleted?: number;
    totalItems?: number;
    onConfirm: () => void;
  }) => {
    // If user opted out of confirmations, cancel immediately
    if (shouldSkipConfirmation()) {
      params.onConfirm();
      return;
    }

    // Show confirmation popup
    setPendingCancel({
      projectId: params.projectId,
      projectType: params.projectType || 'image',
      progress: params.progress || 0,
      itemsCompleted: params.itemsCompleted || 0,
      totalItems: params.totalItems || 1,
      onConfirm: params.onConfirm
    });
    setShowPopup(true);
  };

  const handleClose = () => {
    setShowPopup(false);
    setPendingCancel(null);
  };

  const handleConfirm = () => {
    if (pendingCancel?.onConfirm) {
      pendingCancel.onConfirm();
    }
    handleClose();
  };

  return {
    showPopup,
    pendingCancel,
    requestCancel,
    handleClose,
    handleConfirm
  };
}
