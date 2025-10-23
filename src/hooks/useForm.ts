import { useCallback, useReducer, useRef } from 'react';
import { ApiError } from '@sogni-ai/sogni-client';

export interface ErrorData {
  code: number;
  message: string;
}

interface Form<F, R> {
  fields: F;
  status: 'idle' | 'validating' | 'submitting' | 'submitted' | 'error';
  result: R | null;
  fieldErrors: Record<string, string>;
  error: ErrorData | null;
  isLoading: boolean;
  isValid: boolean | null;
}

type Action<F, R> =
  | { type: 'change'; payload: Partial<F> }
  | { type: 'validate' }
  | { type: 'validation/success' }
  | { type: 'validation/error'; payload: Record<string, string> }
  | { type: 'submit' }
  | { type: 'submit/success'; payload: R }
  | { type: 'submit/error'; payload: ErrorData }
  | { type: 'clear_result' };

function reducer<F = unknown, R = unknown>(state: Form<F, R>, action: Action<F, R>): Form<F, R> {
  switch (action.type) {
    case 'change': {
      // Remove errors for changed fields
      const changedKeys = Object.keys(action.payload);
      const fieldErrors = { ...state.fieldErrors };
      changedKeys.forEach(key => {
        delete fieldErrors[key];
      });
      return {
        ...state,
        fields: {
          ...state.fields,
          ...action.payload
        },
        isValid: Object.keys(fieldErrors).length ? false : null,
        fieldErrors
      };
    }
    case 'validate':
      return {
        ...state,
        status: 'validating',
        error: null,
        isValid: null,
        isLoading: true
      };
    case 'validation/success':
      return {
        ...state,
        fieldErrors: {},
        status: 'idle',
        isValid: true,
        isLoading: false
      };
    case 'validation/error':
      return {
        ...state,
        fieldErrors: action.payload,
        status: 'error',
        isValid: false,
        isLoading: false
      };
    case 'submit':
      return {
        ...state,
        result: null,
        status: 'submitting',
        fieldErrors: {},
        error: null,
        isLoading: true
      };
    case 'submit/success':
      return {
        ...state,
        status: 'submitted',
        result: action.payload,
        isLoading: false
      };
    case 'submit/error':
      return {
        ...state,
        status: 'error',
        error: action.payload,
        isLoading: false
      };
    case 'clear_result':
      return {
        ...state,
        result: null,
        status: 'idle',
        error: null
      };
    default:
      return state;
  }
}

type ChangeHandler<F> = (delta: Partial<F>) => void;

type Validator<F> = (fields: F) => Promise<Record<string, string>>;

export type FormContext<F, R> = Form<F, R> & {
  handleChange: ChangeHandler<F>;
  handleSubmit: (fields?: Partial<F>) => Promise<void>;
  handleFieldChange: (value: unknown, name: string) => void;
  handleFormSubmit: (e?: React.FormEvent<HTMLFormElement>) => void;
  handleClearResult: () => void;
};

/**
 * Generic form logic hook
 * @param initialState - initial form state
 * @param formAction - async function to submit form
 * @param validate - optional function to validate form fields
 */
function useForm<F, R>(
  initialState: F,
  formAction: (form: F) => Promise<R>,
  validate?: Validator<F>
): FormContext<F, R> {
  const isSubmittingRef = useRef(false);
  const [form, dispatch] = useReducer(reducer<F, R>, {
    fields: initialState,
    status: 'idle',
    result: null,
    fieldErrors: {},
    error: null,
    isValid: null,
    isLoading: false
  } as Form<F, R>);

  const handleChange = useCallback<ChangeHandler<F>>((delta) => {
    dispatch({ type: 'change', payload: delta });
  }, []);

  const handleSubmit = useCallback(
    async (fields?: Partial<F>) => {
      if (isSubmittingRef.current) {
        return;
      }
      isSubmittingRef.current = true;
      if (fields) {
        dispatch({ type: 'change', payload: fields });
      }
      try {
        if (validate) {
          dispatch({ type: 'validate' });
          const errors = await validate(form.fields);
          if (Object.keys(errors).length) {
            dispatch({ type: 'validation/error', payload: errors });
            isSubmittingRef.current = false;
            return;
          }
          dispatch({ type: 'validation/success' });
        }
        dispatch({ type: 'submit' });
        const payload = fields ? { ...form.fields, ...fields } : form.fields;
        const result = await formAction(payload);
        isSubmittingRef.current = false;
        dispatch({ type: 'submit/success', payload: result });
      } catch (error) {
        console.error('Failed to submit form', error);
        isSubmittingRef.current = false;
        if (error instanceof ApiError) {
          dispatch({
            type: 'submit/error',
            payload: { code: error.payload.errorCode, message: error.message }
          });
          return;
        }
        dispatch({
          type: 'submit/error',
          payload: { code: 0, message: 'Whoops, something went wrong! Please try again.' }
        });
      }
    },
    [form.fields, formAction, validate]
  );

  const handleFieldChange = useCallback((value: unknown, name: string) => {
    dispatch({ type: 'change', payload: { [name]: value } as Partial<F> });
  }, []);

  const handleFormSubmit = useCallback(
    (e?: React.FormEvent<HTMLFormElement>) => {
      if (e) {
        e.preventDefault();
      }
      handleSubmit();
    },
    [handleSubmit]
  );

  const handleClearResult = useCallback(() => {
    dispatch({ type: 'clear_result' });
  }, []);

  return {
    ...form,
    handleChange,
    handleSubmit,
    handleFieldChange,
    handleFormSubmit,
    handleClearResult
  };
}

export default useForm;

