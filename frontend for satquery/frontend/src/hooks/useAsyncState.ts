import { useCallback, useRef, useState } from 'react';

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

type Options<T> = {
  immediate?: boolean;
  keepPreviousData?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: string) => void;
};

export function useAsyncState<T>(
  asyncFn: (...args: any[]) => Promise<T>,
  initialData: T | null = null,
  options: Options<T> = {}
) {
  const { keepPreviousData = true, onSuccess, onError } = options;
  const [state, setState] = useState<AsyncState<T>>({
    data: initialData,
    loading: false,
    error: null,
  });
  const pendingRef = useRef(false);
  const lastArgsRef = useRef<any[] | null>(null);

  const execute = useCallback(
    async (...args: any[]) => {
      if (pendingRef.current) return null;
      pendingRef.current = true;
      lastArgsRef.current = args;
      setState(prev => ({
        data: keepPreviousData ? prev.data : null,
        loading: true,
        error: null,
      }));
      try {
        const result = await asyncFn(...args);
        setState({ data: result, loading: false, error: null });
        onSuccess?.(result);
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err) || 'Request failed';
        setState(prev => ({
          data: keepPreviousData ? prev.data : prev.data,
          loading: false,
          error: message,
        }));
        onError?.(message);
        return null;
      } finally {
        pendingRef.current = false;
      }
    },
    [asyncFn, keepPreviousData, onSuccess, onError]
  );

  const retry = useCallback(() => {
    if (lastArgsRef.current) return execute(...lastArgsRef.current);
    return execute();
  }, [execute]);

  const reset = useCallback(() => {
    setState({ data: initialData, loading: false, error: null });
    pendingRef.current = false;
  }, [initialData]);

  const setData = useCallback((data: T | null) => {
    setState(prev => ({ ...prev, data }));
  }, []);

  return {
    data: state.data,
    loading: state.loading,
    error: state.error,
    execute,
    retry,
    reset,
    setData,
    isLoading: state.loading,
    isError: !!state.error,
  };
}

export default useAsyncState;
