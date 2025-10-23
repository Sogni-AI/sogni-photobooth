import { useCallback, useEffect, useState } from 'react';
import useForm, { ErrorData } from '../../../hooks/useForm';
import FormField from '../../shared/FormField';
import { useSogniAuth } from '../../../services/sogniAuth';
import {
  ErrorMessage,
  FieldContainer,
  FormContent,
  FormFooter,
  FormPanel,
  LinkButton
} from './common';
import './styles.css';

interface LoginFields {
  username: string;
  password: string;
  remember: boolean;
}

const defaultState: LoginFields = {
  username: '',
  password: '',
  remember: false
};

async function validateLogin(fields: LoginFields) {
  const errors: Record<string, string> = {};
  const username = fields.username;
  if (!username) {
    errors.username = 'Username is required';
  } else if (!/^[a-zA-Z]/.test(username)) {
    errors.username = 'Username must start with a letter';
  } else if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    errors.username = 'Allowed characters are letters, numbers, hyphens, underscores, and periods';
  } else if (username.length < 4 || username.length > 20) {
    errors.username = 'Username must be between 4 and 20 characters long';
  }

  if (!fields.password) {
    errors.password = 'Password is required';
  }

  return errors;
}

function LoginError({ error }: { error: ErrorData | null }) {
  if (!error) {
    return null;
  }
  if (error.code === 105) {
    return <ErrorMessage>Invalid username or password</ErrorMessage>;
  }
  if (error.code === 128) {
    return (
      <ErrorMessage>
        {error.message} <br />{' '}
        <small>
          Please contact support on{' '}
          <a href="https://discord.com/invite/2JjzA2zrrc" target="_blank" rel="noreferrer">
            Discord
          </a>{' '}
          if you believe this is an error.
        </small>
      </ErrorMessage>
    );
  }
  return <ErrorMessage>{error.message}</ErrorMessage>;
}

interface Props {
  onSignup: () => void;
  onClose: () => void;
}

function LoginForm({ onSignup, onClose }: Props) {
  const { ensureClient, setAuthenticatedState } = useSogniAuth();
  const [autoComplete, setAutoComplete] = useState('on');

  const doLogin = useCallback(
    async (payload: LoginFields) => {
      const client = await ensureClient();

      await client.account.login(payload.username, payload.password, payload.remember);

      console.log('✅ Login successful!', {
        username: payload.username,
        clientAuthenticated: client.account.currentAccount?.isAuthenicated
      });

      // Store remember preference
      if (payload.remember) {
        localStorage.setItem('sogni-persist', 'true');
      } else {
        localStorage.removeItem('sogni-persist');
      }

      // Directly update auth state since client is already authenticated
      console.log('🔄 Setting authenticated state after login...');
      setAuthenticatedState(
        payload.username,
        client.account.currentAccount?.email
      );

      // Close modal on successful login
      console.log('✅ Login complete - closing modal');
      onClose();
    },
    [ensureClient, setAuthenticatedState, onClose]
  );

  const { fields, isLoading, error, fieldErrors, handleFieldChange, handleFormSubmit } = useForm(
    defaultState,
    doLogin,
    validateLogin
  );

  const handleUsernameChange = useCallback(
    (value: string) => {
      handleFieldChange(value.trim(), 'username');
    },
    [handleFieldChange]
  );

  const handleSignup = useCallback(() => {
    setAutoComplete('off');
    setTimeout(() => onSignup(), 50);
  }, [onSignup]);

  useEffect(() => {
    if (error) {
      handleFieldChange('', 'password');
    }
  }, [error, handleFieldChange]);

  return (
    <FormPanel onSubmit={handleFormSubmit} disabled={isLoading} autoComplete={autoComplete}>
      <FormContent subHeading="Welcome Back!">
        <FieldContainer>
          <FormField
            name="username"
            label="Username"
            value={fields.username}
            error={fieldErrors.username}
            type="text"
            placeholder="Username"
            autoComplete={autoComplete === 'off' ? 'off' : 'username'}
            onChange={handleUsernameChange}
            size="lg"
          />
          <FormField
            name="password"
            label="Password"
            value={fields.password}
            error={fieldErrors.password}
            type="password"
            placeholder="Enter your password"
            autoComplete={autoComplete === 'off' ? 'off' : 'current-password'}
            onChange={handleFieldChange}
            size="lg"
          />
          <FormField
            name="remember"
            label="Keep me logged in"
            checked={fields.remember}
            type="switch"
            onChange={handleFieldChange}
            error={fieldErrors.remember}
          />
          <a
            className="login-modal-forgot-password"
            target="_blank"
            href="https://docs.sogni.ai/sogni-studio-pro/how-to-recover-your-password"
            rel="noreferrer"
          >
            Forgot password?
          </a>
        </FieldContainer>
        <LoginError error={error} />
      </FormContent>
      <FormFooter>
        <button type="submit" className="login-modal-button primary" disabled={isLoading}>
          {isLoading ? 'Logging in...' : 'Log in'}
        </button>
        <LinkButton onClick={handleSignup}>New user? Create a free account</LinkButton>
      </FormFooter>
    </FormPanel>
  );
}

export default LoginForm;

