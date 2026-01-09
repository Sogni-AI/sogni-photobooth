import { useState, useCallback, useEffect } from 'react';
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

  const {
    visibleProjects,
    loading,
    hasMore,
    initialized,
    error,
    loadMore,
    refresh,
    hideJob,
    deleteProject
  } = useProjectHistory({ sogniClient });

  // Initial fetch on mount
  useEffect(() => {
    if (sogniClient) {
      refresh();
    }
  }, [sogniClient, refresh]);

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
        <h2>Recent Projects</h2>
        <button
          className="recent-projects-close-btn"
          onClick={onClose}
          title="Close"
        >
          ✕
        </button>
      </div>

      <div className="recent-projects-scroll-container">
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
        {initialized && !loading && visibleProjects.length === 0 && !error && (
          <div className="recent-projects-empty">
            <p>No recent projects found.</p>
            <p>Start creating to see your work here!</p>
          </div>
        )}

        {/* Project list */}
        <div className="recent-projects-list">
          {visibleProjects.map((project) => (
            <div key={project.id} className="recent-project">
              <div className="recent-project-heading">
                <div className="recent-project-title-wrapper">
                  <div className="recent-project-title">
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
                  {project.type === 'image' && (
                    <button
                      className="recent-project-reuse-btn"
                      onClick={() => handleReuseProject(project.id)}
                      title="Load images into Photo Gallery"
                    >
                      Reuse
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
          ))}
        </div>

        {/* Infinite scroll sentinel & loading indicator */}
        <div ref={sentinelRef} className="recent-projects-sentinel">
          {loading && initialized && (
            <div className="recent-projects-loading">
              <div className="recent-projects-spinner" />
              <span>Loading more projects...</span>
            </div>
          )}
        </div>

        {/* End of list message */}
        {initialized && !hasMore && visibleProjects.length > 0 && (
          <div className="recent-projects-end-message">
            You've reached the end of your recent projects
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

