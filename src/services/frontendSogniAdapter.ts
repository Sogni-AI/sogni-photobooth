import { SogniClient } from '@sogni-ai/sogni-client';
import { trackFrontendGeneration, trackVideoGeneration } from './frontendAnalytics';

/**
 * Adapter that wraps the real Sogni Client SDK to emit the same events
 * as the BackendSogniClient, ensuring compatibility with the photobooth UI
 */

interface SogniEventEmitter {
  on(event: string, listener: (...args: any[]) => void): void;
  emit(event: string, ...args: any[]): boolean;
  off?(event: string, listener: (...args: any[]) => void): void;
  removeListener?(event: string, listener: (...args: any[]) => void): void;
}

/**
 * Simple browser-compatible event emitter
 */
class BrowserEventEmitter implements SogniEventEmitter {
  private listeners: Map<string, ((...args: any[]) => void)[]> = new Map();

  on(event: string, listener: (...args: any[]) => void): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  emit(event: string, ...args: any[]): boolean {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(...args);
        } catch (error) {
          console.error(`Error in event listener for ${event}:`, error);
        }
      });
      return true;
    }
    return false;
  }

  off(event: string, listener: (...args: any[]) => void): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  removeListener(event: string, listener: (...args: any[]) => void): void {
    this.off(event, listener);
  }
}

/**
 * Adapter for the real Sogni SDK Project to emit BackendProject-compatible events
 */
export class FrontendProjectAdapter extends BrowserEventEmitter implements SogniEventEmitter {
  private realProject: any;
  private realClient: any;
  private jobIndexMap: Map<string, number> = new Map();
  private nextJobIndex: number = 0;
  private isCompleted: boolean = false;
  private uploadProgressEmitted: boolean = false;
  private jobPrompts: Map<string, string> = new Map(); // Store individual job prompts from global events
  private workerNameCache: Map<string, string> = new Map(); // Store worker names from early events (like backend)
  private failedJobs: Map<string, string> = new Map(); // Track failed jobs by ID -> error message
  private completionTracker = {
    expectedJobs: 0,
    sentJobCompletions: 0,
    projectCompletionReceived: false,
    projectCompletionEvent: null as any,
    jobCompletionTimeouts: new Map<string, NodeJS.Timeout>()
  };
  private globalJobHandler: any = null;

  constructor(realProject: any, realClient: any) {
    super();
    this.realProject = realProject;
    this.realClient = realClient;
    // Initialize completion tracker with expected job count
    this.completionTracker.expectedJobs = realProject.params?.numberOfMedia || 1;
    this.setupEventMapping();
  }

  // Method to set individual job prompt from global events
  setJobPrompt(jobId: string, positivePrompt: string) {
    this.jobPrompts.set(jobId, positivePrompt);
  }


  // Expose the real project's properties and methods
  get id() { return this.realProject.id; }
  get jobs() {
    // Return job objects with error properties set for failed jobs (like backend client does)
    if (!this.realProject.jobs) return this.realProject.jobs;
    
    return this.realProject.jobs.map((job: any) => {
      const failedError = this.failedJobs.get(job.id);
      if (failedError) {
        // Return a copy of the job with the error property set
        return { ...job, error: failedError };
      }
      return job;
    });
  }
  get status() { return this.realProject.status; }

  // Forward method calls to the real project
  async start() { return this.realProject.start(); }
  async cancel() { return this.realProject.cancel(); }

