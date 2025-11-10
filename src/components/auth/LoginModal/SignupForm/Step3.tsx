import { useCallback, useState, useEffect } from 'react';
import { Step1Fields, Step2Fields } from '../types';
import { FormContent, FormFooter, FormPanel } from '../common';
import useForm from '../../../../hooks/useForm';
import { useSogniAuth } from '../../../../services/sogniAuth';
import { trackEvent } from '../../../../utils/analytics';
import { getCampaignSource } from '../../../../utils/campaignAttribution';
import { getReferralSource } from '../../../../utils/referralTracking';
import Turnstile, { useTurnstile } from 'react-turnstile';
import { TURNSTILE_KEY } from '../../../../config/turnstile';
import '../styles.css';

const emptyState = {};

interface Props {
  step1: Step1Fields;
  step2: Step2Fields;
  onReturn: () => void;
  onContinue: () => void;
}

function Step3({ step1, step2, onReturn, onContinue }: Props) {
  const [revealPassword, setRevealPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string>();
  const { ensureClient, setAuthenticatedState } = useSogniAuth();
  const turnstile = useTurnstile();

  const doSignup = useCallback(async () => {
    if (!turnstileToken) {
      throw new Error('Please complete the verification challenge');
    }

    const { username, email, subscribe, referralCode, remember } = step1;
    const { password } = step2;

    const client = await ensureClient();

    // This will throw if account creation fails
    await client.account.create(
      {
        username,
        email,
        password,
        subscribe,
        turnstileToken,
        referralCode
      },
      remember
    );

    // Only reached if account creation was successful
    console.log('✅ Account created successfully!', {
      username,
      email,
      clientAuthenticated: client.account.currentAccount?.isAuthenicated
    });
    
    // Track signup conversion with campaign attribution
    const campaignSource = getCampaignSource();
    trackEvent('User', 'signup_complete', campaignSource || 'organic');
    if (campaignSource) {
      trackEvent('Gimi Challenge', 'conversion_signup', `Source: ${campaignSource}`);
      console.log(`[Campaign] Signup attributed to: ${campaignSource}`);
    }
    
    // Track referral conversion
    const referralSource = getReferralSource();
    if (referralSource) {
      trackEvent('Referral', 'conversion_signup', `Referred by: ${referralSource}`);
      console.log(`[Referral] Signup attributed to referrer: ${referralSource}`);
      // Note: The referral cookie persists for 30 days, so multiple conversions can be tracked
    }
    
    // Store remember preference
    if (remember) {
      localStorage.setItem('sogni-persist', 'true');
    } else {
      localStorage.removeItem('sogni-persist');
    }

    // Directly update auth state since client is already authenticated
    console.log('🔄 Setting authenticated state after signup...');
    setAuthenticatedState(username, email);
    console.log('✅ Auth state updated to authenticated');

    turnstile.reset();
    
    // Continue to welcome screen
    onContinue();
  }, [step1, step2, onContinue, ensureClient, setAuthenticatedState, turnstileToken, turnstile]);

  const { isLoading, handleFormSubmit, error } = useForm(emptyState, doSignup);

  const toggleRevealPassword = useCallback(() => {
    setRevealPassword((prev) => !prev);
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(step2.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [step2.password]);

  useEffect(() => {
    if (error) {
      console.error('Signup error:', error);
      setTurnstileToken(undefined);
      turnstile.reset();
    }
  }, [error, turnstile]);

  return (
    <FormPanel onSubmit={handleFormSubmit} disabled={isLoading} autoComplete="off">
      <FormContent subHeading="Review your credentials">
        <div className="login-modal-password-warning">
          <strong>⚠️ Credentials cannot be reset or recovered.</strong>
          <p>We strongly recommend using a password manager to save your credentials.</p>
        </div>
        {/* Hidden fields for browser to save credentials ONLY on success */}
        <input
          type="text"
          name="username"
          value={step1.username}
          autoComplete="username"
          readOnly
          tabIndex={-1}
          style={{
            position: 'absolute',
            left: '-9999px',
            width: '1px',
            height: '1px',
            opacity: 0
          }}
        />
        <input
          type="password"
          name="password"
          value={step2.password}
          autoComplete="new-password"
          readOnly
          tabIndex={-1}
          style={{
            position: 'absolute',
            left: '-9999px',
            width: '1px',
            height: '1px',
            opacity: 0
          }}
        />
        <div className="login-modal-review-credentials">
          <div>
            <div className="login-modal-review-label">Username</div>
            <div className="login-modal-review-value">
              <input
                type="text"
                value={step1.username}
                readOnly
                autoComplete="off"
                tabIndex={-1}
              />
            </div>
          </div>
          <div>
            <div className="login-modal-review-label">Password</div>
            <div className={`login-modal-review-value ${copied ? 'active' : ''}`}>
              <input
                className="login-modal-review-value"
                type={revealPassword ? 'text' : 'password'}
                value={step2.password}
                readOnly
                autoComplete="off"
                tabIndex={-1}
              />
              <span className="login-modal-review-actions">
                <button className="login-modal-icon-button" type="button" onClick={handleCopy}>
                  {copied ? '✓' : '📋'}
                </button>
                <button
                  className="login-modal-icon-button"
                  type="button"
                  onClick={toggleRevealPassword}
                >
                  {revealPassword ? '🙈' : '👁️'}
                </button>
              </span>
            </div>
          </div>
        </div>
        {error && (
          <div className="login-modal-password-warning">
            {error.message || 'An error occurred while creating your account. Please try again.'}
          </div>
        )}
        <Turnstile
          className="login-modal-turnstile"
          sitekey={TURNSTILE_KEY}
          onVerify={(token) => {
            setTurnstileToken(token);
          }}
        />
      </FormContent>
      <FormFooter>
        <p className="login-modal-disclaimer">
          By clicking "Create account", you state you have read and agree to{' '}
          <a href="https://www.sogni.ai/privacy-policy" target="_blank" rel="noreferrer">
            Sogni's Terms & Privacy Policy.
          </a>
        </p>
        <button type="button" className="login-modal-button secondary" onClick={onReturn}>
          Go back and make changes
        </button>
        <button type="submit" className="login-modal-button primary" disabled={!turnstileToken || isLoading}>
          {isLoading ? 'Creating account...' : 'Create account'}
        </button>
      </FormFooter>
    </FormPanel>
  );
}

export default Step3;

