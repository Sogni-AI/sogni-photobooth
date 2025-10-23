import { SogniClient } from '@sogni-ai/sogni-client';
import { useEffect } from 'react';
import useApiAction from './useApiAction.ts';

/**
 * Similar to `useApiAction`, but executes the `fetchData` on mount and refreshes when the `fetchData` function changes
 * @param fetchData
 */
function useApiQuery<R = unknown>(fetchData: (api: SogniClient) => Promise<R>) {
  const { loading, error, data, execute } = useApiAction(fetchData);
  useEffect(() => {
    execute();
  }, [execute]);
  return {
    loading,
    error,
    data,
    refresh: execute
  };
}

export default useApiQuery;


