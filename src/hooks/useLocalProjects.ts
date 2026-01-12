/**
 * useLocalProjects Hook
 *
 * Manages local projects stored in IndexedDB. Provides state and operations
 * for creating, updating, deleting projects and managing their images.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { LocalProject, LocalProjectsState } from '../types/localProjects';
import {
  getAllProjects,
  getProject,
  createProject as dbCreateProject,
  updateProject as dbUpdateProject,
  deleteProject as dbDeleteProject,
  getProjectImages,
  addImagesToProject as dbAddImages,
  deleteImage as dbDeleteImage,
  getImage,
  isIndexedDBSupported,
  createImageBlobUrl,
  reorderProjectImages as dbReorderImages
} from '../utils/localProjectsDB';

interface UseLocalProjectsReturn extends LocalProjectsState {
  /** Create a new local project with the given name */
  createProject: (name: string) => Promise<LocalProject | null>;
  /** Rename an existing project */
  renameProject: (projectId: string, newName: string) => Promise<boolean>;
  /** Delete a project and all its images */
  deleteProject: (projectId: string) => Promise<boolean>;
  /** Add images to a project from File objects */
  addImages: (projectId: string, files: File[]) => Promise<{
    added: number;
    skipped: number;
    error?: string;
  }>;
  /** Delete a single image from a project */
  deleteImage: (imageId: string) => Promise<boolean>;
  /** Get all images for a project as blob URLs (for loading into gallery) */
  getProjectImageUrls: (projectId: string) => Promise<Array<{
    id: string;
    url: string;
    width: number;
    height: number;
    filename: string;
  }>>;
  /** Get a single project by ID */
  getProject: (projectId: string) => Promise<LocalProject | null>;
  /** Get thumbnail URL for a project */
  getThumbnailUrl: (project: LocalProject) => Promise<string | null>;
  /** Reorder images within a project */
  reorderImages: (projectId: string, newOrder: string[]) => Promise<boolean>;
  /** Refresh the projects list from IndexedDB */
  refresh: () => Promise<void>;
  /** Whether IndexedDB is supported in this browser */
  isSupported: boolean;
}

// Cache for thumbnail URLs to avoid recreating blob URLs
const thumbnailUrlCache = new Map<string, string>();

