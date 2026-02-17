import { useState, useCallback, useRef } from 'react';
import type { SogniClient } from '@sogni-ai/sogni-client';
import type {
  JobStatus,
  ProjectStatus,
  JobHistoryData,
  JobHistoryItemRaw,
  ArchiveProject,
  ArchiveJob,
  ProjectHistoryState
} from '../types/projectHistory';

// 24 hours TTL for projects
const PROJECT_TTL = 24 * 60 * 60 * 1000;

// Get Sogni API URL based on environment
function getSogniRestUrl() {
  const hostname = window.location.hostname;
  const isLocalDev = hostname === 'localhost' || hostname === '127.0.0.1';
  const isStaging = hostname.includes('staging');
  
  if (isLocalDev) {
    return 'https://api-local.sogni.ai';
  } else if (isStaging) {
    return 'https://api-staging.sogni.ai';
  }
  
  return 'https://api.sogni.ai';
}

// Fetch 50 jobs at a time to reduce round trips and loading flashes
const PAGE_SIZE = 50;

// Map API job status to our JobStatus type
const JOB_STATUS_MAP: Record<string, JobStatus> = {
  created: 'pending',
  queued: 'pending',
  assigned: 'initiating',
  initiatingModel: 'initiating',
  jobStarted: 'processing',
  jobProgress: 'processing',
  jobCompleted: 'completed',
  jobError: 'failed'
};

function mapJobStatus(item: JobHistoryItemRaw): JobStatus {
  if (item.reason === 'artistCanceled') return 'canceled';
  return JOB_STATUS_MAP[item.status] || 'pending';
}

function mapProjectToArchive(item: JobHistoryItemRaw): ArchiveProject {
  let projectStatus: ProjectStatus;
  const jobStatus = mapJobStatus(item);
  switch (jobStatus) {
    case 'failed':
      projectStatus = 'failed';
      break;
    case 'completed':
      projectStatus = 'completed';
      break;
    case 'canceled':
      projectStatus = 'canceled';
      break;
    default:
      projectStatus = 'processing';
  }
  return {
    id: item.parentRequest.id,
    type: item.parentRequest.jobType === 'video' ? 'video' : item.parentRequest.jobType === 'audio' ? 'audio' : 'image',
    status: projectStatus,
    numberOfMedia: item.parentRequest.imageCount,
    jobs: [],
    createdAt: 0,
    width: item.parentRequest.width,
    height: item.parentRequest.height,
    model: {
      id: item.parentRequest.model.id,
      name: item.parentRequest.model.name
    }
  };
}

function mapJobToArchive(item: JobHistoryItemRaw): ArchiveJob {
  return {
    id: item.imgID,
    isNSFW: item.reason === 'sensitiveContent',
    projectId: item.parentRequest.id,
    type: item.parentRequest.jobType === 'video' ? 'video' : item.parentRequest.jobType === 'audio' ? 'audio' : 'image',
    status: mapJobStatus(item),
    createdAt: item.createTime,
    endTime: item.endTime
  };
}

interface UseProjectHistoryOptions {
  sogniClient: SogniClient | null;
}

