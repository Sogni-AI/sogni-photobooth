// Job status types (mirroring sogni-client types)
export type JobStatus = 'pending' | 'initiating' | 'processing' | 'completed' | 'failed' | 'canceled';
export type ProjectStatus = 'processing' | 'completed' | 'failed' | 'canceled';

export interface JobHistoryResponse {
  status: string;
  data: JobHistoryData;
}

export interface JobHistoryData {
  jobs: JobHistoryItemRaw[];
  next: number;
}

export interface JobHistoryItemRaw {
  id: string;
  SID: string;
  imgID: string;
  worker: {
    id: string;
    clientSID: number;
    address: string;
    addressSID: number;
    username: string;
    SID: number;
    nftTokenId?: string;
  };
  createTime: number;
  startTime: number;
  actualStartTime: number;
  updateTime: number;
  endTime: number;
  status: string;
  reason: string;
  performedSteps: number;
  triggeredNSFWFilter: boolean;
  seedUsed: number;
  costActual: {
    costInRenderSec: string;
    costInUSD: string;
    costInToken: string;
    costInSpark: string;
    costInSogni: string;
  };
  network: 'fast';
  txId: string;
  parentRequest: {
    id: string;
    SID: number;
    artist: {
      id: string;
      clientSID: number;
      address: string;
      addressSID: number;
      username: string;
      SID: number;
    };
    model: {
      id: string;
      SID: number;
      name: string;
    };
    imageCount: number;
    stepCount: number;
    previewCount: number;
    hasGuideImage: boolean;
    denoiseStrength: string;
    network: string;
    width: number;
    height: number;
    sizePreset: string;
    jobType: string;
    isTest: boolean;
    tokenType: string;
  };
  jobType: string;
  isTest: boolean;
  tokenType: string;
  speedVsBaseline: string;
  details?: string;
  timings?: JobTimings;
}

export interface JobTimings {
  assetDownload: number;
  modelInit: number;
  inference: number;
  assetUpload: number;
  other: number;
  safeContent: number;
}

export interface ArchiveProject {
  id: string;
  type: 'image' | 'video';
  numberOfMedia: number;
  jobs: ArchiveJob[];
  status: ProjectStatus;
  createdAt: number;
  width: number;
  height: number;
  model: {
    id: string;
    name: string;
  };
  hidden?: boolean;
  scheduledDelete?: boolean;
}

export interface ArchiveJob {
  createdAt: number;
  endTime: number;
  id: string;
  isNSFW: boolean;
  projectId: string;
  status: JobStatus;
  type: 'image' | 'video';
  hidden?: boolean;
}

export interface ProjectHistoryState {
  projects: ArchiveProject[];
  loading: boolean;
  hasMore: boolean;
  offset: number;
  initialized: boolean;
  error: string | null;
}

export interface MediaURL {
  value: string | null;
  updatedAt: number;
  expiresAt: number;
  projectId: string;
  jobId: string;
  type: 'image' | 'video';
  refreshing: boolean;
  error?: string;
}

