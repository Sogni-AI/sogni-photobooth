import { useCallback } from 'react';
import { Step1Fields, Step2Fields } from '../types';
import useForm from '../../../../hooks/useForm';
import FormField from '../../../shared/FormField';
import { ErrorMessage, FormContent, FormFooter, FormPanel } from '../common';
import '../styles.css';

function hasNotNumbers(str: string) {
  return !!str.match(/[^0-9]/);
}

function hasNumbers(str: string) {
  return !!str.match(/[0-9]/);
}

async function validate({ password, passwordConfirm }: Step2Fields) {
  const errors: Record<string, string> = {};

  if (!password) {
    errors.password = 'Password is required';
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters';
  } else if (!hasNotNumbers(password) || !hasNumbers(password)) {
    errors.password = 'Password must contain letters and numbers';
  }

  if (!passwordConfirm) {
    errors.passwordConfirm = 'Password confirm is required';
  } else if (password !== passwordConfirm) {
    errors.passwordConfirm = 'Passwords do not match';
  }

  return errors;
}

function CheckMark({ success }: { success: boolean }) {
  return (
    <div className={`login-modal-check-mark ${success ? 'success' : ''}`}>
      {success ? '✓' : '○'}
    </div>
  );
}

interface Props {
  step1: Step1Fields;
  initialState: Step2Fields;
  onContinue: (fields: Step2Fields) => void;
  onReturn: () => void;
}

function Step2({ step1, initialState, onContinue, onReturn }: Props) {
  const doSignup = useCallback(
    (step2: Step2Fields) => {
      onContinue(step2);
      return Promise.resolve();
    },
    [onContinue]
  );

  const { fields, fieldErrors, error, handleFieldChange, handleFormSubmit, isLoading } = useForm(
    initialState,
    doSignup,
    validate
  );

  return (
    <FormPanel onSubmit={handleFormSubmit} disabled={isLoading} autoComplete="on">
      <FormContent subHeading="Create a secure password">
        <div className="login-modal-password-warning">
          <strong>⚠️ We cannot reset or recover your password.</strong>
          <p>Backing up your password is recommended.</p>
        </div>
        {/* Hidden username field for browser password manager */}
        <input
          type="text"
          name="username"
          id="signup-username"
          value={step1.username}
          autoComplete="username"
          readOnly
          tabIndex={-1}
          aria-hidden="true"
          style={{
            position: 'absolute',
            left: '-9999px',
            width: '1px',
            height: '1px',
            opacity: 0,
            pointerEvents: 'none'
          }}
        />
        <FormField
          name="password"
          label="Password"
          placeholder="Enter your password"
          value={fields.password}
          type="password"
          autoComplete="new-password"
          onChange={handleFieldChange}
          error={fieldErrors.password}
          size="lg"
        />
        <FormField
          name="passwordConfirm"
          label="Confirm password"
          placeholder="Confirm your password"
          value={fields.passwordConfirm}
          type="password"
          autoComplete="new-password"
          onChange={handleFieldChange}
          error={fieldErrors.passwordConfirm}
          size="lg"
        />
        <ul className="login-modal-password-checks">
          <li>
            <CheckMark success={fields.password.length >= 8} />
            At least 8 characters
          </li>
          <li>
            <CheckMark success={hasNumbers(fields.password) && hasNotNumbers(fields.password)} />
            Must contain letters and numbers
          </li>
          <li>
            <CheckMark success={!!fields.password && fields.password === fields.passwordConfirm} />
            Passwords must match
          </li>
        </ul>
        {error && <ErrorMessage>{error.message}</ErrorMessage>}
      </FormContent>
      <FormFooter>
        <FormField
          name="confirmPasswordUnrecoverable"
          label="I understand Sogni can't reset my password"
          type="checkbox"
          onChange={handleFieldChange}
          checked={fields.confirmPasswordUnrecoverable}
        />
        <button
          type="submit"
          className="login-modal-button primary"
          disabled={!fields.confirmPasswordUnrecoverable || isLoading}
        >
          Continue
        </button>
        <button type="button" className="login-modal-button secondary" onClick={onReturn}>
          Back
        </button>
      </FormFooter>
    </FormPanel>
  );
}

export default Step2;