export function useProjectHistory({ sogniClient }: UseProjectHistoryOptions) {
  const [state, setState] = useState<ProjectHistoryState>({
    projects: [],
    loading: false,
    hasMore: true,
    offset: 0,
    initialized: false,
    error: null
  });

  // Track if we're currently fetching to prevent duplicate requests
  const fetchingRef = useRef(false);
  // Track if we're prefetching the next page silently
  const prefetchingRef = useRef(false);

  // Fetch a page of job history
  const fetchPage = useCallback(async (offset: number = 0, isPrefetch: boolean = false) => {
    if (!sogniClient) {
      setState(prev => ({ ...prev, error: 'Not authenticated', loading: false }));
      return;
    }

    const walletAddress = sogniClient.account?.currentAccount?.walletAddress;
    if (!walletAddress) {
      setState(prev => ({ ...prev, error: 'No wallet address', loading: false }));
      return;
    }

    // Prevent duplicate fetches
    if (isPrefetch) {
      if (prefetchingRef.current) return;
      prefetchingRef.current = true;
    } else {
      if (fetchingRef.current) return;
      fetchingRef.current = true;
    }

    // Only show loading indicator for non-prefetch requests
    if (!isPrefetch) {
      setState(prev => ({ ...prev, loading: true, error: null }));
    }

    try {
      const params = {
        role: 'artist',
        address: walletAddress,
        limit: PAGE_SIZE,
        offset
      };

      const response = await sogniClient.apiClient.rest.get<{ data: JobHistoryData }>(
        '/v1/jobs/list',
        params
      );

      const { jobs, next } = response.data;

      setState(prev => {
        const minTimestamp = Date.now() - PROJECT_TTL;

        // Filter out jobs older than 24 hours based on endTime
        const recentJobs = jobs.filter((job) => job.endTime > minTimestamp);

        // Stop pagination if we've hit jobs older than 24 hours
        const hasOldJobs = jobs.length > 0 && recentJobs.length < jobs.length;

        // Build project index from existing projects
        const projectIndex = prev.projects.reduce(
          (acc: Record<string, ArchiveProject>, item) => {
            acc[item.id] = item;
            return acc;
          },
          {}
        );

        // Process new jobs
        for (const job of recentJobs) {
          // Skip jobs that triggered NSFW filter (failure state)
          if (job.triggeredNSFWFilter) {
            continue;
          }

          if (!projectIndex[job.parentRequest.id]) {
            projectIndex[job.parentRequest.id] = mapProjectToArchive(job);
          }

          const project = projectIndex[job.parentRequest.id];
          const archivedJob = mapJobToArchive(job);

          if (project.jobs.some((j) => j.id === archivedJob.id)) {
            project.jobs = project.jobs.map((j) =>
              j.id === job.imgID ? { ...j, ...archivedJob } : j
            );
          } else {
            project.jobs.push(archivedJob);
          }
        }

        // Process updated projects
        const updatedProjects = Object.values(projectIndex);
        updatedProjects.forEach((p) => {
          let createdAt = Date.now();
          let hasCompletedJobs = false;
          let hasCancelledJobs = false;
          let hasFailedJobs = false;
          let hasActiveJobs = false;

          p.jobs.forEach((job) => {
            createdAt = Math.min(createdAt, job.createdAt);
            switch (job.status) {
              case 'completed':
                hasCompletedJobs = true;
                break;
              case 'canceled':
                hasCancelledJobs = true;
                break;
              case 'failed':
                hasFailedJobs = true;
                break;
              default:
                hasActiveJobs = true;
            }
          });

          p.createdAt = createdAt;
          if (hasActiveJobs) {
            p.status = 'processing';
          } else if (hasCompletedJobs) {
            p.status = 'completed';
          } else if (hasCancelledJobs) {
            p.status = 'canceled';
          } else if (hasFailedJobs) {
            p.status = 'failed';
          }
        });

        // Sort by creation time (newest first)
        updatedProjects.sort((a, b) => b.createdAt - a.createdAt);

        // Filter to only include recent projects
        const filteredProjects = updatedProjects.filter(
          (p) => p.createdAt > minTimestamp
        );

        return {
          projects: filteredProjects,
          loading: false,
          initialized: true,
          offset: next,
          // No more data if: empty response, next is 0, offset didn't advance, or hit old jobs
          hasMore: jobs.length > 0 && next > 0 && next > prev.offset && !hasOldJobs,
          error: null
        };
      });
    } catch (error) {
      console.error('Failed to fetch project history:', error);
      if (!isPrefetch) {
        setState(prev => ({
          ...prev,
          loading: false,
          initialized: true,
          error: error instanceof Error ? error.message : 'Failed to fetch history'
        }));
      }
    } finally {
      if (isPrefetch) {
        prefetchingRef.current = false;
      } else {
        fetchingRef.current = false;
      }
    }
  }, [sogniClient]);

  // Initial fetch
  const refresh = useCallback(() => {
    setState({
      projects: [],
      loading: false,
      hasMore: true,
      offset: 0,
      initialized: false,
      error: null
    });
    fetchPage(0);
  }, [fetchPage]);

  // Load more (next page)
  const loadMore = useCallback(() => {
    if (!state.loading && state.hasMore) {
      fetchPage(state.offset);
    }
  }, [fetchPage, state.loading, state.hasMore, state.offset]);

  // Prefetch next page silently (no loading indicator)
  const prefetchNext = useCallback(() => {
    if (!state.loading && state.hasMore && !prefetchingRef.current) {
      fetchPage(state.offset, true);
    }
  }, [fetchPage, state.loading, state.hasMore, state.offset]);

  // Hide a job from the list
  const hideJob = useCallback((projectId: string, jobId: string) => {
    setState(prev => {
      const projects = prev.projects.map(p => {
        if (p.id === projectId) {
          const updatedJobs = p.jobs.map(j =>
            j.id === jobId ? { ...j, hidden: true } : j
          );
          const allHidden = updatedJobs.every(j => j.hidden);
          return {
            ...p,
            jobs: updatedJobs,
            hidden: allHidden
          };
        }
        return p;
      });
      return { ...prev, projects };
    });
  }, []);

  // Delete a project
  const deleteProject = useCallback(async (projectId: string) => {
    if (!sogniClient) {
      console.error('Cannot delete project: not authenticated');
      return false;
    }

    try {
      // Make a direct DELETE request to the Sogni API
      // Use credentials: 'include' to send cookies with the request
      const apiUrl = getSogniRestUrl();
      const response = await fetch(`${apiUrl}/v1/projects/${projectId}`, {
        method: 'DELETE',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to delete project: ${response.status} ${response.statusText}`);
      }
      
      // Mark project as scheduled for deletion
      setState(prev => {
        const projects = prev.projects.map(p =>
          p.id === projectId ? { ...p, scheduledDelete: true } : p
        );
        return { ...prev, projects };
      });
      
      return true;
    } catch (error) {
      console.error('Failed to delete project:', error);
      return false;
    }
  }, [sogniClient]);

  // Get visible projects (filter out hidden and scheduled for deletion)
  const visibleProjects = state.projects.filter(p => {
    if (p.hidden || p.scheduledDelete) return false;
    // Check if at least one job is visible (not hidden, not failed, and not canceled)
    return p.jobs.some(j => !j.hidden && j.status !== 'failed' && j.status !== 'canceled');
  });

  return {
    ...state,
    visibleProjects,
    refresh,
    loadMore,
    prefetchNext,
    hideJob,
    deleteProject
  };
}

export default useProjectHistory;

