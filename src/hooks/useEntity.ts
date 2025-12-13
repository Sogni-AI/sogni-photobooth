/**
 * Hook for subscribing to DataEntity updates from Sogni SDK
 * This is the proper way to listen for balance and account changes
 */
import { useEffect, useState } from 'react';
import DataEntity from '@sogni-ai/sogni-client/dist/lib/DataEntity';

function isDataEntity(entity: unknown): entity is DataEntity<unknown> {
  return (
    entity !== null &&
    typeof entity === 'object' &&
    'on' in entity &&
    'off' in entity
  );
}

/**
 * This hook is used to get value from a data entity and update it when the entity is updated.
 * @param entity - The DataEntity to subscribe to
 * @param getter - A function that returns the value from the entity. Important: This function should be memoized to avoid unnecessary re-renders.
 */
function useEntity<E, V>(entity: E, getter: (entity: E) => V): V {
  const [value, setValue] = useState(getter(entity));

  useEffect(() => {
    setValue(getter(entity));
    if (!isDataEntity(entity)) {
      return;
    }
    
    // Subscribe to 'updated' events from the DataEntity
    // This is emitted by the SDK when data changes (e.g., balance updates)
    const unsubscribe = (entity as any).on('updated', () => {
      setValue(getter(entity));
    });
    
    return unsubscribe;
  }, [entity, getter]);

  return value;
}

export default useEntity;

