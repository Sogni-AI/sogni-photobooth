import React, { useCallback, useMemo } from 'react';
import './styles.css';
import { LoginModalMode } from './types';
import LoginForm from './LoginForm';
import SignupForm from './SignupForm';
import { defaultModalText, ModalContext, ModalText } from './context';

export type { LoginModalMode };

interface Props {
  open: boolean;
  mode: LoginModalMode;
  onModeChange: (mode: LoginModalMode) => void;
  onClose: () => void;
  textOverrides?: Partial<ModalText>;
  onSignupComplete?: () => void;
}

const emptyObject = {};

function LoginModal({ open, mode, onModeChange, onClose, textOverrides = emptyObject, onSignupComplete }: Props) {
  const modalCtx = useMemo(
    () => ({
      text: { ...defaultModalText, ...textOverrides }
    }),
    [textOverrides]
  );

  const handleLogin = useCallback(() => onModeChange('login'), [onModeChange]);
  const handleSignup = useCallback(() => onModeChange('signup'), [onModeChange]);

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  if (!open) return null;

  let content;
  switch (mode) {
    case 'login':
      content = <LoginForm onSignup={handleSignup} onClose={onClose} />;
      break;
    case 'signup':
      content = <SignupForm onLogin={handleLogin} onClose={onClose} onSignupComplete={onSignupComplete} />;
      break;
    default:
      content = null;
  }

  return (
    <ModalContext.Provider value={modalCtx}>
      <div className="login-modal-overlay" onClick={handleOverlayClick}>
        <div className="login-modal-container">
          <button className="login-modal-close" onClick={onClose}>
            ×
          </button>
          <div className="login-modal-content">{content}</div>
        </div>
      </div>
    </ModalContext.Provider>
  );
}

export default LoginModal;

