import { useState, useEffect, useCallback, useRef } from 'react';
import type { SogniClient } from '@sogni-ai/sogni-client';
import type { MediaURL } from '../types/projectHistory';
import { checkIfUrlExists } from '../utils/url';

// It is 1 hour, but set to 55 minutes just in case
const MEDIA_URL_TTL = 1000 * 60 * 55;

// Global cache for media URLs (persists across component mounts)
const mediaUrlCache = new Map<string, MediaURL>();

// Track hidden jobs to prevent re-fetching
const hiddenJobs = new Set<string>();

interface UseMediaUrlOptions {
  projectId: string;
  jobId: string;
  type: 'image' | 'video';
  sogniClient: SogniClient | null;
  enabled?: boolean;
  onHideJob?: (projectId: string, jobId: string) => void;
}

export function useMediaUrl({
  projectId,
  jobId,
  type,
  sogniClient,
  enabled = true,
  onHideJob
}: UseMediaUrlOptions) {
  const [url, setUrl] = useState<MediaURL | null>(() => {
    // Check cache on initial render
    return mediaUrlCache.get(jobId) || null;
  });

  // Track if this job has been hidden
  const hiddenRef = useRef(hiddenJobs.has(jobId));

  const refresh = useCallback(async () => {
    // Don't fetch if job is already hidden
    if (hiddenJobs.has(jobId)) {
      return;
    }

    if (!sogniClient || !enabled) return;

    // Check if we have a valid cached URL
    const cached = mediaUrlCache.get(jobId);
    if (cached && cached.expiresAt > Date.now() && !cached.refreshing && !cached.error) {
      setUrl(cached);
      return;
    }

    // Mark as refreshing
    const refreshingUrl: MediaURL = {
      value: cached?.value || null,
      updatedAt: cached?.updatedAt || 0,
      expiresAt: cached?.expiresAt || Date.now() + MEDIA_URL_TTL,
      projectId,
      jobId,
      type,
      refreshing: true
    };
    mediaUrlCache.set(jobId, refreshingUrl);
    setUrl(refreshingUrl);

    try {
      let mediaUrl: string;

      // Use the SDK projects API to get download URLs
      // Note: projectId is the parent request ID (job batch), jobId is the individual image/video ID
      if (type === 'video') {
        mediaUrl = await sogniClient.projects.mediaDownloadUrl({
          jobId: projectId,
          id: jobId,
          type: 'complete'
        });
      } else {
        mediaUrl = await sogniClient.projects.downloadUrl({
          jobId: projectId,
          imageId: jobId,
          type: 'complete'
        });
      }

      // Verify the URL is accessible using sogni-web's approach
      const isAvailable = await checkIfUrlExists(mediaUrl);

      // If media is not available, hide the job (like sogni-web does)
      if (!isAvailable) {
        hiddenJobs.add(jobId);
        hiddenRef.current = true;
        if (onHideJob) {
          onHideJob(projectId, jobId);
        }
      }

      const result: MediaURL = {
        value: isAvailable ? mediaUrl : null,
        updatedAt: Date.now(),
        expiresAt: Date.now() + MEDIA_URL_TTL,
        projectId,
        jobId,
        type,
        refreshing: false,
        error: isAvailable ? undefined : 'Media not available'
      };

      mediaUrlCache.set(jobId, result);
      setUrl(result);
    } catch (error) {
      console.error('Failed to fetch media URL:', error);
      
      // If the API returns an error (e.g., errorCode 122 "Project not found"),
      // hide the job as the media is permanently unavailable (like sogni-web)
      hiddenJobs.add(jobId);
      hiddenRef.current = true;
      if (onHideJob) {
        onHideJob(projectId, jobId);
      }

      const errorUrl: MediaURL = {
        value: null,
        updatedAt: Date.now(),
        expiresAt: Date.now() + MEDIA_URL_TTL,
        projectId,
        jobId,
        type,
        refreshing: false,
        error: 'Media not available'
      };
      mediaUrlCache.set(jobId, errorUrl);
      setUrl(errorUrl);
    }
  }, [sogniClient, projectId, jobId, type, enabled, onHideJob]);

  // Auto-refresh when needed
  useEffect(() => {
    if (!enabled) return;

    // Don't fetch if job is already hidden
    if (hiddenJobs.has(jobId)) {
      return;
    }

    const cached = mediaUrlCache.get(jobId);
    const needsRefresh = !cached || (cached.expiresAt < Date.now() && !cached.error);

    if (needsRefresh && !cached?.refreshing) {
      refresh();
    } else if (cached) {
      setUrl(cached);
    }
  }, [jobId, enabled, refresh]);

  return {
    url: url?.value,
    loading: url?.refreshing ?? true,
    error: url?.error,
    hidden: hiddenRef.current,
    refresh
  };
}

export default useMediaUrl;