  private setupEventMapping() {
    // Handle upload progress - the real SDK doesn't emit this, so we simulate it
    this.simulateUploadProgress();

    // Set up global job event handler for progress events (better reliability)
    this.setupGlobalProgressHandler();

    // CRITICAL FIX: Set up comprehensive job prompt capture to handle RandomMix race condition
    // Listen for ALL possible events that might contain individual job prompts
    const captureJobPrompt = (event: any) => {
      const jobId = event.jobId || event.id;
      if (jobId && event.positivePrompt) {
        this.jobPrompts.set(jobId, event.positivePrompt);
      }
    };

    // Listen for individual project events for prompt capture (better accuracy)
    this.realProject.on('jobStarted', (event: any) => {
      captureJobPrompt(event);
    });

    // Also listen for any other events that might contain individual job prompts
    this.realProject.on('progress', (event: any) => {
      captureJobPrompt(event);
    });

    this.realProject.on('jobCompleted', (event: any) => {
      captureJobPrompt(event);
    });

    // NOTE: Preview events are handled in the global job handler (setupGlobalProgressHandler)
    // The 'preview' case in the switch statement handles SDK preview events.

    // ADDITIONAL: Listen for job events directly from the real client if available
    if (this.realClient && this.realClient.projects && typeof this.realClient.projects.on === 'function') {
      this.realClient.projects.on('job', (event: any) => {
        // Only process events for this specific project
        if (event.projectId === this.realProject.id) {
          captureJobPrompt(event);
        }
      });
    }

    // Map jobStarted events to job events with 'started' type
    this.realProject.on('jobStarted', (job: any) => {
      
      // ENHANCED: Capture individual job prompt from multiple sources in the job object
      if (job.id) {
        let jobPrompt = '';
        if (job.positivePrompt) {
          jobPrompt = job.positivePrompt;
        } else if (job.params && job.params.positivePrompt) {
          jobPrompt = job.params.positivePrompt;
        }
        
        if (jobPrompt) {
          this.jobPrompts.set(job.id, jobPrompt);
        }
        
        // Cache worker name if provided (matches backend logic)
        if (job.workerName) {
          this.workerNameCache.set(job.id, job.workerName);
        }
      }
      
      // Assign job index
      if (!this.jobIndexMap.has(job.id)) {
        this.jobIndexMap.set(job.id, this.nextJobIndex++);
      }
      
      const jobIndex = this.jobIndexMap.get(job.id);
      
      // CRITICAL: Emit jobStarted event that App.jsx listens for to map job IDs
      this.emit('jobStarted', job);
      
      // Use the individual job prompt from captured prompts (working approach)
      const individualJobPrompt = this.jobPrompts.get(job.id) || this.realProject.params?.positivePrompt || '';
      
      // Get cached worker name or use default (matches backend logic)
      const cachedWorkerName = this.workerNameCache.get(job.id);
      const workerName = job.workerName || cachedWorkerName || 'Worker';
      
      // Also emit the job started event that the UI expects for status updates
      this.emit('job', {
        type: 'started',
        jobId: job.id,
        projectId: this.realProject.id,
        workerName: workerName,
        jobIndex,
        positivePrompt: individualJobPrompt // Use the individual job prompt from captured prompts
      });
    });

    // Map jobCompleted events with proper completion tracking
    this.realProject.on('jobCompleted', (job: any) => {
      
      // Try multiple sources for the individual job prompt with enhanced debugging
      let individualJobPrompt = '';
      
      // 1. Check our captured prompts map (PREFERRED for RandomMix)
      if (this.jobPrompts.has(job.id)) {
        individualJobPrompt = this.jobPrompts.get(job.id) || '';
      }
      // 2. Check job object itself
      else if (job.positivePrompt) {
        individualJobPrompt = job.positivePrompt;
        // Also store it for future reference
        this.jobPrompts.set(job.id, job.positivePrompt);
      }
      // 3. Check job params
      else if (job.params && job.params.positivePrompt) {
        individualJobPrompt = job.params.positivePrompt;
        // Also store it for future reference
        this.jobPrompts.set(job.id, job.params.positivePrompt);
      }
      // 4. Fallback to project prompt (this causes the race condition issue for RandomMix)
      else {
        individualJobPrompt = this.realProject.params?.positivePrompt || '';
      }
      
      // CRITICAL ERROR HANDLING: Check for missing resultUrl (matches backend logic)
      let resultUrl = job.resultUrl;
      
      // RACE CONDITION FIX: If resultUrl is missing from event, try to get it from project.jobs array
      // The SDK sometimes emits jobCompleted before the job object is fully updated
      if (!resultUrl && !job.fallback && this.realProject.jobs) {
        const projectJob = this.realProject.jobs.find((j: any) => j.id === job.id);
        if (projectJob && projectJob.resultUrl) {
          console.warn(`[FrontendAdapter] Job ${job.id} resultUrl missing from event but found in project.jobs array`);
          resultUrl = projectJob.resultUrl;
        }
      }
      
      // Get cached worker name or use default (matches backend logic)
      const cachedWorkerName = this.workerNameCache.get(job.id);
      const workerName = job.workerName || cachedWorkerName || 'Worker';
      
      // Cache worker name if provided (for future reference)
      if (job.workerName && job.id) {
        this.workerNameCache.set(job.id, job.workerName);
      }
      
      // CRITICAL FIX: Handle NSFW filtering and missing results (matches backend client behavior)
      // When job is NSFW-filtered or missing result, emit jobFailed instead of jobCompleted
      if (job.isNSFW && !resultUrl) {
        // Track this job as failed (so the jobs getter can return it with error property set)
        const errorMessage = 'CONTENT FILTERED: NSFW detected';
        this.failedJobs.set(job.id, errorMessage);
        
        this.emit('jobFailed', {
          id: job.id,
          error: errorMessage,
          isNSFW: true,
          positivePrompt: individualJobPrompt,
          workerName: workerName
        });

        // Track completion for project completion handling
        this.completionTracker.sentJobCompletions++;

        // Clear any timeout for this job
        const timeoutId = this.completionTracker.jobCompletionTimeouts.get(job.id);
        if (timeoutId) {
          clearTimeout(timeoutId);
          this.completionTracker.jobCompletionTimeouts.delete(job.id);
        }

        // Check if we can send project completion
        this.checkAndSendProjectCompletion();
        return;
      }

      // Check for missing resultUrl without NSFW flag (also should fail)
      if (!resultUrl && !job.fallback) {
        // Track this job as failed (so the jobs getter can return it with error property set)
        const errorMessage = 'No result URL provided';
        this.failedJobs.set(job.id, errorMessage);
        
        this.emit('jobFailed', {
          id: job.id,
          error: errorMessage,
          positivePrompt: individualJobPrompt,
          workerName: workerName
        });

        // Track completion for project completion handling
        this.completionTracker.sentJobCompletions++;

        // Clear any timeout for this job
        const timeoutId = this.completionTracker.jobCompletionTimeouts.get(job.id);
        if (timeoutId) {
          clearTimeout(timeoutId);
          this.completionTracker.jobCompletionTimeouts.delete(job.id);
        }

        // Check if we can send project completion
        this.checkAndSendProjectCompletion();
        return;
      }

      // Prepare the jobCompleted event for successful jobs
      const completedEvent: any = {
        id: job.id,
        resultUrl: resultUrl,
        previewUrl: job.previewUrl,
        isPreview: job.isPreview || false,
        positivePrompt: individualJobPrompt,
        workerName: workerName,
        isNSFW: job.isNSFW || false,
        seed: job.seed,
        steps: job.steps
      };

      // Emit the jobCompleted event for successful jobs
      this.emit('jobCompleted', completedEvent);

      // Track job completion for proper project completion handling
      this.completionTracker.sentJobCompletions++;

      // Clear any timeout for this job
      const timeoutId = this.completionTracker.jobCompletionTimeouts.get(job.id);
      if (timeoutId) {
        clearTimeout(timeoutId);
        this.completionTracker.jobCompletionTimeouts.delete(job.id);
      }

      // Check if we can send project completion (like backend does)
      this.checkAndSendProjectCompletion();
    });

    // Map project completion with proper timing handling (like backend does)
    this.realProject.on('completed', () => {
      if (!this.completionTracker.projectCompletionReceived) {
        
        // Store the completion event instead of sending it immediately (fix for SDK timing issue)
        this.completionTracker.projectCompletionReceived = true;
        this.completionTracker.projectCompletionEvent = {
          type: 'completed',
          projectId: this.realProject.id
        };
        
        // Emit uploadComplete to hide upload progress
        this.emit('uploadComplete');
        
        // Check if we can send the project completion immediately
        this.checkAndSendProjectCompletion();
      }
    });

    // Map project failure
    this.realProject.on('failed', (error: any) => {
      this.emit('failed', error);
    });

    // Forward any other events that might be needed
    this.realProject.on('error', (error: any) => {
      this.emit('error', error);
    });

    // Set up job completion timeouts (like backend does) to handle stuck jobs
    this.setupJobCompletionTimeouts();
  }

