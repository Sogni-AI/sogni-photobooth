import { useCallback } from 'react';
import { Step1Fields } from '../types';
import useForm from '../../../../hooks/useForm';
import FormField from '../../../shared/FormField';
import { useSogniAuth } from '../../../../services/sogniAuth';
import {
  ErrorMessage,
  FieldContainer,
  FormContent,
  FormFooter,
  FormPanel,
  LinkButton
} from '../common';
import '../styles.css';

// Email validation
function isEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

interface Props {
  defaults: Step1Fields;
  onLogin: () => void;
  onContinue: (fields: Step1Fields) => void;
  lockReferral?: boolean;
}

function Step1({ defaults, lockReferral, onContinue, onLogin }: Props) {
  const { ensureClient } = useSogniAuth();

  const proceed = useCallback(
    (fields: Step1Fields) => {
      onContinue(fields);
      return Promise.resolve();
    },
    [onContinue]
  );

  const validate = useCallback(
    async (fields: Step1Fields) => {
      const errors: Record<string, string> = {};

      if (!fields.username) {
        errors.username = 'Username is required';
      } else {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call
          const client = await ensureClient();
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
          const result = await client.account.validateUsername(fields.username);
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          if (result.status === 'error') {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
            errors.username = result.message;
          }
        } catch (err: unknown) {
          console.error('Failed to validate username:', err);
          // Don't block signup if validation fails - let the server handle it
        }
      }

      if (!fields.email) {
        errors.email = 'Email is required';
      } else if (!isEmail(fields.email)) {
        errors.email = 'Provide valid email address';
      }

      return errors;
    },
    [ensureClient]
  );

  const { fields, fieldErrors, error, handleFieldChange, handleFormSubmit, isLoading } = useForm(
    defaults,
    proceed,
    validate
  );

  return (
    <FormPanel onSubmit={handleFormSubmit} disabled={isLoading} noValidate>
      <FormContent subHeading="Choose your username">
        <FieldContainer>
          <FormField
            name="username"
            label="Username"
            value={fields.username}
            type="text"
            autoComplete="username"
            placeholder="Username"
            onChange={handleFieldChange}
            error={fieldErrors.username}
            size="lg"
          />
          <FormField
            name="email"
            label="Email"
            value={fields.email}
            type="email"
            autoComplete="email"
            placeholder="your@email.com"
            onChange={handleFieldChange}
            error={fieldErrors.email}
            size="lg"
          />
          <FormField
            name="referralCode"
            label="Referral code (Optional)"
            value={fields.referralCode}
            type="text"
            disabled={lockReferral}
            placeholder="Enter code here"
            onChange={handleFieldChange}
            error={fieldErrors.referralCode}
            size="lg"
          />
          <FormField
            name="subscribe"
            label="Subscribe to Latest News & Updates"
            checked={fields.subscribe}
            type="switch"
            onChange={handleFieldChange}
            error={fieldErrors.subscribe}
          />
          <FormField
            name="remember"
            label="Keep me logged in"
            checked={fields.remember}
            type="switch"
            onChange={handleFieldChange}
            error={fieldErrors.remember}
          />
          {error && <ErrorMessage>{error.message}</ErrorMessage>}
        </FieldContainer>
      </FormContent>
      <FormFooter>
        <button type="submit" className="login-modal-button primary" disabled={isLoading}>
          {isLoading ? 'Validating...' : 'Continue'}
        </button>
        <LinkButton onClick={onLogin}>Already have an account?</LinkButton>
      </FormFooter>
    </FormPanel>
  );
}

export default Step1;

