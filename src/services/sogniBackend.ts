/**
 * Sogni Backend Service
 * 
 * This service handles all communication with the Sogni API through our backend
 * instead of directly using the Sogni SDK in the frontend.
 */

import { createProject as apiCreateProject, checkSogniStatus, cancelProject, clientAppId, disconnectSession } from './api';
import urls from '../config/urls';

// Get API base URL from config
const API_BASE_URL = urls.apiUrl;

// Shared interface for events
interface SogniEventEmitter {
  on: (event: string, callback: (...args: unknown[]) => void) => void;
  off: (event: string, callback: (...args: unknown[]) => void) => void;
  emit: (event: string, ...args: unknown[]) => void;
}

/**
 * Create a simple event emitter to simulate the Sogni client events
 */
function createEventEmitter(): SogniEventEmitter {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  
  return {
    on(event: string, callback: (...args: unknown[]) => void) {
      if (!listeners[event]) {
        listeners[event] = [];
      }
      listeners[event].push(callback);
    },
    
    off(event: string, callback: (...args: unknown[]) => void) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(cb => cb !== callback);
      }
    },
    
    emit(event: string, ...args: unknown[]) {
      if (listeners[event]) {
        listeners[event].forEach(callback => callback(...args));
      }
    }
  };
}

/**
 * Mock Project object that simulates the Sogni SDK Project interface
 */
export class BackendProject implements SogniEventEmitter {
  private eventEmitter: SogniEventEmitter;
  public id: string;
  public jobs: {
    id: string;
    on: (event: string, callback: (progress: number) => void) => void;
    resultUrl?: string;
    previewUrl?: string; // Add preview URL support
    workerName?: string;
    realJobId?: string;
    index?: number;
    positivePrompt?: string;
    negativePrompt?: string;
    stylePrompt?: string;
    jobIndex?: number;
    progressCallback?: (progress: number) => void;
    error?: string;
  }[] = [];
  
  constructor(id: string) {
    this.id = id;
    this.eventEmitter = createEventEmitter();
  }
  
  // Event methods
  on(event: string, callback: (...args: unknown[]) => void) {
    this.eventEmitter.on(event, callback);
    return this;
  }
  
  off(event: string, callback: (...args: unknown[]) => void) {
    this.eventEmitter.off(event, callback);
    return this;
  }
  
  emit(event: string, ...args: unknown[]) {
    this.eventEmitter.emit(event, ...args);
    return this;
  }
  
  // Add a job to the project
  addJob(jobId: string, resultUrl?: string, index?: number, workerName?: string) {
    // console.log(`Adding job ${jobId} with workerName "${workerName || 'Worker'}"`);
    const job: {
      id: string;
      resultUrl?: string;
      workerName?: string;
      realJobId?: string;
      index?: number;
      positivePrompt?: string;
      negativePrompt?: string;
      stylePrompt?: string;
      jobIndex?: number;
      on: (event: string, callback: (progress: number) => void) => void;
      progressCallback?: (progress: number) => void;
      error?: string;
    } = {
      id: jobId,
      resultUrl,
      workerName: workerName || '',
      index,
      realJobId: undefined,
      positivePrompt: undefined,
      negativePrompt: undefined,
      stylePrompt: undefined,
      jobIndex: undefined,
      on: (event: string, callback: (progress: number) => void) => {
        if (event === 'progress') {
          job.progressCallback = callback;
        }
      },
      progressCallback: undefined,
      error: undefined,
    };
    
    this.jobs.push(job);
    return job;
  }
  
  // Update job progress
  updateJobProgress(jobId: string, progress: number | null | undefined, workerName?: string) {
    console.log(`BackendProject: Updating job ${jobId} progress to ${progress}`);
    const job = this.jobs.find(j => j.id === jobId);
    
    // Update worker name if provided and job exists - simple direct assignment
    if (workerName && job) {
      // Only update if we don't already have a worker name or if it's different
      if (!job.workerName || job.workerName !== workerName) {
        console.log(`Updating worker name for job ${job.id} from "${job.workerName}" to "${workerName}"`);
        job.workerName = workerName;
      }
    }

    // Skip further processing for null/undefined progress
    if (progress === null || progress === undefined) {
      console.log(`Skipping null/undefined progress update for job ${jobId}`);
      return;
    }

    // Ensure we have a normalized progress value (0-1)
    const normalizedProgress = typeof progress === 'number' && progress > 1 ? progress / 100 : progress;
    
    if (job && job.progressCallback) {
      console.log(`BackendProject: Calling progress callback for job ${jobId} with normalized progress ${normalizedProgress}`);
      
      // Always pass the normalized value (0-1 range) to match the SDK
      job.progressCallback(normalizedProgress);
    } else {
      console.log(`BackendProject: No progress callback found for job ${jobId}`);
    }
    
    // Also emit at the project level
    const eventData = { 
      type: 'progress', 
      jobId, 
      progress: normalizedProgress, // Pass normalized value (0-1 range)
      projectId: this.id,
      workerName: job ? job.workerName : workerName  // Use job's worker name or provided name
    };
    console.log(`BackendProject: Emitting job event with worker name "${eventData.workerName}":`, JSON.stringify(eventData));
    this.emit('job', eventData);
  }
  