  // Set up global progress handler for reliable progress events
  private setupGlobalProgressHandler() {
    // Create global job event handler specifically for progress events
    this.globalJobHandler = (event: any) => {
      try {
        // Only process events for this specific project
        if (event.projectId !== this.realProject.id) {
          return;
        }
        
        // Handle different event types
        switch (event.type) {
          case 'queued': {
            // Handle queued events - emit with queue position for video and image jobs
            const queuePosition = event.queuePosition;
            if (queuePosition !== undefined) {
              this.emit('job', {
                type: 'queued',
                jobId: event.jobId,
                projectId: this.realProject.id,
                queuePosition: queuePosition
              });
            }
            break;
          }

          case 'preview': {
            // SDK JobPreview event has: { type: 'preview', projectId, jobId, url: string }
            const previewUrl = event.url;
            const jobId = event.jobId;
            
            if (previewUrl && jobId) {
              // Get cached worker name or use default
              const cachedWorkerName = this.workerNameCache.get(jobId);
              const workerName = event.workerName || cachedWorkerName || 'Worker';
              
              // Emit as jobCompleted with isPreview flag (matching backend behavior)
              this.emit('jobCompleted', {
                id: jobId,
                resultUrl: previewUrl,
                previewUrl: previewUrl,
                isPreview: true,
                positivePrompt: this.jobPrompts.get(jobId) || this.realProject.params?.positivePrompt || '',
                workerName: workerName
              });
            }
            break;
          }

          case 'jobETA': {
            // SDK JobETA event has: { type: 'jobETA', projectId, jobId, etaSeconds: number }
            const etaSeconds = event.etaSeconds;
            
            if (event.jobId && typeof etaSeconds === 'number') {
              const cachedWorkerName = this.workerNameCache.get(event.jobId);
              const workerName = cachedWorkerName || 'Worker';
              
              // Emit ETA event for the UI
              this.emit('job', {
                type: 'eta',
                eta: etaSeconds,
                jobId: event.jobId,
                projectId: this.realProject.id,
                workerName: workerName
              });
            }
            break;
          }

          case 'progress': {
            if (event.step && event.stepCount) {
              // Cache worker name if provided (matches backend logic)
              if (event.workerName && event.jobId) {
                this.workerNameCache.set(event.jobId, event.workerName);
              }

              // Get cached worker name or use default
              const cachedWorkerName = event.jobId ? this.workerNameCache.get(event.jobId) : null;
              const workerName = event.workerName || cachedWorkerName || 'Worker';

              // Emit progress event for the UI
              // Cap progress at 1.0 to prevent overflow when step exceeds stepCount
              // (can happen during video encoding/post-processing phases)
              const normalizedProgress = Math.min(1, event.step / event.stepCount);
              this.emit('job', {
                type: 'progress',
                progress: normalizedProgress, // Convert to 0-1 range, capped at 1.0
                step: event.step,
                stepCount: event.stepCount,
                jobId: event.jobId,
                projectId: this.realProject.id,
                workerName: workerName
              });
              
              // Set up fallback completion detection like backend
              if (event.jobId && event.step / event.stepCount >= 0.85) {
                if (!this.completionTracker.jobCompletionTimeouts.has(event.jobId)) {
                  const timeoutId = setTimeout(() => {
                    // Get cached worker name or use default
                    const cachedWorkerName = this.workerNameCache.get(event.jobId);
                    const workerName = event.workerName || cachedWorkerName || 'Worker';
                    
                    // Send fallback completion like backend does
                    this.emit('jobCompleted', {
                      id: event.jobId,
                      resultUrl: null,
                      previewUrl: null,
                      isPreview: false,
                      positivePrompt: this.jobPrompts.get(event.jobId) || this.realProject.params?.positivePrompt || '',
                      workerName: workerName,
                      fallback: true
                    });

                    this.completionTracker.sentJobCompletions++;
                    
                    // Clean up timeout
                    this.completionTracker.jobCompletionTimeouts.delete(event.jobId);
                    
                    // Check if all jobs are done
                    this.checkAndSendProjectCompletion();
                  }, 20000); // Wait 20 seconds after reaching 85% like backend
                  
                  this.completionTracker.jobCompletionTimeouts.set(event.jobId, timeoutId);
                }
              }
            }
            break;
          }
          
          case 'initiating':
          case 'started':
            // Emit job started events from global handler too for completeness
            if (event.jobId) {
              // Cache worker name if provided (matches backend logic)
              if (event.workerName) {
                this.workerNameCache.set(event.jobId, event.workerName);
              }
              
              // Get cached worker name or use default
              const cachedWorkerName = this.workerNameCache.get(event.jobId);
              const workerName = event.workerName || cachedWorkerName || 'Worker';
              
              const jobIndex = this.jobIndexMap.get(event.jobId);
              this.emit('job', {
                type: event.type,
                jobId: event.jobId,
                projectId: this.realProject.id,
                workerName: workerName,
                positivePrompt: this.jobPrompts.get(event.jobId) || this.realProject.params?.positivePrompt || '',
                jobIndex: jobIndex !== undefined ? jobIndex : 0
              });
            }
            break;
        }
        
      } catch (error) {
        console.error('[FrontendAdapter] Error in global progress handler:', error);
      }
    };
    
    // Register the global job event handler
    try {
      if (this.realClient.projects && typeof this.realClient.projects.on === 'function') {
        this.realClient.projects.on('job', this.globalJobHandler);
      }
    } catch (error) {
      console.error('[FrontendAdapter] Error registering global progress handler:', error);
    }
  }

