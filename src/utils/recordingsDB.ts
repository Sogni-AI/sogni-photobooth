/**
 * Recordings IndexedDB Utilities
 *
 * Provides persistent storage for video and audio recordings using IndexedDB.
 * Stores the last recording of each type so users can reuse them without re-recording.
 */

const DB_NAME = 'sogni_recordings';
const DB_VERSION = 1;
const RECORDINGS_STORE = 'recordings';

// Recording types
export type RecordingType = 'video' | 'audio';

export interface StoredRecording {
  type: RecordingType;
  blob: Blob;
  mimeType: string;
  duration: number;
  aspectRatio?: string;
  thumbnailUrl?: string;
  createdAt: number;
}

let dbInstance: IDBDatabase | null = null;

/**
 * Open the IndexedDB database, creating stores if needed
 */
function openDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[RecordingsDB] Failed to open database:', request.error);
      reject(new Error('Failed to open recordings database'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;

      // Handle database closing unexpectedly
      dbInstance.onclose = () => {
        dbInstance = null;
      };

      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Create recordings store
      if (!db.objectStoreNames.contains(RECORDINGS_STORE)) {
        const store = db.createObjectStore(RECORDINGS_STORE, { keyPath: 'type' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
  });
}

/**
 * Generate a thumbnail from a video blob
 */
async function generateVideoThumbnail(blob: Blob): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      const video = document.createElement('video');
      const url = URL.createObjectURL(blob);
      video.src = url;
      video.muted = true;
      video.preload = 'auto';

      video.onloadeddata = () => {
        // Seek to 0.5 seconds or start
        video.currentTime = Math.min(0.5, video.duration / 2);
      };

      video.onseeked = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 120;
          canvas.height = 160;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);
            URL.revokeObjectURL(url);
            video.remove();
            resolve(thumbnailUrl);
          } else {
            URL.revokeObjectURL(url);
            video.remove();
            resolve(undefined);
          }
        } catch (e) {
          URL.revokeObjectURL(url);
          video.remove();
          resolve(undefined);
        }
      };

      video.onerror = () => {
        URL.revokeObjectURL(url);
        video.remove();
        resolve(undefined);
      };

      // Timeout
      setTimeout(() => {
        URL.revokeObjectURL(url);
        video.remove();
        resolve(undefined);
      }, 5000);
    } catch (e) {
      resolve(undefined);
    }
  });
}

/**
 * Save a recording to IndexedDB
 */
export async function saveRecording(
  type: RecordingType,
  blob: Blob,
  duration: number,
  aspectRatio?: string
): Promise<void> {
  const db = await openDB();

  // Generate thumbnail for video
  let thumbnailUrl: string | undefined;
  if (type === 'video') {
    thumbnailUrl = await generateVideoThumbnail(blob);
  }

  const recording: StoredRecording = {
    type,
    blob,
    mimeType: blob.type,
    duration,
    aspectRatio,
    thumbnailUrl,
    createdAt: Date.now()
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RECORDINGS_STORE, 'readwrite');
    const store = transaction.objectStore(RECORDINGS_STORE);

    // Use put to overwrite existing recording of same type
    const request = store.put(recording);

    request.onsuccess = () => {
      console.log(`[RecordingsDB] Saved ${type} recording (${(blob.size / 1024 / 1024).toFixed(2)} MB)`);
      resolve();
    };

    request.onerror = () => {
      console.error('[RecordingsDB] Failed to save recording:', request.error);
      reject(new Error('Failed to save recording'));
    };
  });
}

/**
 * Get the last recording of a specific type
 */
export async function getLastRecording(type: RecordingType): Promise<StoredRecording | null> {
  try {
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(RECORDINGS_STORE, 'readonly');
      const store = transaction.objectStore(RECORDINGS_STORE);
      const request = store.get(type);

      request.onsuccess = () => {
        const recording = request.result as StoredRecording | undefined;
        if (recording) {
          console.log(`[RecordingsDB] Retrieved ${type} recording (${(recording.blob.size / 1024 / 1024).toFixed(2)} MB)`);
          resolve(recording);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => {
        console.error('[RecordingsDB] Failed to get recording:', request.error);
        reject(new Error('Failed to get recording'));
      };
    });
  } catch (e) {
    console.error('[RecordingsDB] Error getting recording:', e);
    return null;
  }
}

/**
 * Delete a recording
 */
export async function deleteRecording(type: RecordingType): Promise<void> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(RECORDINGS_STORE, 'readwrite');
    const store = transaction.objectStore(RECORDINGS_STORE);
    const request = store.delete(type);

    request.onsuccess = () => {
      console.log(`[RecordingsDB] Deleted ${type} recording`);
      resolve();
    };

    request.onerror = () => {
      console.error('[RecordingsDB] Failed to delete recording:', request.error);
      reject(new Error('Failed to delete recording'));
    };
  });
}

/**
 * Check if a recording exists
 */
export async function hasRecording(type: RecordingType): Promise<boolean> {
  try {
    const recording = await getLastRecording(type);
    return recording !== null;
  } catch {
    return false;
  }
}

/**
 * Get recording info without the blob (for thumbnails, etc.)
 */
export async function getRecordingInfo(type: RecordingType): Promise<Omit<StoredRecording, 'blob'> | null> {
  try {
    const recording = await getLastRecording(type);
    if (recording) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { blob, ...info } = recording;
      return {
        ...info,
        // Add blob size for display
        // @ts-expect-error - adding extra property for display
        blobSize: recording.blob.size
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if IndexedDB is supported
 */
export function isRecordingsDBSupported(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Convert stored recording to File object for API compatibility
 */
export function recordingToFile(recording: StoredRecording): File {
  const extension = recording.type === 'video' ? 'webm' : 'webm';
  const filename = `${recording.type}-recording-${Date.now()}.${extension}`;
  return new File([recording.blob], filename, { type: recording.mimeType });
}