  // Complete a job
  completeJob(jobId: string, resultUrl: string) {
    const job = this.jobs.find(j => j.id === jobId);
    if (job) {
      job.resultUrl = resultUrl;
      this.emit('jobCompleted', job);
    } else {
      console.warn(`BackendProject: Could not find job ${jobId} to complete`);
    }
  }
  
  // Fail a job
  failJob(jobId: string, error: string) {
    const job = this.jobs.find(j => j.id === jobId);
    if (job) {
      job.error = error;
      this.emit('jobFailed', { ...job, error });
    }
  }
}

export interface BackendAccount {
  isLoggedInValue: boolean;
  readonly isLoggedIn: boolean;
  login: () => Promise<boolean>;
  logout: () => Promise<boolean>;
}

/**
 * Mock Sogni client that calls our backend API
 */
export class BackendSogniClient {
  public appId: string;
  public network: string;
  public account: BackendAccount;
  public projects: {
    create: (params: Record<string, unknown>) => Promise<BackendProject>;
    estimateCost: (params: Record<string, unknown>) => Promise<{ token: number } | null>;
    on: (event: string, callback: (...args: unknown[]) => void) => void;
  };
  private activeProjects: Map<string, BackendProject> = new Map();
  private isDisconnecting: boolean = false;
  
  // Track all client instances for proper cleanup
  private static instances: Map<string, BackendSogniClient> = new Map();
  private static isGlobalCleanup: boolean = false;
  
  constructor(appId: string) {
    this.appId = appId;
    this.network = 'fast';
    
    // Mock account methods
    this.account = {
      get isLoggedIn() {
        return this.isLoggedInValue;
      },
      isLoggedInValue: false,
      login: () => {
        this.account.isLoggedInValue = true;
        return Promise.resolve(true);
      },
      logout: () => {
        this.account.isLoggedInValue = false;
        void this.disconnect();
        return Promise.resolve(true);
      }
    };
    
    // Mock projects methods
    this.projects = {
      create: this.createProject.bind(this),
      estimateCost: this.estimateCost.bind(this),
      on: () => {
        // This would handle global project events if needed
      }
    };
    
    // Track this instance (no need for complex unload handling in a photobooth app)
    if (this.appId) {
      BackendSogniClient.instances.set(this.appId, this);
      console.log(`Registered BackendSogniClient instance with appId: ${this.appId}`);
    }
  }
  
  /**
   * Disconnect the client and clean up resources
   * Should be called when the component unmounts or the page is about to unload
   */
  async disconnect(): Promise<boolean> {
    // Prevent double disconnection
    if (this.isDisconnecting) {
      console.log(`BackendSogniClient ${this.appId} already disconnecting, skipping redundant call`);
      return true;
    }
    
    // Mark as disconnecting immediately to prevent multiple calls
    this.isDisconnecting = true;
    
    try {
      console.log(`Disconnecting BackendSogniClient for appId: ${this.appId || 'unknown'}`);
      
      // First cancel any active projects
      const activeProjectIds = Array.from(this.activeProjects.keys());
      if (activeProjectIds.length > 0) {
        console.log(`Cancelling ${activeProjectIds.length} active projects before disconnecting`);
        
        // Cancel projects in parallel
        await Promise.allSettled(
          activeProjectIds.map(projectId => this.cancelProject(projectId))
        );
        
        // Clear the active projects map
        this.activeProjects.clear();
      }
      
      // Call the backend API to disconnect the session only if not during global cleanup
      if (!BackendSogniClient.isGlobalCleanup) {
        const disconnectResult = await disconnectSession();
        console.log(`Disconnect result for client ${this.appId}: ${disconnectResult}`);
      }
      
      // Mark account as logged out
      this.account.isLoggedInValue = false;
      
      // Remove from instance tracking
      if (this.appId) {
        BackendSogniClient.instances.delete(this.appId);
      }
      
      return true;
    } catch (error) {
      console.error(`Error during BackendSogniClient disconnect for ${this.appId}:`, error);
      
      // Still remove from tracking on error
      if (this.appId) {
        BackendSogniClient.instances.delete(this.appId);
      }
      
      return false;
    }
  }

