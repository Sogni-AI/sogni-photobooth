import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import type { SogniClient } from '@sogni-ai/sogni-client';
import { useProjectHistory } from '../../hooks/useProjectHistory';
import { useLocalProjects } from '../../hooks/useLocalProjects';
import { useInfiniteScroll } from '../../hooks/useInfiniteScroll';
import JobItem from './JobItem';
import MediaSlideshow from './MediaSlideshow';
import type { ArchiveProject } from '../../types/projectHistory';
import type { LocalProject } from '../../types/localProjects';
import { LOCAL_PROJECT_MAX_IMAGES, LOCAL_PROJECT_SUPPORTED_EXTENSIONS } from '../../types/localProjects';
import { pluralize, timeAgo } from '../../utils/string';
import { downloadImagesAsZip, downloadVideosAsZip } from '../../utils/bulkDownload';
import './RecentProjects.css';

interface RecentProjectsProps {
  sogniClient: SogniClient | null;
  onClose: () => void;
  onReuseProject?: (projectId: string) => void;
  onReuseLocalProject?: (projectId: string) => void;
  onStartNewProject?: () => void;
  onAdjustImage?: (imageUrl: string) => void;
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

function RecentProjects({
  sogniClient,
  onClose,
  onReuseProject,
  onReuseLocalProject,
  onStartNewProject,
  onAdjustImage
}: RecentProjectsProps) {
  const [slideshow, setSlideshow] = useState<{ project: ArchiveProject; jobId: string } | null>(
    null
  );

  // Local project slideshow state
  const [localSlideshow, setLocalSlideshow] = useState<{
    projectName: string;
    images: Array<{ id: string; url: string; width: number; height: number; filename: string }>;
    currentIndex: number;
  } | null>(null);
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

  // File input ref for local project image uploads
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ============================================================================
  // Local Projects State & Handlers
  // ============================================================================
  const {
    projects: localProjects,
    initialized: localProjectsInitialized,
    createProject: createLocalProject,
    renameProject: renameLocalProject,
    deleteProject: deleteLocalProject,
    addImages: addLocalImages,
    deleteImage: deleteLocalImage,
    getProjectImageUrls: getLocalProjectImageUrls,
    reorderImages: reorderLocalImages,
    isSupported: localProjectsSupported
  } = useLocalProjects();

  // Local project creation dialog state
  const [showCreateLocalProject, setShowCreateLocalProject] = useState(false);
  const [newLocalProjectName, setNewLocalProjectName] = useState('');
  const [creatingLocalProject, setCreatingLocalProject] = useState(false);

  // Local project rename dialog state
  const [renameDialog, setRenameDialog] = useState<{
    show: boolean;
    projectId: string;
    currentName: string;
    newName: string;
  }>({ show: false, projectId: '', currentName: '', newName: '' });

  // Local project delete confirmation state
  const [localDeleteConfirm, setLocalDeleteConfirm] = useState<{
    show: boolean;
    projectId: string;
    projectName: string;
  }>({ show: false, projectId: '', projectName: '' });

  // Local project image upload state
  const [uploadingToProject, setUploadingToProject] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ added: number; total: number } | null>(null);


  // Inline expanded local project state (shows all images with delete/reorder)
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [expandedProjectImages, setExpandedProjectImages] = useState<
    Record<string, Array<{ id: string; url: string; width: number; height: number; filename: string }>>
  >({});

  // Drag-and-drop reordering state
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [dragOverImageId, setDragOverImageId] = useState<string | null>(null);

