import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { SogniClient } from '@sogni-ai/sogni-client';
import { useProjectHistory } from '../../hooks/useProjectHistory';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import JobItem from './JobItem';
import MediaSlideshow from './MediaSlideshow';
import type { ArchiveProject } from '../../types/projectHistory';
import { pluralize, timeAgo } from '../../utils/string';
import './RecentProjects.css';

interface RecentProjectsProps {
  sogniClient: SogniClient | null;
  onClose: () => void;
  onReuseProject?: (projectId: string) => void;
}

const DISCLAIMER_STORAGE_KEY = 'sogni_recent_projects_disclaimer_dismissed';
const DELETE_CONFIRM_STORAGE_KEY = 'sogni_recent_projects_skip_delete_confirm';
const PINNED_PROJECTS_COOKIE_NAME = 'sogni_pinned_projects';

// 24 hours TTL for projects (same as useProjectHistory)
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

// Lightweight project data for counts (from /v1/projects/list)
interface ProjectListItem {
  id: string;
  jobType?: string;
  endTime: number;
}

interface ProjectCountsResponse {
  status: string;
  data: {
    projects: ProjectListItem[];
    next: number;
  };
}

// Full project response from /v1/projects/:id
interface ProjectByIdResponse {
  status: string;
  data: {
    project: {
      id: string;
      model: { id: string; name: string };
      imageCount: number;
      width: number;
      height: number;
      endTime: number;
      jobType?: string;
      workerJobs?: Array<{
        id: string;
        imgID: string;
        status: string;
        reason: string;
        createTime: number;
        endTime: number;
        triggeredNSFWFilter: boolean;
      }>;
      completedWorkerJobs?: Array<{
        id: string;
        imgID: string;
        status: string;
        reason: string;
        createTime: number;
        endTime: number;
        triggeredNSFWFilter: boolean;
      }>;
    };
  };
}

// Fetch a single project by ID
async function fetchProjectById(projectId: string): Promise<ArchiveProject | null> {
  try {
    const apiUrl = getSogniRestUrl();
    const response = await fetch(`${apiUrl}/v1/projects/${projectId}`, {
      credentials: 'include'
    });

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Project doesn't exist
      }
      throw new Error(`Failed to fetch project: ${response.status}`);
    }

    const data = await response.json() as ProjectByIdResponse;
    const project = data.data?.project;

    if (!project) return null;

    // Check if project is within TTL
    const minTimestamp = Date.now() - PROJECT_TTL;
    if (project.endTime < minTimestamp) {
      return null; // Project expired
    }

    // Map to ArchiveProject format
    // Combine workerJobs and completedWorkerJobs (old/completed projects have jobs in completedWorkerJobs)
    const allWorkerJobs = [
      ...(project.workerJobs || []),
      ...(project.completedWorkerJobs || [])
    ];
    
    const jobs = allWorkerJobs
      .filter(j => !j.triggeredNSFWFilter)
      .map(j => ({
        id: j.imgID,
        isNSFW: j.reason === 'sensitiveContent',
        projectId: project.id,
        type: (project.jobType === 'video' ? 'video' : 'image') as 'video' | 'image',
        status: j.status === 'jobCompleted' ? 'completed' as const :
                j.reason === 'artistCanceled' ? 'canceled' as const :
                j.status === 'jobError' ? 'failed' as const : 'pending' as const,
        createdAt: j.createTime,
        endTime: j.endTime
      }));

    return {
      id: project.id,
      type: project.jobType === 'video' ? 'video' : 'image',
      status: 'completed',
      numberOfMedia: project.imageCount,
      jobs,
      createdAt: Math.min(...jobs.map(j => j.createdAt), project.endTime),
      width: project.width,
      height: project.height,
      model: {
        id: project.model.id,
        name: project.model.name
      }
    };
  } catch (error) {
    console.error(`Failed to fetch pinned project ${projectId}:`, error);
    return null;
  }
}

// Cookie helper functions
function getPinnedProjectsFromCookie(): string[] {
  try {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === PINNED_PROJECTS_COOKIE_NAME && value) {
        return JSON.parse(decodeURIComponent(value));
      }
    }
  } catch {
    // Invalid cookie data, return empty
  }
  return [];
}

