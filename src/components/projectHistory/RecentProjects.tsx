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

function RecentProjects({ sogniClient, onClose, onReuseProject }: RecentProjectsProps) {
  const [slideshow, setSlideshow] = useState<{ project: ArchiveProject; jobId: string } | null>(
    null
  );

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

  const handleDeleteProject = useCallback(async (projectId: string) => {
    const success = await deleteProject(projectId);
    if (!success) {
      alert('Failed to delete project. Please try again.');
    }
  }, [deleteProject]);

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
        <p className="recent-projects-desc">
          Your media is securely hosted only for delivery to you, then automatically purged (typically within 24 hours).
        </p>

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
                <div className="recent-project-title">
                  {project.model.name}{' '}
                  <span>
                    ({project.numberOfMedia} {pluralize(project.numberOfMedia, project.type === 'video' ? 'video' : 'image')})
                  </span>
                </div>
                <div className="recent-project-actions">
                  <div className="recent-project-date">
                    Created {timeAgo(project.createdAt)}
                  </div>
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
                    onClick={() => handleDeleteProject(project.id)}
                    title="Delete project"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              <div className="recent-project-jobs">
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
    </div>
  );
}

export default RecentProjects;