  /**
   * Factory method to create a client instance
   */
  static createInstance(config: Record<string, unknown>): BackendSogniClient {
    // Check if we already have a client with this app ID
    const appId = typeof config.appId === 'string' ? config.appId : undefined;
    if (appId && BackendSogniClient.instances.has(appId)) {
      console.log(`Reusing existing Sogni client with appId: ${appId}`);
      return BackendSogniClient.instances.get(appId)!;
    }
    
    // Create a new client and track it
    const client = new BackendSogniClient(appId ?? '');
    
    if (appId) {
      BackendSogniClient.instances.set(appId, client);
      console.log(`Created new Sogni client with appId: ${appId}`);
    }
    
    return client;
  }
  
  /**
   * Static method to disconnect all client instances (simplified)
   */
  static async disconnectAll(): Promise<void> {
    
    // Set global cleanup flag to avoid multiple API calls
    BackendSogniClient.isGlobalCleanup = true;
    
    console.log(`Disconnecting all ${BackendSogniClient.instances.size} BackendSogniClient instances`);
    
    // Send a single disconnect request for all clients
    try {
      await disconnectSession();
    } catch (error) {
      console.warn('Error in global disconnect request:', error);
    }
    
    // Then disconnect each client object
    const disconnectPromises = Array.from(BackendSogniClient.instances.values())
      .map(client => {
        try {
          return client.disconnect().catch(err => {
            console.warn(`Error disconnecting client ${client.appId}:`, err);
            return false;
          });
        } catch (err: unknown) {
          console.warn(`Error in disconnect call for client ${client.appId}:`, err);
          return Promise.resolve(false);
        }
      });
    
    await Promise.allSettled(disconnectPromises);
    
    // Clear all instances
    BackendSogniClient.instances.clear();
    BackendSogniClient.isGlobalCleanup = false;
    
    console.log('All BackendSogniClient instances disconnected');
  }
  
  /**
   * Cancel a running project
   * This will emit a 'cancelled' event to the project
   */
  async cancelProject(projectId: string): Promise<void> {
    console.log(`Cancelling project: ${projectId}`);
    const project = this.activeProjects.get(projectId);
    
    if (project) {
      try {
        // Call the backend cancellation API
        await cancelProject(projectId);
        
        // Emit cancelled event
        project.emit('cancelled');
        // Emit failed event to ensure client handles cleanup
        project.emit('failed', new Error('Project cancelled by user'));
        
        // Fail all jobs that haven't completed
        project.jobs.forEach(job => {
          if (!job.resultUrl) {
            project.failJob(job.id, 'Project cancelled by user');
          }
        });
        
        // Remove from active projects
        this.activeProjects.delete(projectId);
      } catch (error: unknown) {
        console.error(`Error cancelling project ${projectId}:`, error);
        // Still attempt cleanup even if the API call fails
        const errorMsg = error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string'
          ? (error as { message: string }).message
          : String(error);
        project.emit('failed', new Error(`Project cancellation failed: ${errorMsg}`));
        this.activeProjects.delete(projectId);
      }
    }
  }
  