function setPinnedProjectsCookie(projectIds: string[]): void {
  try {
    const value = encodeURIComponent(JSON.stringify(projectIds));
    // Cookie expires in 24 hours (matching project TTL)
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = `${PINNED_PROJECTS_COOKIE_NAME}=${value}; expires=${expires}; path=/; SameSite=Lax`;
  } catch (error) {
    console.error('Failed to save pinned projects cookie:', error);
  }
}

function RecentProjects({ sogniClient, onClose, onReuseProject }: RecentProjectsProps) {
  const [slideshow, setSlideshow] = useState<{ project: ArchiveProject; jobId: string } | null>(
    null
  );
  const [showDisclaimer, setShowDisclaimer] = useState(() => {
    try {
      return !localStorage.getItem(DISCLAIMER_STORAGE_KEY);
    } catch {
      return true;
    }
  });
  const [deleteConfirm, setDeleteConfirm] = useState<{
    projectId: string;
    show: boolean;
    skipConfirm: boolean;
  }>({ projectId: '', show: false, skipConfirm: true });

  // Media type filter state
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video'>('all');

  // Project counts fetched from lightweight API
  const [projectCounts, setProjectCounts] = useState<{ all: number; image: number; video: number }>({
    all: 0,
    image: 0,
    video: 0
  });
  const [countsLoading, setCountsLoading] = useState(true);

  // Pinned projects state (loaded from cookies)
  const [pinnedProjectIds, setPinnedProjectIds] = useState<string[]>(() => {
    return getPinnedProjectsFromCookie();
  });

  // Fetched pinned projects (loaded explicitly by ID)
  const [fetchedPinnedProjects, setFetchedPinnedProjects] = useState<ArchiveProject[]>([]);

  // Track scroll container ref for preserving scroll position
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const {
    visibleProjects,
    loading,
    hasMore,
    initialized,
    error,
    loadMore,
    prefetchNext,
    refresh,
    hideJob,
    deleteProject
  } = useProjectHistory({ sogniClient });

  // Fetch project counts from lightweight API endpoint
  useEffect(() => {
    if (!sogniClient) {
      setCountsLoading(false);
      return;
    }

    const walletAddress = sogniClient.account?.currentAccount?.walletAddress;
    if (!walletAddress) {
      setCountsLoading(false);
      return;
    }

    const fetchCounts = async () => {
      try {
        const apiUrl = getSogniRestUrl();
        const minTimestamp = Date.now() - PROJECT_TTL;

        // Fetch up to 100 projects with minimal data (no jobs)
        const response = await fetch(
          `${apiUrl}/v1/projects/list?includeJobs=false&address=${walletAddress}&state=completed&limit=100`,
          { credentials: 'include' }
        );

        if (!response.ok) {
          throw new Error('Failed to fetch project counts');
        }

        const data = await response.json() as ProjectCountsResponse;
        const projects = data.data?.projects || [];

        // Filter to 24-hour window and count by type
        let imageCount = 0;
        let videoCount = 0;

        for (const project of projects) {
          if (project.endTime > minTimestamp) {
            if (project.jobType === 'video') {
              videoCount++;
            } else {
              imageCount++;
            }
          }
        }

        setProjectCounts({
          all: imageCount + videoCount,
          image: imageCount,
          video: videoCount
        });
      } catch (err) {
        console.error('Failed to fetch project counts:', err);
        // Fall back to showing counts from loaded data
      } finally {
        setCountsLoading(false);
      }
    };

    fetchCounts();
  }, [sogniClient]);

  // Fetch pinned projects by ID to ensure they're available even if not in paginated results
  useEffect(() => {
    if (pinnedProjectIds.length === 0) {
      return;
    }

    const fetchPinnedProjects = async () => {
      const validPins: string[] = [];
      const projects: ArchiveProject[] = [];

      // Fetch each pinned project by ID
      for (const projectId of pinnedProjectIds) {
        const project = await fetchProjectById(projectId);
        if (project) {
          validPins.push(projectId);
          projects.push(project);
        }
        // If project is null (404 or expired), it won't be added to validPins
      }

      // Update pinned IDs if any were invalid/expired
      if (validPins.length !== pinnedProjectIds.length) {
        setPinnedProjectIds(validPins);
        setPinnedProjectsCookie(validPins);
      }

      setFetchedPinnedProjects(projects);
    };

    fetchPinnedProjects();
  }, []); // Only run on mount - pinnedProjectIds from cookie

  // Filter and sort projects: apply media filter, then pinned first, then by creation date
  const sortedProjects = useMemo(() => {
    // Merge fetched pinned projects with visible projects (avoid duplicates)
    const visibleIds = new Set(visibleProjects.map(p => p.id));
    const allProjects = [
      ...visibleProjects,
      ...fetchedPinnedProjects.filter(p => !visibleIds.has(p.id))
    ];

    // Apply media filter
    const filteredProjects = mediaFilter === 'all'
      ? allProjects
      : allProjects.filter(p => p.type === mediaFilter);

    const pinnedSet = new Set(pinnedProjectIds);
    const pinned: ArchiveProject[] = [];
    const unpinned: ArchiveProject[] = [];

    for (const project of filteredProjects) {
      if (pinnedSet.has(project.id)) {
        pinned.push(project);
      } else {
        unpinned.push(project);
      }
    }

    // Sort pinned by order they were pinned (maintain cookie order)
    pinned.sort((a, b) => {
      return pinnedProjectIds.indexOf(a.id) - pinnedProjectIds.indexOf(b.id);
    });

    return [...pinned, ...unpinned];
  }, [visibleProjects, fetchedPinnedProjects, pinnedProjectIds, mediaFilter]);

  // Toggle pin/unpin a project
  const handleTogglePin = useCallback((projectId: string) => {
    // Save current scroll position before state update
    const scrollPos = scrollContainerRef.current?.scrollTop || 0;

    const isPinned = pinnedProjectIds.includes(projectId);

    if (!isPinned) {
      // When pinning, ensure the project is in fetchedPinnedProjects for persistence
      const projectInVisible = visibleProjects.find(p => p.id === projectId);
      if (projectInVisible) {
        setFetchedPinnedProjects(prev => {
          if (prev.some(p => p.id === projectId)) return prev;
          return [...prev, projectInVisible];
        });
      }
    }

    setPinnedProjectIds(prev => {
      let newPinned: string[];
      if (prev.includes(projectId)) {
        // Unpin
        newPinned = prev.filter(id => id !== projectId);
      } else {
        // Pin (add to beginning)
        newPinned = [projectId, ...prev];
      }
      setPinnedProjectsCookie(newPinned);
      return newPinned;
    });

    // Restore scroll position after state update (on next frame)
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollPos;
      }
    });
  }, [pinnedProjectIds, visibleProjects]);

  // Track if we should show the "loading more" indicator (with delay to avoid flash)
  const [showLoadingMore, setShowLoadingMore] = useState(false);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    
    if (loading && initialized) {
      // Delay showing the loader by 300ms to avoid flash for fast loads
      timeoutId = setTimeout(() => {
        setShowLoadingMore(true);
      }, 300);
    } else {
      setShowLoadingMore(false);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [loading, initialized]);

  // Initial fetch on mount
  useEffect(() => {
    if (sogniClient) {
      refresh();
    }
  }, [sogniClient, refresh]);

  // Prefetch next page when user has viewed 60% of loaded projects
  useEffect(() => {
    if (!initialized || !hasMore || loading) return;

    const triggerPrefetch = () => {
      const totalProjects = sortedProjects.length;
      if (totalProjects === 0) return;

      // Calculate how many projects the user has likely seen based on scroll position
      const container = scrollContainerRef.current;
      if (!container) return;

      const scrollTop = container.scrollTop;
      const scrollHeight = container.scrollHeight;
      const clientHeight = container.clientHeight;
      const scrollPercentage = scrollTop / (scrollHeight - clientHeight);

      // Prefetch when user has scrolled 60% through the list
      if (scrollPercentage > 0.6) {
        prefetchNext();
      }
    };

    const container = scrollContainerRef.current;
    if (container) {
      container.addEventListener('scroll', triggerPrefetch);
      return () => container.removeEventListener('scroll', triggerPrefetch);
    }
  }, [initialized, hasMore, loading, sortedProjects.length, prefetchNext]);

  // Handle deep linking - update URL when component opens
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('view') || url.searchParams.get('view') !== 'projects') {
      url.searchParams.set('view', 'projects');
      window.history.pushState({}, '', url.toString());
    }

    // Clean up URL when component unmounts
    return () => {
      const cleanUrl = new URL(window.location.href);
      if (cleanUrl.searchParams.get('view') === 'projects') {
        cleanUrl.searchParams.delete('view');
        window.history.replaceState({}, '', cleanUrl.toString());
      }
    };
  }, []);

  // Infinite scroll sentinel ref
  const sentinelRef = useInfiniteScroll({
    onLoadMore: loadMore,
    hasMore,
    isLoading: loading,
    rootMargin: '200px'
  });

  const handleJobView = useCallback((project: ArchiveProject, jobId: string) => {
    setSlideshow({ project, jobId });
  }, []);

  const handleCloseSlideshow = useCallback(() => {
    setSlideshow(null);
  }, []);

  const handleDismissDisclaimer = useCallback(() => {
    try {
      localStorage.setItem(DISCLAIMER_STORAGE_KEY, 'true');
    } catch (error) {
      console.error('Failed to save disclaimer dismissal:', error);
    }
    setShowDisclaimer(false);
  }, []);

  const handleDeleteClick = useCallback((projectId: string) => {
    // Check if user has chosen to skip confirmation
    const skipConfirm = localStorage.getItem(DELETE_CONFIRM_STORAGE_KEY) === 'true';
    
    if (skipConfirm) {
      handleDeleteConfirm(projectId);
    } else {
      setDeleteConfirm({ projectId, show: true, skipConfirm: true });
    }
  }, []);

  const handleDeleteConfirm = useCallback(async (projectId: string) => {
    const success = await deleteProject(projectId);
    if (!success) {
      alert('Failed to delete project. Please try again.');
    }
    setDeleteConfirm({ projectId: '', show: false, skipConfirm: true });
  }, [deleteProject]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirm({ projectId: '', show: false, skipConfirm: true });
  }, []);

  const handleSkipConfirmChange = useCallback((checked: boolean) => {
    setDeleteConfirm(prev => ({ ...prev, skipConfirm: checked }));
  }, []);

  const handleDeleteModalConfirm = useCallback(() => {
    if (deleteConfirm.skipConfirm) {
      try {
        localStorage.setItem(DELETE_CONFIRM_STORAGE_KEY, 'true');
      } catch (error) {
        console.error('Failed to save skip confirm preference:', error);
      }
    }
    handleDeleteConfirm(deleteConfirm.projectId);
  }, [deleteConfirm.projectId, deleteConfirm.skipConfirm, handleDeleteConfirm]);

  const handleReuseProject = useCallback((projectId: string) => {
    if (onReuseProject) {
      onReuseProject(projectId);
      onClose();
    }
  }, [onReuseProject, onClose]);

  return (
    <div className="recent-projects-page">
      <div className="recent-projects-header">
        <div className="recent-projects-header-left">
          <h2>Recent Projects</h2>
          {/* Media type filter - compact, left-aligned */}
          <div className="recent-projects-filter">
            <button
              className={`recent-projects-filter-btn${mediaFilter === 'all' ? ' active' : ''}`}
              onClick={() => setMediaFilter('all')}
            >
              All <span className="recent-projects-filter-count">{countsLoading ? '…' : projectCounts.all}</span>
            </button>
            <button
              className={`recent-projects-filter-btn${mediaFilter === 'image' ? ' active' : ''}`}
              onClick={() => setMediaFilter('image')}
            >
              Photos <span className="recent-projects-filter-count">{countsLoading ? '…' : projectCounts.image}</span>
            </button>
            <button
              className={`recent-projects-filter-btn${mediaFilter === 'video' ? ' active' : ''}`}
              onClick={() => setMediaFilter('video')}
            >
              Videos <span className="recent-projects-filter-count">{countsLoading ? '…' : projectCounts.video}</span>
            </button>
          </div>
        </div>
        <button
          className="recent-projects-close-btn"
          onClick={onClose}
          title="Close"
        >
          ✕
        </button>
      </div>

      <div ref={scrollContainerRef} className="recent-projects-scroll-container">
        {showDisclaimer && (
          <div className="recent-projects-desc-wrapper">
            <p className="recent-projects-desc">
              Your media is securely hosted only for delivery to you, then automatically purged (typically within 24 hours).
            </p>
            <button
              className="recent-projects-desc-close"
              onClick={handleDismissDisclaimer}
              title="Dismiss"
              aria-label="Dismiss disclaimer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="recent-projects-error">
            <p>{error}</p>
            <button onClick={refresh}>Try Again</button>
          </div>
        )}

        {/* Initial loading state */}
        {!initialized && loading && (
          <div className="recent-projects-loading">
            <div className="recent-projects-spinner" />
            <span>Loading your projects...</span>
          </div>
        )}

        {/* Empty state */}
        {initialized && !loading && sortedProjects.length === 0 && !error && (
          <div className="recent-projects-empty">
            {mediaFilter !== 'all' && visibleProjects.length > 0 ? (
              <>
                <p>No {mediaFilter === 'image' ? 'photo' : 'video'} projects found.</p>
                <p>Try switching to "All" to see all your projects.</p>
              </>
            ) : (
              <>
                <p>No recent projects found.</p>
                <p>Start creating to see your work here!</p>
              </>
            )}
          </div>
        )}

        {/* Project list */}
        <div className="recent-projects-list">
          {sortedProjects.map((project) => {
            const isPinned = pinnedProjectIds.includes(project.id);
            return (
            <div key={project.id} className={`recent-project${isPinned ? ' recent-project-pinned' : ''}`}>
              <div className="recent-project-heading">
                <div className="recent-project-title-wrapper">
                  <div className="recent-project-title">
                    {isPinned && <span className="recent-project-pin-badge">📌</span>}
                    {project.model.name}{' '}
                    <span>
                      ({project.numberOfMedia} {pluralize(project.numberOfMedia, project.type === 'video' ? 'video' : 'image')})
                    </span>
                  </div>
                  <div className="recent-project-date">
                    Created {timeAgo(project.createdAt)}
                  </div>
                </div>
                <div className="recent-project-actions">
                  <button
                    className={`recent-project-pin-btn${isPinned ? ' recent-project-pin-btn-active' : ''}`}
                    onClick={() => handleTogglePin(project.id)}
                    title={isPinned ? 'Unpin project' : 'Pin project to top'}
                  >
                    {isPinned ? '📌' : '📍'}
                  </button>
                  {project.type === 'image' && (
                    <button
                      className="recent-project-reuse-btn"
                      onClick={() => handleReuseProject(project.id)}
                      title="Load images into Photo Gallery"
                    >
                      Remix
                    </button>
                  )}
                  <button
                    className="recent-project-delete-btn"
                    onClick={() => handleDeleteClick(project.id)}
                    title="Delete project"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <div className="recent-project-jobs-carousel">
                {project.jobs.map((job) => {
                  if (job.hidden || job.status === 'failed' || job.status === 'canceled') {
                    return null;
                  }
                  const aspect = project.width / project.height;
                  return (
                    <JobItem
                      key={job.id}
                      job={job}
                      aspect={aspect}
                      sogniClient={sogniClient}
                      onView={() => handleJobView(project, job.id)}
                      onHideJob={hideJob}
                      modelName={project.model.name}
                    />
                  );
                })}
              </div>
            </div>
          );
          })}
        </div>

        {/* Infinite scroll sentinel & loading indicator */}
        <div ref={sentinelRef} className="recent-projects-sentinel">
          {showLoadingMore && (
            <div className="recent-projects-loading">
              <div className="recent-projects-spinner" />
              <span>Loading more projects...</span>
            </div>
          )}
        </div>

        {/* End of list message */}
        {initialized && !hasMore && sortedProjects.length > 0 && (
          <div className="recent-projects-end-message">
            {mediaFilter !== 'all'
              ? `You've reached the end of your ${mediaFilter === 'image' ? 'photo' : 'video'} projects`
              : "You've reached the end of your recent projects"}
          </div>
        )}
      </div>

      {/* Media slideshow modal */}
      {slideshow && sogniClient && (
        <MediaSlideshow
          project={slideshow.project}
          initialJobId={slideshow.jobId}
          sogniClient={sogniClient}
          onClose={handleCloseSlideshow}
        />
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm.show && (
        <div className="recent-projects-modal-overlay" onClick={handleDeleteCancel}>
          <div className="recent-projects-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Delete Project</h3>
            <p>Are you sure? This content will be deleted forever.</p>
            <div className="recent-projects-modal-checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={deleteConfirm.skipConfirm}
                  onChange={(e) => handleSkipConfirmChange(e.target.checked)}
                />
                <span>Don't ask me again</span>
              </label>
            </div>
            <div className="recent-projects-modal-actions">
              <button
                className="recent-projects-modal-btn recent-projects-modal-btn-cancel"
                onClick={handleDeleteCancel}
              >
                Cancel
              </button>
              <button
                className="recent-projects-modal-btn recent-projects-modal-btn-confirm"
                onClick={handleDeleteModalConfirm}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RecentProjects;

