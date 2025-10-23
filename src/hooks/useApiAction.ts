import { SogniClient } from '@sogni-ai/sogni-client';
import { useCallback, useState } from 'react';
import useSogniApi from './useSogniApi.ts';

interface State<R> {
  loading: boolean;
  error: string | null;
  data: R | null;
}

type Action<P, R> =
  | ((api: SogniClient, params: P) => Promise<R>)
  | ((api: SogniClient) => Promise<R>);

/**
 * Custom hook to execute an API action. Accepts an action function that takes an API client and optional parameters.
 * @param action
 */
function useApiAction<A extends Action<any, any>, P = Parameters<A>[1], R = Awaited<ReturnType<A>>>(
  action: A
) {
  const api = useSogniApi();
  const [state, setState] = useState<State<R>>({
    loading: false,
    error: null,
    data: null
  });

  const execute = useCallback(
    async (params?: P): Promise<R | undefined> => {
      setState({ loading: true, error: null, data: null });
      return action(api, params)
        .then((data) => {
          setState({ loading: false, error: null, data });
          return data;
        })
        .catch((e) => {
          console.error(e);
          setState({ loading: false, error: e.message, data: null });
        });
    },
    [action, api]
  );

  const reset = useCallback(() => {
    setState({
      loading: false,
      error: null,
      data: null
    });
  }, []);

  return { ...state, execute, reset };
}

export default useApiAction;