  // Cloud project download state
  const [downloadingProject, setDownloadingProject] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number; message: string } | null>(null);

  // Auto-load all images for local projects when initialized
  useEffect(() => {
    if (!localProjectsInitialized) return;

    const loadAllProjectImages = async () => {
      for (const project of localProjects) {
        // Skip if already loaded
        if (expandedProjectImages[project.id]) continue;
        // Skip empty projects
        if (project.imageIds.length === 0) continue;

        try {
          const images = await getLocalProjectImageUrls(project.id);
          setExpandedProjectImages(prev => ({
            ...prev,
            [project.id]: images
          }));
        } catch (error) {
          console.error(`Failed to load images for project ${project.id}:`, error);
        }
      }
    };

    loadAllProjectImages();
  }, [localProjects, localProjectsInitialized, getLocalProjectImageUrls]); // Note: removed expandedProjectImages from deps to avoid re-running

  // Handle creating a new local project
  const handleCreateLocalProject = useCallback(async () => {
    if (!newLocalProjectName.trim() || creatingLocalProject) return;

    setCreatingLocalProject(true);
    try {
      const project = await createLocalProject(newLocalProjectName.trim());
      if (project) {
        setShowCreateLocalProject(false);
        setNewLocalProjectName('');
        // Automatically open file picker for the new project
        setUploadingToProject(project.id);
        setTimeout(() => {
          fileInputRef.current?.click();
        }, 100);
      }
    } finally {
      setCreatingLocalProject(false);
    }
  }, [newLocalProjectName, creatingLocalProject, createLocalProject]);

  // Handle renaming a local project
  const handleRenameLocalProject = useCallback(async () => {
    if (!renameDialog.newName.trim() || renameDialog.newName === renameDialog.currentName) {
      setRenameDialog({ show: false, projectId: '', currentName: '', newName: '' });
      return;
    }

    await renameLocalProject(renameDialog.projectId, renameDialog.newName.trim());
    setRenameDialog({ show: false, projectId: '', currentName: '', newName: '' });
  }, [renameDialog, renameLocalProject]);

  // Handle deleting a local project
  const handleDeleteLocalProject = useCallback(async () => {
    if (!localDeleteConfirm.projectId) return;

    await deleteLocalProject(localDeleteConfirm.projectId);
    setLocalDeleteConfirm({ show: false, projectId: '', projectName: '' });
  }, [localDeleteConfirm.projectId, deleteLocalProject]);

  // Handle file selection for local project image upload
  const handleFileSelect = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0 || !uploadingToProject) {
      setUploadingToProject(null);
      return;
    }

    const projectId = uploadingToProject;
    const fileArray = Array.from(files);
    setUploadProgress({ added: 0, total: fileArray.length });

    try {
      const result = await addLocalImages(projectId, fileArray);
      setUploadProgress({ added: result.added, total: fileArray.length });

      // Refresh images if this project has images loaded (in edit mode or carousel)
      if (expandedProjectImages[projectId] || expandedProjectId === projectId) {
        const refreshedImages = await getLocalProjectImageUrls(projectId);
        setExpandedProjectImages(prev => ({
          ...prev,
          [projectId]: refreshedImages
        }));
      }

      // Show result briefly then clear
      setTimeout(() => {
        setUploadProgress(null);
        setUploadingToProject(null);
      }, 2000);
    } catch {
      setUploadProgress(null);
      setUploadingToProject(null);
    }

    // Reset file input
    event.target.value = '';
  }, [uploadingToProject, addLocalImages, expandedProjectImages, expandedProjectId, getLocalProjectImageUrls]);

  // Handle clicking upload button on a local project
  const handleUploadClick = useCallback((projectId: string) => {
    setUploadingToProject(projectId);
    fileInputRef.current?.click();
  }, []);

  // Handle reusing a local project (loading into gallery)
  const handleReuseLocalProject = useCallback((projectId: string) => {
    if (onReuseLocalProject) {
      onReuseLocalProject(projectId);
      onClose();
    }
  }, [onReuseLocalProject, onClose]);

  // Handle starting a new cloud project
  const handleStartNewProject = useCallback(() => {
    if (onStartNewProject) {
      onStartNewProject();
      onClose();
    }
  }, [onStartNewProject, onClose]);

  // Handle toggling inline edit mode for a local project
  const handleToggleExpandProject = useCallback(async (project: LocalProject) => {
    // If already in edit mode, exit edit mode (but keep images loaded for carousel)
    if (expandedProjectId === project.id) {
      setExpandedProjectId(null);
      setDraggedImageId(null);
      setDragOverImageId(null);
      return;
    }

    // Always reload images from DB when entering edit mode to ensure correct order
    try {
      const images = await getLocalProjectImageUrls(project.id);
      setExpandedProjectImages(prev => ({
        ...prev,
        [project.id]: images
      }));
      setExpandedProjectId(project.id);
    } catch (error) {
      console.error('Failed to load project images:', error);
    }
  }, [expandedProjectId, getLocalProjectImageUrls]);

  // Handle closing inline expanded view
  const handleCollapseProject = useCallback(() => {
    // Just exit edit mode - keep images loaded for carousel view
    setExpandedProjectId(null);
    setDraggedImageId(null);
    setDragOverImageId(null);
  }, []);

  // Handle deleting an individual image (no confirmation)
  const handleDeleteImage = useCallback(async (imageId: string, projectId: string) => {
    if (!imageId || !projectId) return;

    const success = await deleteLocalImage(imageId);
    if (success) {
      // Update expanded view
      setExpandedProjectImages(prev => {
        const projectImages = prev[projectId];
        if (!projectImages) return prev;
        return {
          ...prev,
          [projectId]: projectImages.filter(img => img.id !== imageId)
        };
      });
    }
  }, [deleteLocalImage]);

  // Drag and drop handlers
  const handleDragStart = useCallback((imageId: string) => {
    setDraggedImageId(imageId);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, imageId: string) => {
    e.preventDefault();
    if (draggedImageId && draggedImageId !== imageId) {
      setDragOverImageId(imageId);
    }
  }, [draggedImageId]);

  const handleDragLeave = useCallback(() => {
    setDragOverImageId(null);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent, targetImageId: string, projectId: string) => {
    e.preventDefault();
    const projectImages = expandedProjectImages[projectId];
    if (!draggedImageId || !projectImages || draggedImageId === targetImageId) {
      setDraggedImageId(null);
      setDragOverImageId(null);
      return;
    }

    // Reorder the images
    const currentOrder = projectImages.map(img => img.id);
    const draggedIndex = currentOrder.indexOf(draggedImageId);
    const targetIndex = currentOrder.indexOf(targetImageId);

    if (draggedIndex === -1 || targetIndex === -1) {
      setDraggedImageId(null);
      setDragOverImageId(null);
      return;
    }

    // Create new order
    const newOrder = [...currentOrder];
    newOrder.splice(draggedIndex, 1);
    newOrder.splice(targetIndex, 0, draggedImageId);

    // Update database
    const success = await reorderLocalImages(projectId, newOrder);
    if (success) {
      // Update expanded view with new order
      const reorderedImages = newOrder.map(id =>
        projectImages.find(img => img.id === id)!
      ).filter(Boolean);

      setExpandedProjectImages(prev => ({
        ...prev,
        [projectId]: reorderedImages
      }));
    }

    setDraggedImageId(null);
    setDragOverImageId(null);
  }, [draggedImageId, expandedProjectImages, reorderLocalImages]);

  const handleDragEnd = useCallback(() => {
    setDraggedImageId(null);
    setDragOverImageId(null);
  }, []);

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

  // Handle opening local project slideshow
  const handleLocalImageClick = useCallback((
    projectName: string,
    images: Array<{ id: string; url: string; width: number; height: number; filename: string }>,
    clickedIndex: number
  ) => {
    setLocalSlideshow({ projectName, images, currentIndex: clickedIndex });
  }, []);

  // Handle closing local slideshow
  const handleCloseLocalSlideshow = useCallback(() => {
    setLocalSlideshow(null);
  }, []);

  // Handle navigating local slideshow
  const handleLocalSlideshowNav = useCallback((direction: 'prev' | 'next') => {
    if (!localSlideshow) return;
    const { images, currentIndex } = localSlideshow;
    let newIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (newIndex < 0) newIndex = images.length - 1;
    if (newIndex >= images.length) newIndex = 0;
    setLocalSlideshow({ ...localSlideshow, currentIndex: newIndex });
  }, [localSlideshow]);

  // Handle adjust image callback
  const handleAdjustImage = useCallback((imageUrl: string) => {
    if (onAdjustImage) {
      onAdjustImage(imageUrl);
      onClose();
    }
  }, [onAdjustImage, onClose]);

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
    } else {
      // If this was a pinned project, unpin it
      if (pinnedProjectIds.includes(projectId)) {
        const newPinnedIds = pinnedProjectIds.filter(id => id !== projectId);
        setPinnedProjectIds(newPinnedIds);
        setPinnedProjectsCookie(newPinnedIds);
        // Also remove from fetched pinned projects
        setFetchedPinnedProjects(prev => prev.filter(p => p.id !== projectId));
      }
    }
    setDeleteConfirm({ projectId: '', show: false, skipConfirm: true });
  }, [deleteProject, pinnedProjectIds]);

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

  // Handle downloading all media from a cloud project
  const handleDownloadProject = useCallback(async (project: ArchiveProject) => {
    if (!sogniClient || downloadingProject) return;

    setDownloadingProject(project.id);
    setDownloadProgress({ current: 0, total: 0, message: 'Preparing download...' });

    try {
      // Get all completed, non-hidden jobs
      const completedJobs = project.jobs.filter(
        job => job.status === 'completed' && !job.hidden && !job.isNSFW
      );

      if (completedJobs.length === 0) {
        setDownloadProgress({ current: 0, total: 0, message: 'No media available to download' });
        setTimeout(() => {
          setDownloadingProject(null);
          setDownloadProgress(null);
        }, 2000);
        return;
      }

      // Helper to get download URL using SDK (same as useMediaUrl hook)
      const getMediaUrl = async (job: typeof completedJobs[0]): Promise<string> => {
        if (project.type === 'video') {
          return await sogniClient.projects.mediaDownloadUrl({
            jobId: project.id,
            id: job.id,
            type: 'complete'
          });
        } else {
          return await sogniClient.projects.downloadUrl({
            jobId: project.id,
            imageId: job.id,
            type: 'complete'
          });
        }
      };

      // If only one job, download it directly without ZIP
      if (completedJobs.length === 1) {
        const job = completedJobs[0];
        setDownloadProgress({ current: 0, total: 1, message: 'Fetching download URL...' });

        const mediaUrl = await getMediaUrl(job);
        const extension = project.type === 'video' ? 'mp4' : 'png';
        const filename = `sogni-${project.model.name.toLowerCase().replace(/\s+/g, '-')}-${job.id.slice(0, 8)}.${extension}`;

        setDownloadProgress({ current: 0, total: 1, message: 'Downloading...' });

        const response = await fetch(mediaUrl);
        if (!response.ok) throw new Error('Failed to fetch media');

        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

        setDownloadProgress({ current: 1, total: 1, message: 'Download complete!' });
      } else {
        // Multiple jobs - get all URLs first, then download as ZIP
        const mediaItems: Array<{ url: string; filename: string }> = [];
        const extension = project.type === 'video' ? 'mp4' : 'png';

        setDownloadProgress({ current: 0, total: completedJobs.length, message: 'Fetching download URLs...' });

        for (let i = 0; i < completedJobs.length; i++) {
          const job = completedJobs[i];
          try {
            const mediaUrl = await getMediaUrl(job);
            const filename = `sogni-${project.model.name.toLowerCase().replace(/\s+/g, '-')}-${i + 1}.${extension}`;
            mediaItems.push({ url: mediaUrl, filename });
            setDownloadProgress({ current: i + 1, total: completedJobs.length, message: `Fetching URL ${i + 1} of ${completedJobs.length}...` });
          } catch (urlError) {
            console.warn(`Failed to get URL for job ${job.id}:`, urlError);
            // Continue with other jobs
          }
        }

        if (mediaItems.length === 0) {
          setDownloadProgress({ current: 0, total: 0, message: 'No media available to download' });
          setTimeout(() => {
            setDownloadingProject(null);
            setDownloadProgress(null);
          }, 2000);
          return;
        }

        // Generate ZIP filename with timestamp
        const timestamp = new Date().toISOString().split('T')[0];
        const mediaType = project.type === 'video' ? 'videos' : 'images';
        const zipFilename = `sogni-${project.model.name.toLowerCase().replace(/\s+/g, '-')}-${mediaType}-${timestamp}.zip`;

        // Download using the appropriate function
        const downloadFn = project.type === 'video' ? downloadVideosAsZip : downloadImagesAsZip;
        const success = await downloadFn(
          mediaItems,
          zipFilename,
          (current: number, total: number, message: string) => {
            setDownloadProgress({ current, total, message });
          }
        );

        if (!success) {
          setDownloadProgress({ current: 0, total: 0, message: 'Download failed. Please try again.' });
        }
      }

      // Reset after a delay
      setTimeout(() => {
        setDownloadingProject(null);
        setDownloadProgress(null);
      }, 2000);
    } catch (error) {
      console.error('Error downloading project:', error);
      setDownloadProgress({
        current: 0,
        total: 0,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      setTimeout(() => {
        setDownloadingProject(null);
        setDownloadProgress(null);
      }, 3000);
    }
  }, [sogniClient, downloadingProject]);

  // Handle downloading all images from a local project
  const handleDownloadLocalProject = useCallback(async (project: LocalProject) => {
    if (downloadingProject) return;

    setDownloadingProject(project.id);
    setDownloadProgress({ current: 0, total: 0, message: 'Preparing download...' });

    try {
      const images = expandedProjectImages[project.id];
      
      // If images aren't loaded yet, load them
      let imagesToDownload = images;
      if (!imagesToDownload) {
        imagesToDownload = await getLocalProjectImageUrls(project.id);
      }

      if (!imagesToDownload || imagesToDownload.length === 0) {
        setDownloadProgress({ current: 0, total: 0, message: 'No images available to download' });
        setTimeout(() => {
          setDownloadingProject(null);
          setDownloadProgress(null);
        }, 2000);
        return;
      }

      // If only one image, download it directly
      if (imagesToDownload.length === 1) {
        const image = imagesToDownload[0];
        setDownloadProgress({ current: 0, total: 1, message: 'Downloading...' });

        const response = await fetch(image.url);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);

        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = image.filename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

        setDownloadProgress({ current: 1, total: 1, message: 'Download complete!' });
      } else {
        // Multiple images - download as ZIP
        const mediaItems = imagesToDownload.map(img => ({
          url: img.url,
          filename: img.filename
        }));

        // Generate ZIP filename
        const timestamp = new Date().toISOString().split('T')[0];
        const projectNameSlug = project.name.toLowerCase().replace(/\s+/g, '-');
        const zipFilename = `${projectNameSlug}-images-${timestamp}.zip`;

        const success = await downloadImagesAsZip(
          mediaItems,
          zipFilename,
          (current: number, total: number, message: string) => {
            setDownloadProgress({ current, total, message });
          }
        );

        if (!success) {
          setDownloadProgress({ current: 0, total: 0, message: 'Download failed. Please try again.' });
        }
      }

      // Reset after a delay
      setTimeout(() => {
        setDownloadingProject(null);
        setDownloadProgress(null);
      }, 2000);
    } catch (error) {
      console.error('Error downloading local project:', error);
      setDownloadProgress({
        current: 0,
        total: 0,
        message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
      setTimeout(() => {
        setDownloadingProject(null);
        setDownloadProgress(null);
      }, 3000);
    }
  }, [downloadingProject, expandedProjectImages, getLocalProjectImageUrls]);

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
        <div className="recent-projects-header-right">
          {/* New Project Buttons */}
          {onStartNewProject && (
            <button
              className="recent-projects-new-btn"
              onClick={handleStartNewProject}
              title="Start a new project with camera or uploads"
            >
              + new project
            </button>
          )}
          {localProjectsSupported && (
            <div className="recent-projects-local-btn-wrapper">
              <button
                className="recent-projects-new-btn recent-projects-new-local-btn"
                onClick={() => setShowCreateLocalProject(true)}
                title="Create a local project with your own images"
              >
                💾 new local project
              </button>
              <button
                className="recent-projects-info-hint"
                title="Local projects are stored in your browser and never expire"
              >
                ?
              </button>
              <div className="recent-projects-info-dropdown">
                <strong>💾 Local Projects</strong>
                <p>Stored in your browser and never expire. Upload your own images to use with video workflows like Batch Transition, Sound to Video, Animate Replace, and more!</p>
              </div>
            </div>
          )}
          <button
            className="recent-projects-close-btn"
            onClick={onClose}
            title="Close"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Hidden file inputs for local project uploads */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={LOCAL_PROJECT_SUPPORTED_EXTENSIONS.join(',')}
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

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

        {/* Local Projects Section */}
        {localProjectsSupported && localProjectsInitialized && localProjects.length > 0 && (
          <div className="recent-projects-local-section">
            <div className="recent-projects-section-header">
              <h3>
                💾 Local Projects
                <span className="recent-projects-local-badge">Never Expires</span>
              </h3>
            </div>
            <div className="recent-projects-list">
              {localProjects.map((project: LocalProject) => (
                <div key={project.id} className="recent-project recent-project-local">
                  <div className="recent-project-heading">
                    <div className="recent-project-title-wrapper">
                      <div className="recent-project-title">
                        <span className="recent-project-local-icon">💾</span>
                        {project.name}
                        <button
                          className="recent-project-rename-inline"
                          onClick={() => setRenameDialog({
                            show: true,
                            projectId: project.id,
                            currentName: project.name,
                            newName: project.name
                          })}
                          title="Rename project"
                        >
                          ✎
                        </button>
                        <span className="recent-project-count">
                          ({project.imageIds.length} {pluralize(project.imageIds.length, 'image')})
                        </span>
                      </div>
                      <div className="recent-project-date">
                        Created {timeAgo(project.createdAt)}
                        {project.updatedAt !== project.createdAt && (
                          <> · Updated {timeAgo(project.updatedAt)}</>
                        )}
                      </div>
                    </div>
                    <div className="recent-project-actions">
                      {project.imageIds.length > 0 && (
                        <button
                          className="recent-project-action-btn"
                          onClick={() => handleToggleExpandProject(project)}
                          title={expandedProjectId === project.id ? "Close edit mode" : "Edit: reorder or delete images"}
                        >
                          {expandedProjectId === project.id ? '✕' : '⚙️'}
                        </button>
                      )}
                      <button
                        className="recent-project-action-btn"
                        onClick={() => handleUploadClick(project.id)}
                        title={`Add images (${project.imageIds.length}/${LOCAL_PROJECT_MAX_IMAGES})`}
                        disabled={project.imageIds.length >= LOCAL_PROJECT_MAX_IMAGES}
                      >
                        ↑
                      </button>
                      {project.imageIds.length > 0 && (
                        <button
                          className="recent-project-action-btn"
                          onClick={() => handleDownloadLocalProject(project)}
                          disabled={downloadingProject === project.id}
                          title={
                            downloadingProject === project.id
                              ? downloadProgress?.message || 'Downloading...'
                              : 'Download all images'
                          }
                        >
                          {downloadingProject === project.id ? '⏳' : '↓'}
                        </button>
                      )}
                      {project.imageIds.length > 0 && onReuseLocalProject && (
                        <button
                          className="recent-project-reuse-btn"
                          onClick={() => handleReuseLocalProject(project.id)}
                          title="Load images into Photo Gallery"
                        >
                          Remix
                        </button>
                      )}
                      <button
                        className="recent-project-delete-btn"
                        onClick={() => setLocalDeleteConfirm({
                          show: true,
                          projectId: project.id,
                          projectName: project.name
                        })}
                        title="Delete project"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                  {/* Local project content - inline expanded view or collapsed */}
                  {project.imageIds.length === 0 ? (
                    <div
                      className="recent-project-local-empty"
                      onClick={() => handleUploadClick(project.id)}
                    >
                      <span className="recent-project-local-empty-icon">📤</span>
                      <span>Click to upload images or a folder</span>
                      <span className="recent-project-local-empty-hint">
                        Supports JPG, PNG, WebP, GIF
                      </span>
                    </div>
                  ) : expandedProjectId === project.id ? (
                    /* Inline expanded view - show all images */
                    <div className="local-project-inline-expanded">
                      <div className="local-project-inline-hint">
                        Drag to reorder • Click 🗑️ to delete • {expandedProjectImages[project.id]?.length || 0} images
                      </div>
                      <div className="local-project-inline-grid">
                        {expandedProjectImages[project.id]?.map((image, index) => (
                          <div
                            key={image.id}
                            className={`local-project-inline-item ${
                              draggedImageId === image.id ? 'dragging' : ''
                            } ${dragOverImageId === image.id ? 'drag-over' : ''}`}
                            style={{ aspectRatio: `${image.width}/${image.height}` }}
                            draggable
                            onDragStart={() => handleDragStart(image.id)}
                            onDragOver={(e) => handleDragOver(e, image.id)}
                            onDragLeave={handleDragLeave}
                            onDrop={(e) => handleDrop(e, image.id, project.id)}
                            onDragEnd={handleDragEnd}
                          >
                            <div className="local-project-inline-number">{index + 1}</div>
                            <img
                              src={image.url}
                              alt={image.filename}
                              className="local-project-inline-img"
                            />
                            <button
                              className="local-project-inline-delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteImage(image.id, project.id);
                              }}
                              title="Delete this image"
                            >
                              🗑️
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="local-project-inline-actions">
                        <button
                          className="local-project-inline-btn"
                          onClick={() => {
                            setUploadingToProject(project.id);
                            fileInputRef.current?.click();
                          }}
                        >
                          📤 Add More
                        </button>
                        <button
                          className="local-project-inline-btn local-project-inline-btn-done"
                          onClick={() => handleCollapseProject()}
                        >
                          ✓ Done
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Collapsed view - show carousel of images */
                    <div className="recent-project-jobs-carousel">
                      {expandedProjectImages[project.id] ? (
                        /* Show all loaded images in carousel - click opens slideshow */
                        expandedProjectImages[project.id].map((image, index) => (
                          <div
                            key={image.id}
                            className="job-item local-project-image-item"
                            style={{
                              width: `${Math.round(320 * (image.width / image.height))}px`,
                              cursor: 'pointer'
                            }}
                            onClick={() => handleLocalImageClick(
                              project.name,
                              expandedProjectImages[project.id],
                              index
                            )}
                            title="Click to view full size"
                          >
                            <img
                              className="job-item-media"
                              src={image.url}
                              alt={image.filename}
                              loading="lazy"
                            />
                            {onAdjustImage && (
                              <button
                                className="job-item-adjust-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAdjustImage(image.url);
                                }}
                                title="Adjust this image"
                              >
                                📷
                              </button>
                            )}
                          </div>
                        ))
                      ) : (
                        /* Show loading spinner while images are being loaded */
                        <div className="local-project-upload-status">
                          <div className="recent-projects-spinner" />
                          <span>Loading {project.imageIds.length} images...</span>
                        </div>
                      )}
                      {uploadingToProject === project.id && uploadProgress && (
                        <div className="local-project-upload-status">
                          <div className="recent-projects-spinner" />
                          <span>Uploading {uploadProgress.added}/{uploadProgress.total}...</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Divider between local and cloud projects */}
            {sortedProjects.length > 0 && (
              <div className="recent-projects-section-divider">
                <span>☁️ Cloud Projects</span>
                <span className="recent-projects-cloud-note">Expires after ~24 hours</span>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {initialized && !loading && sortedProjects.length === 0 && localProjects.length === 0 && !error && (
          <div className="recent-projects-empty">
            {mediaFilter !== 'all' && visibleProjects.length > 0 ? (
              <>
                <p>No {mediaFilter === 'image' ? 'photo' : 'video'} projects found.</p>
                <p>Try switching to "All" to see all your projects.</p>
              </>
            ) : (
              <>
                <p>No projects found.</p>
                <p>Create a Local Project or start generating to see your work here!</p>
              </>
            )}
          </div>
        )}

        {/* Cloud Project list */}
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
                  <button
                    className="recent-project-action-btn"
                    onClick={() => handleDownloadProject(project)}
                    disabled={downloadingProject === project.id}
                    title={
                      downloadingProject === project.id
                        ? downloadProgress?.message || 'Downloading...'
                        : `Download all ${project.type === 'video' ? 'videos' : 'images'}`
                    }
                  >
                    {downloadingProject === project.id ? '⏳' : '↓'}
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

      {/* Local project slideshow modal */}
      {localSlideshow && (
        <div
          className="local-slideshow-overlay"
          onClick={handleCloseLocalSlideshow}
        >
          <div className="local-slideshow-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="local-slideshow-close"
              onClick={handleCloseLocalSlideshow}
              title="Close"
            >
              ✕
            </button>
            <div className="local-slideshow-header">
              <span className="local-slideshow-title">{localSlideshow.projectName}</span>
              <span className="local-slideshow-counter">
                {localSlideshow.currentIndex + 1} / {localSlideshow.images.length}
              </span>
            </div>
            <div className="local-slideshow-image-container">
              {localSlideshow.images.length > 1 && (
                <button
                  className="local-slideshow-nav local-slideshow-prev"
                  onClick={() => handleLocalSlideshowNav('prev')}
                >
                  ‹
                </button>
              )}
              <img
                src={localSlideshow.images[localSlideshow.currentIndex].url}
                alt={localSlideshow.images[localSlideshow.currentIndex].filename}
                className="local-slideshow-image"
              />
              {localSlideshow.images.length > 1 && (
                <button
                  className="local-slideshow-nav local-slideshow-next"
                  onClick={() => handleLocalSlideshowNav('next')}
                >
                  ›
                </button>
              )}
            </div>
            <div className="local-slideshow-actions">
              {onAdjustImage && (
                <button
                  className="local-slideshow-adjust-btn"
                  onClick={() => handleAdjustImage(localSlideshow.images[localSlideshow.currentIndex].url)}
                >
                  📷 Adjust Image
                </button>
              )}
            </div>
          </div>
        </div>
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

      {/* Create Local Project Modal */}
      {showCreateLocalProject && (
        <div
          className="recent-projects-modal-overlay"
          onClick={() => {
            setShowCreateLocalProject(false);
            setNewLocalProjectName('');
          }}
        >
          <div className="recent-projects-modal" onClick={(e) => e.stopPropagation()}>
            <h3>💾 New Local Project</h3>
            <p>
              Local projects are stored in your browser and never expire.
              Give your project a name to get started.
            </p>
            <input
              type="text"
              className="recent-projects-modal-input"
              placeholder="Project name..."
              value={newLocalProjectName}
              onChange={(e) => setNewLocalProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newLocalProjectName.trim()) {
                  handleCreateLocalProject();
                }
              }}
              autoFocus
              maxLength={100}
            />
            <div className="recent-projects-modal-actions">
              <button
                className="recent-projects-modal-btn recent-projects-modal-btn-cancel"
                onClick={() => {
                  setShowCreateLocalProject(false);
                  setNewLocalProjectName('');
                }}
              >
                Cancel
              </button>
              <button
                className="recent-projects-modal-btn recent-projects-modal-btn-confirm"
                onClick={handleCreateLocalProject}
                disabled={!newLocalProjectName.trim() || creatingLocalProject}
              >
                {creatingLocalProject ? 'Creating...' : 'Create & Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Local Project Modal */}
      {renameDialog.show && (
        <div
          className="recent-projects-modal-overlay"
          onClick={() => setRenameDialog({ show: false, projectId: '', currentName: '', newName: '' })}
        >
          <div className="recent-projects-modal" onClick={(e) => e.stopPropagation()}>
            <h3>✏️ Rename Project</h3>
            <input
              type="text"
              className="recent-projects-modal-input"
              placeholder="Project name..."
              value={renameDialog.newName}
              onChange={(e) => setRenameDialog(prev => ({ ...prev, newName: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && renameDialog.newName.trim()) {
                  handleRenameLocalProject();
                }
              }}
              autoFocus
              maxLength={100}
            />
            <div className="recent-projects-modal-actions">
              <button
                className="recent-projects-modal-btn recent-projects-modal-btn-cancel"
                onClick={() => setRenameDialog({ show: false, projectId: '', currentName: '', newName: '' })}
              >
                Cancel
              </button>
              <button
                className="recent-projects-modal-btn recent-projects-modal-btn-confirm"
                onClick={handleRenameLocalProject}
                disabled={!renameDialog.newName.trim()}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Local Project Confirmation Modal */}
      {localDeleteConfirm.show && (
        <div
          className="recent-projects-modal-overlay"
          onClick={() => setLocalDeleteConfirm({ show: false, projectId: '', projectName: '' })}
        >
          <div className="recent-projects-modal" onClick={(e) => e.stopPropagation()}>
            <h3>🗑️ Delete Local Project</h3>
            <p>
              Are you sure you want to delete <strong>"{localDeleteConfirm.projectName}"</strong>?
            </p>
            <p className="recent-projects-modal-warning">
              ⚠️ This will permanently delete the project and all its images from your browser.
              This action cannot be undone.
            </p>
            <div className="recent-projects-modal-actions">
              <button
                className="recent-projects-modal-btn recent-projects-modal-btn-cancel"
                onClick={() => setLocalDeleteConfirm({ show: false, projectId: '', projectName: '' })}
              >
                Cancel
              </button>
              <button
                className="recent-projects-modal-btn recent-projects-modal-btn-confirm recent-projects-modal-btn-danger"
                onClick={handleDeleteLocalProject}
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default RecentProjects;