  // Set up timeouts to handle jobs that might get stuck (like backend does)
  private setupJobCompletionTimeouts() {
    // The global progress handler now handles timeouts, so this is just a placeholder
    // for any additional timeout logic if needed
  }

  // Check if we can send project completion (replicates backend logic)
  private checkAndSendProjectCompletion() {
    if (this.completionTracker.projectCompletionReceived && 
        this.completionTracker.sentJobCompletions >= this.completionTracker.expectedJobs) {
      
      if (!this.isCompleted) {
        this.isCompleted = true;
        
        // Clear any remaining timeouts
        this.completionTracker.jobCompletionTimeouts.forEach((timeoutId) => {
          clearTimeout(timeoutId);
        });
        this.completionTracker.jobCompletionTimeouts.clear();
        
        // Emit project completion
        this.emit('completed');
      }
    }
  }


  private simulateUploadProgress() {
    // The real SDK doesn't emit upload progress events, so we simulate them
    // This matches the behavior expected by the photobooth UI
    
    let progress = 0;
    const interval = setInterval(() => {
      if (progress < 100 && !this.uploadProgressEmitted) {
        progress += Math.random() * 20 + 5; // Random progress increments
        progress = Math.min(progress, 100);
        
        this.emit('uploadProgress', progress);
        
        if (progress >= 100) {
          this.uploadProgressEmitted = true;
          clearInterval(interval);
          // Don't emit uploadComplete here - wait for actual completion
        }
      } else {
        clearInterval(interval);
      }
    }, 200); // Update every 200ms

    // Clean up if project completes quickly
    setTimeout(() => {
      clearInterval(interval);
      if (!this.uploadProgressEmitted) {
        this.emit('uploadProgress', 100);
        this.uploadProgressEmitted = true;
      }
    }, 5000); // Max 5 seconds for upload simulation
  }
}

