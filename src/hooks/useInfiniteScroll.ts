import { useEffect, useRef, useCallback } from 'react';

interface UseInfiniteScrollOptions {
  /** Callback when the sentinel element comes into view */
  onLoadMore: () => void;
  /** Whether there are more items to load */
  hasMore: boolean;
  /** Whether currently loading */
  isLoading: boolean;
  /** Root margin for intersection observer (default: '100px') */
  rootMargin?: string;
  /** Threshold for intersection observer (default: 0) */
  threshold?: number;
}

/**
 * A hook that returns a ref to attach to a sentinel element at the bottom of a scrollable list.
 * When the sentinel comes into view, it triggers the onLoadMore callback.
 */
export function useInfiniteScroll({
  onLoadMore,
  hasMore,
  isLoading,
  rootMargin = '100px',
  threshold = 0
}: UseInfiniteScrollOptions) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const handleIntersect = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      const [entry] = entries;
      if (entry.isIntersecting && hasMore && !isLoading) {
        onLoadMore();
      }
    },
    [hasMore, isLoading, onLoadMore]
  );

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    // Clean up previous observer
    if (observerRef.current) {
      observerRef.current.disconnect();
    }

    // Create new observer
    observerRef.current = new IntersectionObserver(handleIntersect, {
      rootMargin,
      threshold
    });

    observerRef.current.observe(sentinel);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [handleIntersect, rootMargin, threshold]);

  return sentinelRef;
}

export default useInfiniteScroll;

