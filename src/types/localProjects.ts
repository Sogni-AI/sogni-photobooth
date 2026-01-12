/**
 * Local Projects - Types for IndexedDB-stored user projects
 *
 * Local projects allow users to upload their own images and use them
 * with video workflows. Unlike cloud projects, local projects never expire
 * and are stored entirely in the browser's IndexedDB.
 */

export interface LocalProject {
  /** Unique project ID (UUID) */
  id: string;
  /** User-defined project name */
  name: string;
  /** Timestamp when project was created */
  createdAt: number;
  /** Timestamp when project was last modified */
  updatedAt: number;
  /** Array of image IDs belonging to this project */
  imageIds: string[];
  /** Thumbnail image ID (first image or user-selected) */
  thumbnailId: string | null;
}

export interface LocalProjectImage {
  /** Unique image ID (UUID) */
  id: string;
  /** Project ID this image belongs to */
  projectId: string;
  /** Image blob data */
  blob: Blob;
  /** Original filename */
  filename: string;
  /** MIME type (e.g., 'image/jpeg', 'image/png') */
  mimeType: string;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** File size in bytes */
  size: number;
  /** Timestamp when image was added */
  addedAt: number;
}

export interface LocalProjectWithImages extends LocalProject {
  /** Full image data for this project */
  images: LocalProjectImage[];
}

export interface LocalProjectsState {
  /** List of all local projects (metadata only) */
  projects: LocalProject[];
  /** Whether projects are being loaded from IndexedDB */
  loading: boolean;
  /** Whether initial load has completed */
  initialized: boolean;
  /** Error message if loading failed */
  error: string | null;
}

/** Maximum number of images allowed per local project */
export const LOCAL_PROJECT_MAX_IMAGES = 512;

/** Supported image MIME types for local projects */
export const LOCAL_PROJECT_SUPPORTED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif'
];

/** Supported file extensions for local projects */
export const LOCAL_PROJECT_SUPPORTED_EXTENSIONS = [
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif'
];
