import { useEffect, useRef, useState } from 'react';

interface UseLazyLoadOptions {
  /** Root margin for intersection observer (default: '50px') */
  rootMargin?: string;
  /** Threshold for intersection observer (default: 0) */
  threshold?: number;
  /** Whether to keep the element "visible" once it has been seen (default: true) */
  once?: boolean;
}

/**
 * A hook that returns a ref and visibility state for lazy loading content.
 * The element is considered visible when it enters the viewport.
 */
export function useLazyLoad({
  rootMargin = '50px',
  threshold = 0,
  once = true
}: UseLazyLoadOptions = {}) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const hasBeenVisible = useRef(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    // If already visible and using "once" mode, no need to observe
    if (once && hasBeenVisible.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsVisible(true);
          hasBeenVisible.current = true;
          if (once) {
            observer.disconnect();
          }
        } else if (!once) {
          setIsVisible(false);
        }
      },
      { rootMargin, threshold }
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, [rootMargin, threshold, once]);

  return { ref: elementRef, isVisible };
}

export default useLazyLoad;

