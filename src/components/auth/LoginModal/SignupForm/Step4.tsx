import { useEffect, useRef } from 'react';
import { ContentPanel, FormContent, FormFooter } from '../common';
import { useSogniAuth } from '../../../../services/sogniAuth';
import '../styles.css';
import { useModalCtx } from '../context';

interface Props {
  onClose: () => void;
  onSignupComplete?: () => void;
}

function Step4({ onClose, onSignupComplete }: Props) {
  const { text } = useModalCtx();
  const { user, isAuthenticated } = useSogniAuth();
  const hasTriggeredCallback = useRef(false);

  console.log('🎬 Step4 rendered:', { isAuthenticated, user, hasCallback: !!onSignupComplete });

  // Auto-close modal and trigger signup complete callback (only once)
  useEffect(() => {
    if (isAuthenticated && user && !hasTriggeredCallback.current) {
      hasTriggeredCallback.current = true;
      console.log('✅ Step4: Authenticated user detected, setting up auto-close');
      
      // Auto-close modal and trigger signup complete callback
      const timer = setTimeout(() => {
        console.log('✅ Signup complete - closing modal and triggering onSignupComplete');
        onClose();
        
        // Notify parent that signup is complete (to show daily boost)
        if (onSignupComplete) {
          console.log('🎯 Calling onSignupComplete callback');
          setTimeout(() => {
            onSignupComplete();
          }, 100);
        }
      }, 3000); // 3 seconds to read the welcome message

      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, user, onClose, onSignupComplete]);

  return (
    <ContentPanel>
      <FormContent
        subHeading={
          <>
            Welcome, <span className="username-gradient">@{user?.username}</span>!
          </>
        }
      >
        <div className="login-modal-welcome-message">
          <div className="login-modal-welcome-icon">🎉</div>
          <h3>Account Created Successfully!</h3>
          <p>Check your email: Verify to claim 125 free credits.</p>
            <p style={{ marginTop: '8px', fontSize: '12px' }}>
              ⭐ <strong>BONUS:</strong> 50 FREE Daily Boost credits daily!
            </p>
        </div>
      </FormContent>
      <FormFooter>
        <button type="button" className="login-modal-button primary" onClick={onClose}>
          {text.signupDoneCTA}
        </button>
      </FormFooter>
    </ContentPanel>
  );
}

export default Step4;