  /**
   * Create a new project using the backend API
   */
  private createProject(params: Record<string, unknown>): Promise<BackendProject> {
    // Debug log to track sourceType
    console.log(`BackendSogniClient.createProject called with sourceType: ${typeof params.sourceType === 'string' ? params.sourceType : 'undefined'}`);
    
    // Only clean up old projects for non-enhancement requests to prevent timeout conflicts
    // Enhancement projects should run independently without interfering with main generation
    const isEnhancement = params.sourceType === 'enhancement';
    if (this.activeProjects.size > 0 && !isEnhancement) {
      console.log(`Cleaning up ${this.activeProjects.size} old projects before starting new one`);
      for (const [oldProjectId, oldProject] of this.activeProjects.entries()) {
        try {
          // Emit cancelled event to clean up any timers
          oldProject.emit('cancelled');
          oldProject.emit('failed', new Error('Replaced by new project'));
          console.log(`Cleaned up old project ${oldProjectId}`);
        } catch (error) {
          console.warn(`Error cleaning up old project ${oldProjectId}:`, error);
        }
      }
      this.activeProjects.clear();
    } else if (isEnhancement) {
      console.log(`Creating enhancement project without cleaning up existing ${this.activeProjects.size} projects`);
    }
    
    // Create a new project object to return to the caller
    const projectId = `backend-project-${Date.now()}`;
    const project = new BackendProject(projectId);
    
    // Keep track of this project
    this.activeProjects.set(projectId, project);
    
    // Create placeholder jobs initially - but these will be replaced by real job IDs from the server
    // This matches the SDK behavior where jobs are created dynamically as they are initialized
    const numImages = typeof params.numberOfMedia === 'number' ? params.numberOfMedia : 0;
    const placeholderJobs = new Map<number, string>();
    for (let i = 0; i < numImages; i++) {
      // Create a temporary placeholder - these will be updated with real jobIds 
      // when we receive 'initiating' or 'started' events from the server
      const placeholderId = `placeholder-${projectId}-${i}`;
      placeholderJobs.set(i, placeholderId);
      project.addJob(placeholderId, undefined, i); // Store the index for mapping
    }
    
    // Start the backend generation process
    try {
      apiCreateProject(params, (progressEvent: unknown) => {
        
        // Handle different event types from the server
        // console.log('ApiCreateProject progress callback received:', JSON.stringify(progressEvent));
        
        // Handle upload progress events from XMLHttpRequest
        if (progressEvent && typeof progressEvent === 'object') {
          const event = progressEvent as Record<string, unknown>;
          const eventType = event.type as string;
          
          if (eventType === 'uploadProgress') {
            const uploadProgress = event.progress as number;
            project.emit('uploadProgress', uploadProgress);
            return; // Don't process as normal generation event
          }
          
          if (eventType === 'uploadComplete') {
            // Add a small delay for server-to-server Sogni upload
            setTimeout(() => {
              project.emit('uploadComplete');
            }, 2000);
            return; // Don't process as normal generation event
          }
        }
        
        // Handle numeric progress (simple case) - distribute to all jobs
        if (typeof progressEvent === 'number') {
          project.jobs.forEach((job) => {
            project.updateJobProgress(job.id, progressEvent);
          });
        } 
        // Handle structured events (most cases)
        else if (progressEvent && typeof progressEvent === 'object') {
          const event = progressEvent as Record<string, unknown>;
          const eventType = event.type as string;
          const jobId = 'jobId' in event ? event.jobId as string : undefined;
          
          // Extract worker name from any event if available
          let workerName: string | undefined = undefined;
          if (typeof event.workerName === 'string') {
            workerName = event.workerName;
          }
          
          console.log(`Event ${eventType} with jobId: ${jobId}`);
          
          // Handle project-level events first (these don't need a target job)
          if (eventType === 'completed') {
            console.log(`Project completion event received for ${project.id}`);
            
            // Debug: log project job states at completion
            const incompleteJobs = project.jobs ? project.jobs.filter(j => !j.resultUrl && !j.error) : [];
            console.log(`BackendProject: At project completion, ${incompleteJobs.length} jobs still incomplete:`,
              incompleteJobs.map(j => ({ id: j.id, realJobId: j.realJobId })));
            
            // Add missing jobs info to the completion event for the API layer
            const completionEvent = {
              ...event,
              missingJobs: {
                expected: project.jobs ? project.jobs.length : 0,
                completed: project.jobs ? project.jobs.filter(j => j.resultUrl || j.error).length : 0
              }
            };
            
            // If there are still incomplete jobs, delay the completion event
            if (incompleteJobs.length > 0) {
              console.log(`Frontend delaying project completion - waiting for ${incompleteJobs.length} jobs to complete`);
              
              // Store the completion intent and wait for remaining job completions
              (project as any)._pendingCompletion = true;
              (project as any)._completionStartTime = Date.now();
              (project as any)._completionCheckInterval = setInterval(() => {
                const stillIncomplete = project.jobs ? project.jobs.filter(j => !j.resultUrl && !j.error) : [];
                if (stillIncomplete.length === 0) {
                  console.log(`All jobs now complete, sending delayed project completion for ${project.id}`);
                  clearInterval((project as any)._completionCheckInterval);
                  delete (project as any)._completionCheckInterval;
                  delete (project as any)._pendingCompletion;
                  delete (project as any)._completionStartTime;
                  project.emit('completed', completionEvent);
                } else {
                  const elapsedSeconds = Math.floor((Date.now() - (project as any)._completionStartTime) / 1000);
                  console.log(`Still waiting for ${stillIncomplete.length} jobs to complete (${elapsedSeconds}s elapsed)`);
                  
                  // After 10 seconds of waiting, start being more aggressive about failing orphaned jobs
                  if (elapsedSeconds >= 10) {
                    console.log(`After ${elapsedSeconds}s, assuming remaining jobs are orphaned and failing them`);
                    stillIncomplete.forEach(job => {
                      console.log(`Auto-failing orphaned job ${job.id} (realJobId: ${job.realJobId || 'unassigned'}) after ${elapsedSeconds}s wait`);
                      project.failJob(job.id, 'Generation failed - job appears to be orphaned after project completion');
                    });
                  }
                }
              }, 100); // Check every 100ms
              
              // Failsafe timeout after 15 seconds
              setTimeout(() => {
                if ((project as any)._completionCheckInterval) {
                  console.log(`Frontend failsafe timeout - checking for orphaned jobs`);
                  
                  // Before sending completion, fail any jobs that are still incomplete
                  // This handles cases where server-side errors prevent individual job completion events
                  const stillIncomplete = project.jobs ? project.jobs.filter(j => !j.resultUrl && !j.error) : [];
                  if (stillIncomplete.length > 0) {
                    console.log(`Failsafe: Auto-failing ${stillIncomplete.length} orphaned jobs that never received completion events`);
                    stillIncomplete.forEach(job => {
                      console.log(`Failsafe: Failing orphaned job ${job.id} (realJobId: ${job.realJobId || 'unassigned'})`);
                      project.failJob(job.id, 'Generation failed - no completion event received');
                    });
                  }
                  
                  console.log(`Frontend failsafe timeout - sending project completion anyway`);
                  clearInterval((project as any)._completionCheckInterval);
                  delete (project as any)._completionCheckInterval;
                  delete (project as any)._pendingCompletion;
                  delete (project as any)._completionStartTime;
                  project.emit('completed', completionEvent);
                }
              }, 15000);
            } else {
              // All jobs already complete, send immediately
              console.log(`All jobs already complete, sending project completion immediately`);
              project.emit('completed', completionEvent);
            }
            return;
          }
          
          if (eventType === 'failed') {
            // Clean up any pending completion intervals on failure
            if ((project as any)._completionCheckInterval) {
              console.log(`Cleaning up completion interval for failed project ${project.id}`);
              clearInterval((project as any)._completionCheckInterval);
              delete (project as any)._completionCheckInterval;
              delete (project as any)._pendingCompletion;
              delete (project as any)._completionStartTime;
            }
            
            const failureError = new Error(event.error as string || 'Project failed') as Error & { projectId: string };
            failureError.projectId = project.id;
            project.emit('failed', failureError);
            return;
          }
          
          if (eventType === 'error') {
            // Clean up any pending completion intervals on error
            if ((project as any)._completionCheckInterval) {
              console.log(`Cleaning up completion interval for errored project ${project.id}`);
              clearInterval((project as any)._completionCheckInterval);
              delete (project as any)._completionCheckInterval;
              delete (project as any)._pendingCompletion;
              delete (project as any)._completionStartTime;
            }
            
            console.error(`Backend reported an error for project ${project.id}:`, event);
            const backendErrorMessage = event.message as string || 'Backend generation error';
            const errorWithContext = new Error(backendErrorMessage) as Error & { projectId: string };
            errorWithContext.projectId = project.id;
            project.emit('failed', errorWithContext);
            project.jobs.forEach(job => {
              if (!job.resultUrl && !job.error) {
                project.failJob(job.id, backendErrorMessage);
              }
            });
            return;
          }
          
          // For job-level events, find the corresponding frontend job placeholder
          let jobIndex = project.jobs.findIndex(j => j.realJobId === jobId);
          
          // If no job has this realJobId yet, find the first available job without a realJobId
          if (jobIndex === -1) {
            jobIndex = project.jobs.findIndex(j => !j.realJobId);
          }
          
          let targetJob = jobIndex >= 0 ? project.jobs[jobIndex] : null;

          // Handle the 'queued' event
          if (eventType === 'queued') {
              const queuePosition = event.queuePosition as number;
              if (targetJob) {
                  console.log(`Handling queued event for job ${targetJob.id} with position ${queuePosition}`);
                  // Emit a job event with the queued type and position
                  project.emit('job', {
                      type: 'queued',
                      jobId: targetJob.id, // Use placeholder ID
                      realJobId: jobId, // Include real ID if available (though queued might not have it yet)
                      projectId: project.id,
                      queuePosition: queuePosition,
                  });
              } else {
                  console.warn(`Queued event received for unknown job ID: ${jobId || 'N/A'}`);
              }
              // No further processing needed for queued event in this switch
              return;
          }
          
          // If it's not a queued event, and we don't have a target job yet, log and maybe handle later
          if (!targetJob) {
            // For events like 'initiating' or 'started', we might not have a realJobId yet.
            // We should try to find a pending job placeholder based on index if provided.
            const jobIndexByIndex = typeof event.index === 'number' ? project.jobs.findIndex(j => j.jobIndex === event.index) : -1;
            targetJob = jobIndexByIndex >= 0 ? project.jobs[jobIndexByIndex] : null;
          }

          // If still no target job, it might be a project-level event or an unexpected job ID
          if (!targetJob) {
              console.warn(`Event ${eventType} received for unknown job ID: ${jobId || 'N/A'}, and no job found by index.`);
              // Consider if this event should be ignored or logged differently
              return; // Skip processing if no target job is found
          }

          // Update the realJobId once we get it from any event that has a jobId
          if (jobId && !targetJob.realJobId) {
              targetJob.realJobId = jobId;
              console.log(`[JOB ASSIGNMENT] Assigned realJobId ${jobId} to placeholder job ${targetJob.id} from event ${eventType}`);
          }
          
          // Update worker name if available
          if (workerName && !targetJob.workerName) {
              targetJob.workerName = workerName;
              console.log(`Assigned workerName ${workerName} to placeholder job ${targetJob.id}`);
          }

          // Process based on event type
          switch (eventType) {
            case 'initiating':
            case 'started':
              if (targetJob) {
                targetJob.jobIndex = event.index as number;
                targetJob.positivePrompt = event.positivePrompt as string;
                project.emit('job', { 
                  type: eventType, 
                  jobId: targetJob.id, // Emit with placeholder ID
                  realJobId: jobId, // Include real ID
                  projectId: project.id,
                  workerName,
                  positivePrompt: event.positivePrompt as string,
                  jobIndex: event.index as number,
                });
              }
              break;

            case 'progress':
              if (targetJob && event.progress !== undefined) {
                project.updateJobProgress(targetJob.id, event.progress as number, targetJob.workerName);
              }
              break;
              
            case 'preview':
              if (targetJob) {
                const previewUrl = event.previewUrl as string || event.resultUrl as string;
                const jobId = event.jobId as string;
                const imgId = event.imgID as string;
                

                
                if (previewUrl) {
                  // Check if this is a direct URL or needs to be constructed
                  let finalPreviewUrl = previewUrl;
                  
                  // If it's not a full URL, construct it via the API endpoint
                  if (!previewUrl.startsWith('http') && imgId && jobId) {

                    
                    // Construct the preview download URL via the API
                    const constructPreviewUrl = async () => {
                      try {
                        const response = await fetch('/api/sogni/image/downloadUrl', {
                          method: 'POST',
                          headers: {
                            'Content-Type': 'application/json',
                          },
                          body: JSON.stringify({
                            jobId: jobId,
                            imageId: imgId,
                            type: 'preview'
                          })
                        });
                        
                        if (response.ok) {
                          const data = await response.json();
                          const downloadUrl = data?.data?.downloadUrl;
                          

                          
                          if (downloadUrl) {
                            // Update the job with the constructed URL
                            targetJob.previewUrl = downloadUrl;
                            
                            // Emit the event with the proper URL
                            project.emit('jobCompleted', {
                              ...targetJob,
                              resultUrl: downloadUrl,
                              previewUrl: downloadUrl,
                              isPreview: true
                            });
                          } else {

                          }
                        } else {

                          // Fallback: try using the original preview URL as-is

                          targetJob.previewUrl = previewUrl;
                          project.emit('jobCompleted', {
                            ...targetJob,
                            resultUrl: previewUrl,
                            previewUrl: previewUrl,
                            isPreview: true
                          });
                        }
                      } catch (error) {

                        // Fallback: try using the original preview URL as-is

                        targetJob.previewUrl = previewUrl;
                        project.emit('jobCompleted', {
                          ...targetJob,
                          resultUrl: previewUrl,
                          previewUrl: previewUrl,
                          isPreview: true
                        });
                      }
                    };
                    
                    // Call async function
                    constructPreviewUrl();
                    return; // Don't emit event yet, wait for URL construction
                  }
                  
                  // Set ONLY the preview URL - DO NOT set resultUrl (that would mark job as completed)
                  targetJob.previewUrl = finalPreviewUrl;
                  

                  
                  // Emit a jobCompleted-like event but mark it as preview
                  project.emit('jobCompleted', {
                    ...targetJob,
                    resultUrl: finalPreviewUrl, // Pass preview URL as resultUrl for the event only
                    previewUrl: finalPreviewUrl,
                    isPreview: true
                  });
                  

                } else {
                  console.warn(`[PREVIEW DEBUG] Preview event received but no previewUrl found:`, event);
                }
              } else {
                console.warn(`[PREVIEW DEBUG] Preview event received but no target job found for jobId:`, event.jobId);
              }
              break;
              
            case 'jobCompleted':
              if (targetJob) {
                const resultUrl = event.resultUrl as string;
                const isNSFW = event.nsfwFiltered as boolean;
                
                if (resultUrl) {
                  // Check if this job was already completed (race condition protection)
                  if (targetJob.resultUrl) {
                    console.log(`Job ${targetJob.id} was already completed, ignoring duplicate completion event`);
                  } else {
                    project.completeJob(targetJob.id, resultUrl);
                  
                    // Check if we're waiting for project completion and all jobs are now done
                    if ((project as any)._pendingCompletion) {
                      const stillIncomplete = project.jobs ? project.jobs.filter(j => !j.resultUrl && !j.error) : [];
                      if (stillIncomplete.length === 0) {
                        console.log(`Final job completed while waiting - triggering delayed project completion for ${project.id}`);
                        if ((project as any)._completionCheckInterval) {
                          clearInterval((project as any)._completionCheckInterval);
                          delete (project as any)._completionCheckInterval;
                        }
                        delete (project as any)._pendingCompletion;
                        delete (project as any)._completionStartTime;
                        
                        // Create completion event with job info
                        const finalCompletionEvent = {
                          type: 'completed',
                          missingJobs: {
                            expected: project.jobs ? project.jobs.length : 0,
                            completed: project.jobs ? project.jobs.filter(j => j.resultUrl || j.error).length : 0
                          }
                        };
                        
                        project.emit('completed', finalCompletionEvent);
                      }
                    }
                  }
                } else if (isNSFW) {
                  console.warn(`Job ${targetJob.id} (real ID ${jobId}) completed but was filtered due to NSFW content`);
                  // Mark job as failed due to NSFW filtering
                  project.failJob(targetJob.id, 'CONTENT FILTERED: NSFW detected');
                } else {
                  console.warn(`Job ${targetJob.id} (real ID ${jobId}) completed but resultUrl is missing`);
                  project.failJob(targetJob.id, 'No result URL provided');
                }
              } else {
                console.warn(`jobCompleted event received for ${jobId}, but couldn't find target job. Available jobs:`, 
                  project.jobs.map(j => ({ id: j.id, realJobId: j.realJobId })));
              }
              break;
              
            case 'jobFailed':
              if (targetJob) {
                const error = event.error as string || 'Generation failed';
                console.log(`Processing jobFailed for placeholder ${targetJob.id} (real ID ${jobId}) with error: ${error}`);
                project.failJob(targetJob.id, error);
              } else {
                console.warn(`jobFailed event received for ${jobId}, but couldn't find target job.`);
              }
              break;
              
            // Ignore project-progress and connected types here, handled elsewhere or implicitly
            case 'project-progress': 
            case 'connected':
              break;
              
            // Project-level events (failed, error, completed) are handled earlier before job lookup
              
            default:
              console.warn(`Unhandled event type in apiCreateProject callback: ${eventType}`);
          }
        }
      }).then((result: unknown) => {
        // Handle overall project completion
        if (result && typeof result === 'object' && 'imageUrls' in result) {
          const imageUrls = (result as Record<string, unknown>).imageUrls as string[];
          project.emit('completed', imageUrls);
        }
      }).catch((error: unknown) => {
        // Check if this project is still active (not replaced by a newer project)
        const isStillActive = this.activeProjects.has(projectId);
        
        if (!isStillActive) {
          console.log(`Ignoring error for old project ${projectId} (replaced by newer project):`, error);
          return; // Don't emit failed event for old projects
        }
        
        console.error('Backend generation process failed:', error);
        project.emit('uploadComplete'); // Clean up upload progress
        
        // Preserve NetworkError properties when emitting failure
        if (error && typeof error === 'object' && error.constructor && error.constructor.name === 'NetworkError') {
          // Pass the original NetworkError to preserve its properties
          project.emit('failed', error);
        } else {
          // For other errors, create a new Error with the message
          const errorMsg = error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string'
            ? (error as { message: string }).message
            : String(error);
          project.emit('failed', new Error(errorMsg));
        }
        // Remove from active projects
        this.activeProjects.delete(projectId);
      });
    } catch (error) {
      // Check if this project is still active (not replaced by a newer project)
      const isStillActive = this.activeProjects.has(projectId);
      
      if (!isStillActive) {
        console.log(`Ignoring sync error for old project ${projectId} (replaced by newer project):`, error);
        return Promise.resolve(project); // Don't emit failed event for old projects
      }
      
      console.error('Error starting generation:', error);
      console.error('Error details:', {
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        message: error && typeof error === 'object' && 'message' in error ? (error as { message: string }).message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      project.emit('uploadComplete'); // Clean up upload progress
      
      // Preserve NetworkError properties when emitting failure
      if (error && typeof error === 'object' && error.constructor && error.constructor.name === 'NetworkError') {
        // Pass the original NetworkError to preserve its properties
        project.emit('failed', error);
      } else {
        // For other errors, create a user-friendly error message
        const errorMsg = error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string'
          ? (error as { message: string }).message
          : String(error);
        
        const userFriendlyError = new Error(
          errorMsg.includes('Network error') || errorMsg.includes('connection') 
            ? 'Unable to connect to the image generation service. Please check your internet connection and try again.'
            : errorMsg
        );
        project.emit('failed', userFriendlyError);
      }
      // Remove from active projects
      this.activeProjects.delete(projectId);
    }
    
    return Promise.resolve(project);
  }

  /**
   * Estimate the cost of a project before creating it
   */
  private async estimateCost(params: Record<string, unknown>): Promise<{ token: number } | null> {
    try {
      const response = await fetch(`${API_BASE_URL}/api/sogni/estimate-cost`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-App-ID': this.appId
        },
        body: JSON.stringify(params)
      });

      if (!response.ok) {
        throw new Error(`Cost estimation failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.warn('Cost estimation failed:', error);
      return null;
    }
  }
}

/**
 * Initialize the Sogni client through the backend
 */
export function initializeSogniClient(): Promise<BackendSogniClient> {
  try {
    // Check if the backend is available
    void checkSogniStatus()
      .then(() => {
        console.log('✅ Initial Sogni connection established');
      })
      .catch(err => {
        // Differentiate between throttling and real errors
        if (err.message === 'Status check throttled') {
          console.log('⏳ Sogni status check throttled (this is normal during initialization)');
        } else {
          console.warn('❌ Failed to establish initial Sogni connection:', err);
        }
      });
    
    // Create a new client instance with a fixed app ID to prevent duplicates
    const client = BackendSogniClient.createInstance({
      appId: clientAppId || `photobooth-frontend-${Date.now()}`,
      testnet: false,
      network: "fast",
      logLevel: "debug"
    });
    
    // Mock login
    void client.account.login();
    
    return Promise.resolve(client);
  } catch (error) {
    const errorMsg = error && typeof error === 'object' && 'message' in error && typeof (error as { message: unknown }).message === 'string'
      ? (error as { message: string }).message
      : String(error);
    console.error('Error initializing Sogni client:', errorMsg);
    throw new Error(errorMsg);
  }
}

/**
 * Generate image using the backend
 */
export function generateImage(): Promise<string[]> {
  // Implementation will be moved from App.jsx
  // This is just the interface for now
  return Promise.resolve([]);
}