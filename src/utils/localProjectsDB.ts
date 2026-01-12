/**
 * Local Projects IndexedDB Utilities
 *
 * Provides persistent storage for local projects using IndexedDB.
 * Projects and images are stored in separate object stores for efficient
 * loading (project metadata loads fast, images load on-demand).
 */

import type {
  LocalProject,
  LocalProjectImage,
  LocalProjectWithImages
} from '../types/localProjects';
import {
  LOCAL_PROJECT_MAX_IMAGES,
  LOCAL_PROJECT_SUPPORTED_TYPES
} from '../types/localProjects';

const DB_NAME = 'sogni_local_projects';
const DB_VERSION = 1;
const PROJECTS_STORE = 'projects';
const IMAGES_STORE = 'images';

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
      console.error('[LocalProjectsDB] Failed to open database:', request.error);
      reject(new Error('Failed to open local projects database'));
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

      // Create projects store
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        const projectsStore = db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
        projectsStore.createIndex('createdAt', 'createdAt', { unique: false });
        projectsStore.createIndex('name', 'name', { unique: false });
      }

      // Create images store with project index for efficient queries
      if (!db.objectStoreNames.contains(IMAGES_STORE)) {
        const imagesStore = db.createObjectStore(IMAGES_STORE, { keyPath: 'id' });
        imagesStore.createIndex('projectId', 'projectId', { unique: false });
        imagesStore.createIndex('addedAt', 'addedAt', { unique: false });
      }
    };
  });
}

/**
 * Generate a UUID for project/image IDs
 */
function generateId(): string {
  return crypto.randomUUID();
}

// ============================================================================
// Project CRUD Operations
// ============================================================================

/**
 * Get all local projects (metadata only, no images)
 */
export async function getAllProjects(): Promise<LocalProject[]> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECTS_STORE, 'readonly');
    const store = transaction.objectStore(PROJECTS_STORE);
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort by creation date (newest first)
      const projects = (request.result as LocalProject[]).sort(
        (a, b) => b.createdAt - a.createdAt
      );
      resolve(projects);
    };

    request.onerror = () => {
      console.error('[LocalProjectsDB] Failed to get projects:', request.error);
      reject(new Error('Failed to load local projects'));
    };
  });
}

/**
 * Get a single project by ID
 */
export async function getProject(projectId: string): Promise<LocalProject | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECTS_STORE, 'readonly');
    const store = transaction.objectStore(PROJECTS_STORE);
    const request = store.get(projectId);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      console.error('[LocalProjectsDB] Failed to get project:', request.error);
      reject(new Error('Failed to load project'));
    };
  });
}

/**
 * Create a new local project
 */
export async function createProject(name: string): Promise<LocalProject> {
  const db = await openDB();
  const now = Date.now();

  const project: LocalProject = {
    id: generateId(),
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    imageIds: [],
    thumbnailId: null
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECTS_STORE, 'readwrite');
    const store = transaction.objectStore(PROJECTS_STORE);
    const request = store.add(project);

    request.onsuccess = () => {
      resolve(project);
    };

    request.onerror = () => {
      console.error('[LocalProjectsDB] Failed to create project:', request.error);
      reject(new Error('Failed to create project'));
    };
  });
}

/**
 * Update a project's metadata
 */
export async function updateProject(
  projectId: string,
  updates: Partial<Pick<LocalProject, 'name' | 'thumbnailId'>>
): Promise<LocalProject> {
  const db = await openDB();

  // First get the existing project
  const existing = await getProject(projectId);
  if (!existing) {
    throw new Error('Project not found');
  }

  const updated: LocalProject = {
    ...existing,
    ...updates,
    updatedAt: Date.now()
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECTS_STORE, 'readwrite');
    const store = transaction.objectStore(PROJECTS_STORE);
    const request = store.put(updated);

    request.onsuccess = () => {
      resolve(updated);
    };

    request.onerror = () => {
      console.error('[LocalProjectsDB] Failed to update project:', request.error);
      reject(new Error('Failed to update project'));
    };
  });
}

/**
 * Delete a project and all its images
 */
