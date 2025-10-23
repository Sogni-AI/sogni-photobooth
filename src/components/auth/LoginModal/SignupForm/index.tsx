import React, { useCallback, useMemo, useState } from 'react';
import { Step1Fields, Step2Fields } from '../types';
import Step1 from './Step1';
import Step2 from './Step2';
import Step3 from './Step3';
import Step4 from './Step4';

interface Props {
  onLogin: () => void;
  onClose: () => void;
  onSignupComplete?: () => void;
}

// Get referral code from URL if present
function getReferralFromURL(): string {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('code') || urlParams.get('referral') || '';
}

function SignupForm({ onLogin, onClose, onSignupComplete }: Props) {
  // Get referral code when form first mounts (default to PHOTOBOOTH)
  const initialReferralCode = useMemo(() => getReferralFromURL() || 'PHOTOBOOTH', []);

  const [step1, setStep1] = useState<Step1Fields>({
    username: '',
    email: '',
    subscribe: false,
    remember: true,
    referralCode: initialReferralCode // Initialize with code
  });

  const [step2, setStep2] = useState<Step2Fields>({
    password: '',
    passwordConfirm: '',
    confirmPasswordUnrecoverable: false
  });

  const [step, setStep] = useState(1);

  console.log('📋 SignupForm current step:', step);

  const handleStep1Complete = useCallback((fields: Step1Fields) => {
    console.log('✅ Step 1 complete, moving to step 2');
    setStep1(fields);
    setStep(2);
  }, []);

  const handleStep2Complete = useCallback((fields: Step2Fields) => {
    console.log('✅ Step 2 complete, moving to step 3');
    setStep2(fields);
    setStep(3);
  }, []);

  const handleStep3Complete = useCallback(() => {
    console.log('✅ Step 3 complete, moving to step 4 (welcome)');
    setStep(4);
  }, []);

  const handleReturn = useCallback(() => {
    setStep((prevStep) => {
      console.log(`⬅️ Going back from step ${prevStep} to ${prevStep - 1}`);
      return prevStep - 1;
    });
  }, []);

  switch (step) {
    case 1:
      return <Step1 defaults={step1} onLogin={onLogin} onContinue={handleStep1Complete} />;
    case 2:
      return (
        <Step2
          onContinue={handleStep2Complete}
          onReturn={handleReturn}
          initialState={step2}
          step1={step1}
        />
      );
    case 3:
      return (
        <Step3 step1={step1} step2={step2} onReturn={handleReturn} onContinue={handleStep3Complete} />
      );
    case 4:
      return <Step4 onClose={onClose} onSignupComplete={onSignupComplete} />;
    default:
      return null;
  }
}

export default SignupForm;