/**
 * Adapter for the real Sogni Client to create BackendProject-compatible projects
 */
export class FrontendSogniClientAdapter {
  private realClient: SogniClient;

  // Video generation is supported when using the frontend SDK directly
  public readonly supportsVideo: boolean = true;

  constructor(realClient: SogniClient) {
    this.realClient = realClient;
  }

  get projects() {
    return {
      create: async (params: any) => {
        // Log project type for debugging (especially video generation issues)
        const projectType = params.type || 'image';
        console.log(`[FrontendAdapter] Creating ${projectType} project`, {
          type: params.type,
          modelId: params.modelId,
          hasReferenceImage: !!params.referenceImage,
          sourceType: params.sourceType
        });
        

        // Convert sensitiveContentFilter to disableNSFWFilter for SDK compatibility
        // This matches the backend's conversion logic in server/services/sogni.js
        const sdkParams = { ...params };
        
        // Ensure type parameter is included (required in v4.x.x)
        if (!sdkParams.type) {
          sdkParams.type = 'image'; // Default to image type
        }
        
        if ('sensitiveContentFilter' in params) {
          sdkParams.disableNSFWFilter = params.sensitiveContentFilter ? false : true;
          delete sdkParams.sensitiveContentFilter; // Remove to avoid passing both
        }
        
        // Debug log for enhancement jobs
        if (params.sourceType === 'enhancement' || params.sourceType === 'enhancement-qwen-image-edit') {
          console.log('[FrontendAdapter] Enhancement job params:', {
            modelId: params.modelId,
            sourceType: params.sourceType,
            sensitiveContentFilter_input: params.sensitiveContentFilter,
            disableNSFWFilter_output: sdkParams.disableNSFWFilter
          });
        }
        
        // Track analytics for frontend SDK generation (critical for logged-in users)
        // This ensures we capture metrics even when bypassing the backend /generate endpoint
        if (projectType === 'video') {
          // Track video generation separately
          trackVideoGeneration({
            resolution: params.resolution || 'unknown',
            quality: params.quality || 'unknown',
            sourceType: params.sourceType,
            modelId: params.modelId,
            width: params.width,
            height: params.height,
            success: true, // Will track failure separately if generation fails
          }).catch(err => {
            console.error('[FrontendAdapter] Video analytics tracking error:', err);
          });
        } else {
          // Track image generation
          trackFrontendGeneration({
            numberImages: params.numberOfMedia || 1,
            sourceType: params.sourceType,
            selectedModel: params.modelId,
          }).catch(err => {
            console.error('[FrontendAdapter] Analytics tracking error:', err);
          });
        }
        
        // Create the real project with converted parameters
        console.log(`[FrontendAdapter] Calling realClient.projects.create for ${projectType} project`);
        const realProject = await this.realClient.projects.create(sdkParams);
        console.log(`[FrontendAdapter] ${projectType} project created with ID: ${realProject.id}`);
        
        // Wrap it in our adapter, passing both project and client for global events
        const adaptedProject = new FrontendProjectAdapter(realProject, this.realClient);
        
        return adaptedProject;
      },
      estimateCost: async (params: any) => {
        // Forward cost estimation to the real client
        if (this.realClient.projects && typeof (this.realClient.projects as any).estimateCost === 'function') {
          return (this.realClient.projects as any).estimateCost(params);
        }
        throw new Error('Cost estimation not available on this client');
      },
      // Forward downloadUrl to the real client's projects API (for project history media)
      downloadUrl: async (params: { jobId: string; imageId: string; type: string }) => {
        if (this.realClient.projects && typeof (this.realClient.projects as any).downloadUrl === 'function') {
          return (this.realClient.projects as any).downloadUrl(params);
        }
        throw new Error('downloadUrl not available on this client');
      },
      // Forward mediaDownloadUrl to the real client's projects API (for project history videos)
      mediaDownloadUrl: async (params: { jobId: string; id: string; type: string }) => {
        if (this.realClient.projects && typeof (this.realClient.projects as any).mediaDownloadUrl === 'function') {
          return (this.realClient.projects as any).mediaDownloadUrl(params);
        }
        throw new Error('mediaDownloadUrl not available on this client');
      },
      on: (event: string, callback: (...args: any[]) => void) => {
        // Forward to the real client's projects if it has an 'on' method
        if (this.realClient.projects && typeof (this.realClient.projects as any).on === 'function') {
          (this.realClient.projects as any).on(event, callback);
        }
      },
      off: (event: string, callback: (...args: any[]) => void) => {
        // Forward to the real client's projects if it has an 'off' method
        if (this.realClient.projects && typeof (this.realClient.projects as any).off === 'function') {
          (this.realClient.projects as any).off(event, callback);
        }
      }
    };
  }