export async function deleteProject(projectId: string): Promise<void> {
  const db = await openDB();

  // First, delete all images belonging to this project
  await deleteProjectImages(projectId);

  // Then delete the project itself
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(PROJECTS_STORE, 'readwrite');
    const store = transaction.objectStore(PROJECTS_STORE);
    const request = store.delete(projectId);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      console.error('[LocalProjectsDB] Failed to delete project:', request.error);
      reject(new Error('Failed to delete project'));
    };
  });
}

// ============================================================================
// Image CRUD Operations
// ============================================================================

/**
 * Get all images for a project, ordered by the project's imageIds array
 */
export async function getProjectImages(projectId: string): Promise<LocalProjectImage[]> {
  const db = await openDB();

  // First get the project to get the correct image order
  const project = await getProject(projectId);
  if (!project) {
    return [];
  }

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IMAGES_STORE, 'readonly');
    const store = transaction.objectStore(IMAGES_STORE);
    const index = store.index('projectId');
    const request = index.getAll(projectId);

    request.onsuccess = () => {
      const images = request.result as LocalProjectImage[];

      // Create a map for O(1) lookup
      const imageMap = new Map<string, LocalProjectImage>();
      for (const img of images) {
        imageMap.set(img.id, img);
      }

      // Sort images according to the project's imageIds order
      const orderedImages: LocalProjectImage[] = [];
      for (const id of project.imageIds) {
        const img = imageMap.get(id);
        if (img) {
          orderedImages.push(img);
        }
      }

      resolve(orderedImages);
    };

    request.onerror = () => {
      console.error('[LocalProjectsDB] Failed to get project images:', request.error);
      reject(new Error('Failed to load project images'));
    };
  });
}

/**
 * Get a single image by ID
 */
export async function getImage(imageId: string): Promise<LocalProjectImage | null> {
  const db = await openDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(IMAGES_STORE, 'readonly');
    const store = transaction.objectStore(IMAGES_STORE);
    const request = store.get(imageId);

    request.onsuccess = () => {
      resolve(request.result || null);
    };

    request.onerror = () => {
      console.error('[LocalProjectsDB] Failed to get image:', request.error);
      reject(new Error('Failed to load image'));
    };
  });
}

/**
 * Get image dimensions from a blob
 */
async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image for dimensions'));
    };

    img.src = url;
  });
}

/**
 * Add images to a project
 * Returns array of added image objects
 */
export async function addImagesToProject(
  projectId: string,
  files: File[]
): Promise<{ added: LocalProjectImage[]; skipped: number; error?: string }> {
  const db = await openDB();

  // Get existing project
  const project = await getProject(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  // Check current image count
  const currentCount = project.imageIds.length;
  const remainingSlots = LOCAL_PROJECT_MAX_IMAGES - currentCount;

  if (remainingSlots <= 0) {
    return {
      added: [],
      skipped: files.length,
      error: `Project already has ${LOCAL_PROJECT_MAX_IMAGES} images (maximum)`
    };
  }

  // Filter to supported image types
  const validFiles = files.filter(file =>
    LOCAL_PROJECT_SUPPORTED_TYPES.includes(file.type.toLowerCase())
  );

  // Limit to remaining slots
  const filesToAdd = validFiles.slice(0, remainingSlots);
  const skipped = files.length - filesToAdd.length;

  const added: LocalProjectImage[] = [];
  const newImageIds: string[] = [];
  const now = Date.now();

  // Process each file
  for (const file of filesToAdd) {
    try {
      // Read file as blob
      const blob = new Blob([await file.arrayBuffer()], { type: file.type });

      // Get dimensions
      const { width, height } = await getImageDimensions(blob);

      const image: LocalProjectImage = {
        id: generateId(),
        projectId,
        blob,
        filename: file.name,
        mimeType: file.type,
        width,
        height,
        size: file.size,
        addedAt: now + added.length // Slight offset to maintain order
      };

      // Store image in IndexedDB
      await new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(IMAGES_STORE, 'readwrite');
        const store = transaction.objectStore(IMAGES_STORE);
        const request = store.add(image);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });

      added.push(image);
      newImageIds.push(image.id);
    } catch (error) {
      console.error(`[LocalProjectsDB] Failed to add image ${file.name}:`, error);
      // Continue with other files
    }
  }

  // Update project with new image IDs
  if (newImageIds.length > 0) {
    const updatedProject: LocalProject = {
      ...project,
      imageIds: [...project.imageIds, ...newImageIds],
      thumbnailId: project.thumbnailId || newImageIds[0], // Set first image as thumbnail if none
      updatedAt: Date.now()
    };

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PROJECTS_STORE, 'readwrite');
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.put(updatedProject);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  return {
    added,
    skipped,
    error: skipped > 0
      ? `${skipped} file(s) were skipped (unsupported format or project limit reached)`
      : undefined
  };
}

