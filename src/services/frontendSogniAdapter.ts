import { SogniClient } from '@sogni-ai/sogni-client';

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
  private jobIndexMap: Map<string, number> = new Map();
  private nextJobIndex: number = 0;
  private isCompleted: boolean = false;
  private uploadProgressEmitted: boolean = false;
  private jobPrompts: Map<string, string> = new Map(); // Store individual job prompts from global events
  private completionTracker = {
    expectedJobs: 0,
    sentJobCompletions: 0,
    projectCompletionReceived: false,
    projectCompletionEvent: null as any,
    jobCompletionTimeouts: new Map<string, NodeJS.Timeout>()
  };

  constructor(realProject: any) {
    super();
    this.realProject = realProject;
    // Initialize completion tracker with expected job count
    this.completionTracker.expectedJobs = realProject.params?.numberOfImages || 1;
    this.setupEventMapping();
  }

  // Method to set individual job prompt from global events
  setJobPrompt(jobId: string, positivePrompt: string) {
    this.jobPrompts.set(jobId, positivePrompt);
  }

  // Expose the real project's properties and methods
  get id() { return this.realProject.id; }
  get jobs() { return this.realProject.jobs; }
  get status() { return this.realProject.status; }

  // Forward method calls to the real project
  async start() { return this.realProject.start(); }
  async cancel() { return this.realProject.cancel(); }

  private setupEventMapping() {
    // Handle upload progress - the real SDK doesn't emit this, so we simulate it
    this.simulateUploadProgress();

    // Listen for global events that contain individual job prompts (like the backend does)
    // The Sogni SDK emits events with individual resolved prompts from {prompt1|prompt2|...} syntax
    this.realProject.on('jobStarted', (event: any) => {
      // Capture individual job prompt if provided in the event
      const jobId = event.jobId || event.id;
      if (jobId && event.positivePrompt) {
        this.jobPrompts.set(jobId, event.positivePrompt);
      }
    });

    // Also listen for any other events that might contain individual job prompts
    this.realProject.on('progress', (event: any) => {
      const jobId = event.jobId || event.id;
      if (jobId && event.positivePrompt) {
        this.jobPrompts.set(jobId, event.positivePrompt);
      }
    });

    this.realProject.on('jobCompleted', (event: any) => {
      const jobId = event.jobId || event.id;
      if (jobId && event.positivePrompt) {
        this.jobPrompts.set(jobId, event.positivePrompt);
      }
    });

    // Map jobStarted events to job events with 'started' type
    this.realProject.on('jobStarted', (job: any) => {
      
      // Capture individual job prompt from the job object itself
      if (job.id && job.positivePrompt) {
        this.jobPrompts.set(job.id, job.positivePrompt);
      } else if (job.id && job.params && job.params.positivePrompt) {
        this.jobPrompts.set(job.id, job.params.positivePrompt);
      }
      
      // Assign job index
      if (!this.jobIndexMap.has(job.id)) {
        this.jobIndexMap.set(job.id, this.nextJobIndex++);
      }
      
      const jobIndex = this.jobIndexMap.get(job.id);
      
      // CRITICAL: Emit jobStarted event that App.jsx listens for to map job IDs
      this.emit('jobStarted', job);
      
      // Set up individual job progress listener
      job.on('progress', (progress: number) => {
        // Calculate progress from step/stepCount if progress is not provided
        let normalizedProgress = progress;
        if (job.step !== undefined && job.stepCount !== undefined && job.stepCount > 0) {
          normalizedProgress = (job.step / job.stepCount) * 100;
        }
        
        // Emit the individual job progress event that the UI expects
        this.emit('job', {
          type: 'progress',
          jobId: job.id,
          projectId: this.realProject.id,
          progress: normalizedProgress / 100, // Convert percentage to 0-1 range
          workerName: job.workerName || 'Art Robot',
          step: job.step,
          stepCount: job.stepCount
        });
      });
      
      // Use the individual job prompt from global events (like backend proxy does)
      const individualJobPrompt = this.jobPrompts.get(job.id) || this.realProject.params?.positivePrompt || '';
      
      // Also emit the job started event that the UI expects for status updates
      this.emit('job', {
        type: 'started',
        jobId: job.id,
        projectId: this.realProject.id,
        workerName: job.workerName || 'Art Robot',
        jobIndex,
        positivePrompt: individualJobPrompt // Use the individual job prompt from global events
      });
    });

    // Handle project-level progress events and distribute to individual jobs
    // The real SDK emits project-level progress, but we need individual job progress for the UI
    this.realProject.on('progress', (progressData: any) => {
      // Find the currently active (processing) jobs
      const activeJobs = this.realProject.jobs?.filter((job: any) => 
        job.status === 'processing' || job.status === 'queued' || job.status === 'started'
      ) || [];
      
      if (activeJobs.length > 0) {
        // Distribute the project progress to active jobs
        const progress = typeof progressData === 'number' ? progressData : 
                        (progressData.progress || progressData.percentage || 0);
        
        activeJobs.forEach((job: any) => {
          this.emit('job', {
            type: 'progress',
            jobId: job.id,
            projectId: this.realProject.id,
            progress: progress / 100, // Convert percentage to 0-1 range
            workerName: job.workerName || 'Art Robot'
          });
        });
      }
    });

    // Map jobCompleted events with proper completion tracking
    this.realProject.on('jobCompleted', (job: any) => {
      
      // Try multiple sources for the individual job prompt
      let individualJobPrompt = '';
      
      // 1. Check our captured prompts map
      if (this.jobPrompts.has(job.id)) {
        individualJobPrompt = this.jobPrompts.get(job.id);
      }
      // 2. Check job object itself
      else if (job.positivePrompt) {
        individualJobPrompt = job.positivePrompt;
      }
      // 3. Check job params
      else if (job.params && job.params.positivePrompt) {
        individualJobPrompt = job.params.positivePrompt;
      }
      // 4. Fallback to project prompt
      else {
        individualJobPrompt = this.realProject.params?.positivePrompt || '';
      }
      
      // Emit the jobCompleted event that the UI expects
      this.emit('jobCompleted', {
        id: job.id,
        resultUrl: job.resultUrl,
        previewUrl: job.previewUrl,
        isPreview: job.isPreview || false,
        positivePrompt: individualJobPrompt, // Use the individual job prompt
        workerName: job.workerName || 'Art Robot'
      });

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

  // Set up timeouts to handle jobs that might get stuck (like backend does)
  private setupJobCompletionTimeouts() {
    // Monitor job progress and set up timeouts for jobs that reach high progress but don't complete
    this.realProject.on('progress', (event: any) => {
      if (event.jobId && event.progress >= 0.85) { // 85% progress threshold like backend
        // Set up a timeout to handle potentially stuck jobs
        if (!this.completionTracker.jobCompletionTimeouts.has(event.jobId)) {
          const timeoutId = setTimeout(() => {
            
            // Send fallback completion like backend does
            this.emit('jobCompleted', {
              id: event.jobId,
              resultUrl: null,
              previewUrl: null,
              isPreview: false,
              positivePrompt: this.jobPrompts.get(event.jobId) || this.realProject.params?.positivePrompt || '',
              workerName: event.workerName || 'Art Robot',
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
    });
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

  constructor(realClient: SogniClient) {
    this.realClient = realClient;
  }

  get projects() {
    return {
      create: async (params: any) => {
        // Create the real project
        const realProject = await this.realClient.projects.create(params);
        
        // Wrap it in our adapter
        const adaptedProject = new FrontendProjectAdapter(realProject);
        
        return adaptedProject;
      },
      on: (event: string, callback: (...args: any[]) => void) => {
        // Forward to the real client's projects if it has an 'on' method
        if (this.realClient.projects && typeof (this.realClient.projects as any).on === 'function') {
          (this.realClient.projects as any).on(event, callback);
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
}

/**
 * Create a frontend client adapter that makes the real Sogni Client
 * behave like the BackendSogniClient for UI compatibility
 */
export function createFrontendClientAdapter(realClient: SogniClient): FrontendSogniClientAdapter {
  return new FrontendSogniClientAdapter(realClient);
}