export function useLocalProjects(): UseLocalProjectsReturn {
  const [state, setState] = useState<LocalProjectsState>({
    projects: [],
    loading: false,
    initialized: false,
    error: null
  });

  const isSupported = isIndexedDBSupported();
  const loadingRef = useRef(false);

  // Load projects from IndexedDB on mount
  const loadProjects = useCallback(async () => {
    if (!isSupported || loadingRef.current) return;

    loadingRef.current = true;
    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const projects = await getAllProjects();
      setState({
        projects,
        loading: false,
        initialized: true,
        error: null
      });
    } catch (error) {
      console.error('[useLocalProjects] Failed to load projects:', error);
      setState(prev => ({
        ...prev,
        loading: false,
        initialized: true,
        error: error instanceof Error ? error.message : 'Failed to load local projects'
      }));
    } finally {
      loadingRef.current = false;
    }
  }, [isSupported]);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Create a new project
  const createProject = useCallback(async (name: string): Promise<LocalProject | null> => {
    if (!isSupported) return null;

    try {
      const project = await dbCreateProject(name);

      // Add to state immediately
      setState(prev => ({
        ...prev,
        projects: [project, ...prev.projects]
      }));

      return project;
    } catch (error) {
      console.error('[useLocalProjects] Failed to create project:', error);
      return null;
    }
  }, [isSupported]);

  // Rename a project
  const renameProject = useCallback(async (
    projectId: string,
    newName: string
  ): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      const updated = await dbUpdateProject(projectId, { name: newName.trim() });

      // Update in state
      setState(prev => ({
        ...prev,
        projects: prev.projects.map(p =>
          p.id === projectId ? updated : p
        )
      }));

      return true;
    } catch (error) {
      console.error('[useLocalProjects] Failed to rename project:', error);
      return false;
    }
  }, [isSupported]);

  // Delete a project
  const deleteProjectHandler = useCallback(async (projectId: string): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      await dbDeleteProject(projectId);

      // Remove thumbnail URL from cache
      thumbnailUrlCache.delete(projectId);

      // Remove from state
      setState(prev => ({
        ...prev,
        projects: prev.projects.filter(p => p.id !== projectId)
      }));

      return true;
    } catch (error) {
      console.error('[useLocalProjects] Failed to delete project:', error);
      return false;
    }
  }, [isSupported]);

  // Add images to a project
  const addImages = useCallback(async (
    projectId: string,
    files: File[]
  ): Promise<{ added: number; skipped: number; error?: string }> => {
    if (!isSupported) {
      return { added: 0, skipped: files.length, error: 'IndexedDB not supported' };
    }

    try {
      const result = await dbAddImages(projectId, files);

      // Refresh project in state to get updated imageIds
      const updatedProject = await getProject(projectId);
      if (updatedProject) {
        // Invalidate thumbnail cache
        thumbnailUrlCache.delete(projectId);

        setState(prev => ({
          ...prev,
          projects: prev.projects.map(p =>
            p.id === projectId ? updatedProject : p
          )
        }));
      }

      return {
        added: result.added.length,
        skipped: result.skipped,
        error: result.error
      };
    } catch (error) {
      console.error('[useLocalProjects] Failed to add images:', error);
      return {
        added: 0,
        skipped: files.length,
        error: error instanceof Error ? error.message : 'Failed to add images'
      };
    }
  }, [isSupported]);

  // Delete a single image
  const deleteImageHandler = useCallback(async (imageId: string): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      // Get image to find project ID
      const image = await getImage(imageId);
      if (!image) return false;

      await dbDeleteImage(imageId);

      // Invalidate thumbnail cache
      thumbnailUrlCache.delete(image.projectId);

      // Refresh project in state
      const updatedProject = await getProject(image.projectId);
      if (updatedProject) {
        setState(prev => ({
          ...prev,
          projects: prev.projects.map(p =>
            p.id === image.projectId ? updatedProject : p
          )
        }));
      }

      return true;
    } catch (error) {
      console.error('[useLocalProjects] Failed to delete image:', error);
      return false;
    }
  }, [isSupported]);

  // Get all project images as blob URLs
  const getProjectImageUrls = useCallback(async (
    projectId: string
  ): Promise<Array<{ id: string; url: string; width: number; height: number; filename: string }>> => {
    if (!isSupported) return [];

    try {
      const images = await getProjectImages(projectId);

      return images.map(img => ({
        id: img.id,
        url: createImageBlobUrl(img),
        width: img.width,
        height: img.height,
        filename: img.filename
      }));
    } catch (error) {
      console.error('[useLocalProjects] Failed to get project images:', error);
      return [];
    }
  }, [isSupported]);

  // Get a single project
  const getProjectHandler = useCallback(async (projectId: string): Promise<LocalProject | null> => {
    if (!isSupported) return null;

    try {
      return await getProject(projectId);
    } catch (error) {
      console.error('[useLocalProjects] Failed to get project:', error);
      return null;
    }
  }, [isSupported]);

  // Get thumbnail URL for a project (cached)
  const getThumbnailUrl = useCallback(async (project: LocalProject): Promise<string | null> => {
    if (!isSupported || !project.thumbnailId) return null;

    // Check cache first
    const cached = thumbnailUrlCache.get(project.id);
    if (cached) return cached;

    try {
      const image = await getImage(project.thumbnailId);
      if (!image) return null;

      const url = createImageBlobUrl(image);
      thumbnailUrlCache.set(project.id, url);
      return url;
    } catch (error) {
      console.error('[useLocalProjects] Failed to get thumbnail:', error);
      return null;
    }
  }, [isSupported]);

  // Reorder images within a project
  const reorderImages = useCallback(async (
    projectId: string,
    newOrder: string[]
  ): Promise<boolean> => {
    if (!isSupported) return false;

    try {
      await dbReorderImages(projectId, newOrder);

      // Invalidate thumbnail cache
      thumbnailUrlCache.delete(projectId);

      // Refresh project in state
      const updatedProject = await getProject(projectId);
      if (updatedProject) {
        setState(prev => ({
          ...prev,
          projects: prev.projects.map(p =>
            p.id === projectId ? updatedProject : p
          )
        }));
      }

      return true;
    } catch (error) {
      console.error('[useLocalProjects] Failed to reorder images:', error);
      return false;
    }
  }, [isSupported]);

  // Refresh projects list
  const refresh = useCallback(async () => {
    await loadProjects();
  }, [loadProjects]);

  return {
    ...state,
    createProject,
    renameProject,
    deleteProject: deleteProjectHandler,
    addImages,
    deleteImage: deleteImageHandler,
    getProjectImageUrls,
    getProject: getProjectHandler,
    getThumbnailUrl,
    reorderImages,
    refresh,
    isSupported
  };
}

export default useLocalProjects;