  // Forward other client properties and methods
  get account() { return this.realClient.account; }
  get apiClient() { return this.realClient.apiClient; }
  async disconnect() {
    if ((this.realClient as any).disconnect) {
      return (this.realClient as any).disconnect();
    }
  }

  /**
   * Cancel a project by ID
   * Returns a result compatible with BackendSogniClient's cancelProject
   */
  async cancelProject(projectId: string): Promise<{
    success: boolean;
    didCancel: boolean;
    projectId: string;
    rateLimited?: boolean;
    cooldownRemaining?: number;
    errorMessage?: string;
    completedJobs?: number;
    totalJobs?: number;
  }> {
    console.log(`[FrontendAdapter] Cancelling project: ${projectId}`);

    try {
      // Try to find the project in the SDK's tracked projects
      const projectsApi = this.realClient.projects as any;

      // The SDK tracks projects internally - try to cancel via the API
      if (projectsApi && typeof projectsApi.cancel === 'function') {
        await projectsApi.cancel(projectId);
        console.log(`[FrontendAdapter] Project ${projectId} cancelled via SDK`);
        return {
          success: true,
          didCancel: true,
          projectId
        };
      }

      // Fallback: Try to get the project and cancel it directly
      if (projectsApi && typeof projectsApi.get === 'function') {
        const project = await projectsApi.get(projectId);
        if (project && typeof project.cancel === 'function') {
          await project.cancel();
          console.log(`[FrontendAdapter] Project ${projectId} cancelled directly`);
          return {
            success: true,
            didCancel: true,
            projectId
          };
        }
      }

      console.warn(`[FrontendAdapter] Could not find cancel method for project ${projectId}`);
      return {
        success: false,
        didCancel: false,
        projectId,
        errorMessage: 'Cancel method not available'
      };
    } catch (error) {
      console.error(`[FrontendAdapter] Error cancelling project ${projectId}:`, error);
      return {
        success: false,
        didCancel: false,
        projectId,
        errorMessage: error instanceof Error ? error.message : String(error)
      };
    }
  }
}

/**
 * Create a frontend client adapter that makes the real Sogni Client
 * behave like the BackendSogniClient for UI compatibility
 */
export function createFrontendClientAdapter(realClient: SogniClient): FrontendSogniClientAdapter {
  return new FrontendSogniClientAdapter(realClient);
}