/**
 * Delete a single image from a project
 */
export async function deleteImage(imageId: string): Promise<void> {
  const db = await openDB();

  // First get the image to find its project
  const image = await getImage(imageId);
  if (!image) {
    return; // Already deleted
  }

  // Delete the image
  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(IMAGES_STORE, 'readwrite');
    const store = transaction.objectStore(IMAGES_STORE);
    const request = store.delete(imageId);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });

  // Update the project to remove this image ID
  const project = await getProject(image.projectId);
  if (project) {
    const updatedImageIds = project.imageIds.filter(id => id !== imageId);
    const updatedProject: LocalProject = {
      ...project,
      imageIds: updatedImageIds,
      thumbnailId: project.thumbnailId === imageId
        ? (updatedImageIds[0] || null)
        : project.thumbnailId,
      updatedAt: Date.now()
    };

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(PROJECTS_STORE, 'readwrite');
      const store = transaction.objectStore(PROJECTS_STORE);
      const request = store.put(updatedProject);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * Delete all images for a project (used when deleting a project)
 */
async function deleteProjectImages(projectId: string): Promise<void> {
  const db = await openDB();
  const images = await getProjectImages(projectId);

  for (const image of images) {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(IMAGES_STORE, 'readwrite');
      const store = transaction.objectStore(IMAGES_STORE);
      const request = store.delete(image.id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get a project with all its images loaded
 */
export async function getProjectWithImages(
  projectId: string
): Promise<LocalProjectWithImages | null> {
  const project = await getProject(projectId);
  if (!project) {
    return null;
  }

  const images = await getProjectImages(projectId);

  return {
    ...project,
    images
  };
}

/**
 * Create a blob URL for an image (caller is responsible for revoking)
 */
export function createImageBlobUrl(image: LocalProjectImage): string {
  return URL.createObjectURL(image.blob);
}

/**
 * Get thumbnail blob URL for a project (for display in project list)
 * Returns null if project has no images
 */
export async function getProjectThumbnailUrl(
  project: LocalProject
): Promise<string | null> {
  if (!project.thumbnailId) {
    return null;
  }

  const image = await getImage(project.thumbnailId);
  if (!image) {
    return null;
  }

  return URL.createObjectURL(image.blob);
}

/**
 * Get storage usage statistics
 */
export async function getStorageStats(): Promise<{
  projectCount: number;
  totalImages: number;
  totalSizeBytes: number;
}> {
  const projects = await getAllProjects();
  let totalImages = 0;
  let totalSizeBytes = 0;

  for (const project of projects) {
    const images = await getProjectImages(project.id);
    totalImages += images.length;
    totalSizeBytes += images.reduce((sum, img) => sum + img.size, 0);
  }

  return {
    projectCount: projects.length,
    totalImages,
    totalSizeBytes
  };
}

/**
 * Check if IndexedDB is supported
 */
export function isIndexedDBSupported(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

/**
 * Reorder images within a project
 * @param projectId - Project ID
 * @param newImageOrder - Array of image IDs in the new desired order
 */
export async function reorderProjectImages(
  projectId: string,
  newImageOrder: string[]
): Promise<void> {
  const db = await openDB();

  // Get existing project
  const project = await getProject(projectId);
  if (!project) {
    throw new Error('Project not found');
  }

  // Validate that all image IDs exist in the project
  const existingSet = new Set(project.imageIds);
  const validOrder = newImageOrder.filter(id => existingSet.has(id));

  // Make sure we didn't lose any images
  if (validOrder.length !== project.imageIds.length) {
    throw new Error('Invalid image order - missing or invalid image IDs');
  }

  // Update project with new order
  const updatedProject: LocalProject = {
    ...project,
    imageIds: validOrder,
    thumbnailId: validOrder[0] || null, // Update thumbnail to first image
    updatedAt: Date.now()
  };

  await new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(PROJECTS_STORE, 'readwrite');
    const store = transaction.objectStore(PROJECTS_STORE);
    const request = store.put(updatedProject);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
