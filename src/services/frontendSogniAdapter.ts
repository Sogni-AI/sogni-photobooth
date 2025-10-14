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

  constructor(realProject: any) {
    super();
    this.realProject = realProject;
    this.setupEventMapping();
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

    // Map jobStarted events to job events with 'started' type
    this.realProject.on('jobStarted', (job: any) => {
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
      
      // Also emit the job started event that the UI expects for status updates
      this.emit('job', {
        type: 'started',
        jobId: job.id,
        projectId: this.realProject.id,
        workerName: job.workerName || 'Art Robot',
        jobIndex,
        positivePrompt: job.positivePrompt || ''
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

    // Map jobCompleted events
    this.realProject.on('jobCompleted', (job: any) => {
      // Emit the jobCompleted event that the UI expects
      this.emit('jobCompleted', {
        id: job.id,
        resultUrl: job.resultUrl,
        previewUrl: job.previewUrl,
        isPreview: job.isPreview || false,
        positivePrompt: job.positivePrompt || '',
        workerName: job.workerName || 'Art Robot'
      });
    });

    // Map project completion
    this.realProject.on('completed', () => {
      if (!this.isCompleted) {
        this.isCompleted = true;
        
        // Emit uploadComplete to hide upload progress
        this.emit('uploadComplete');
        
        // Process any jobs that might not have been handled yet
        if (this.realProject.jobs) {
          this.realProject.jobs.forEach((job: any) => {
            if (job.resultUrl && !job.processed) {
              job.processed = true;
              this.emit('jobCompleted', {
                id: job.id,
                resultUrl: job.resultUrl,
                previewUrl: job.previewUrl,
                isPreview: job.isPreview || false,
                positivePrompt: job.positivePrompt || '',
                workerName: job.workerName || 'Art Robot'
              });
            }
          });
        }
        
        // Emit project completion
        this.emit('completed');
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
