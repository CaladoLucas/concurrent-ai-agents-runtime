import { EventEmitter } from 'node:events';
import { TaskId, WorkerPoolOptions, WorkerTask } from '../../types/index.js';

export interface WorkerPoolStats {
  concurrencyLimit: number;
  activeCount: number;
  queuedCount: number;
  completedCount: number;
  failedCount: number;
  isPaused: boolean;
  hasBackpressure: boolean;
}

/**
 * High-performance Asynchronous Worker Pool with strict concurrency bounds,
 * priority task scheduling, and backpressure regulation.
 */
export class AsyncWorkerPool extends EventEmitter {
  private readonly maxConcurrency: number;
  private readonly highWaterMark: number;
  private readonly queue: WorkerTask<any>[] = [];
  private activeWorkers = 0;
  private completedCount = 0;
  private failedCount = 0;
  private isPaused = false;
  private hasBackpressure = false;
  private isShuttingDown = false;

  constructor(options: WorkerPoolOptions) {
    super();
    this.maxConcurrency = Math.max(1, options.maxConcurrency);
    this.highWaterMark = options.highWaterMark ?? this.maxConcurrency * 10;
  }

  /**
   * Submits a task to the pool.
   * Resolves with the task result or rejects on failure.
   */
  public submit<T>(task: Omit<WorkerTask<T>, 'id'> & { id?: TaskId }): Promise<T> {
    if (this.isShuttingDown) {
      return Promise.reject(new Error('Cannot submit task: Worker pool is shutting down.'));
    }

    return new Promise<T>((resolve, reject) => {
      const internalTask: WorkerTask<T> = {
        id: task.id ?? `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        priority: task.priority ?? 0,
        execute: task.execute,
        onSuccess: (res) => {
          task.onSuccess?.(res);
          resolve(res);
        },
        onError: (err) => {
          task.onError?.(err);
          reject(err);
        },
      };

      // Priority queue insertion: higher priority numbers first
      const insertIndex = this.queue.findIndex((t) => (t.priority ?? 0) < (internalTask.priority ?? 0));
      if (insertIndex === -1) {
        this.queue.push(internalTask);
      } else {
        this.queue.splice(insertIndex, 0, internalTask);
      }

      this.emit('task:queued', { taskId: internalTask.id, queueSize: this.queue.length });

      // Backpressure check
      if (this.queue.length >= this.highWaterMark && !this.hasBackpressure) {
        this.hasBackpressure = true;
        this.emit('backpressure:exceeded', {
          queueSize: this.queue.length,
          highWaterMark: this.highWaterMark,
        });
      }

      this.dispatch();
    });
  }

  /**
   * Dispatches pending tasks up to maxConcurrency.
   */
  private dispatch(): void {
    if (this.isPaused || this.isShuttingDown) {
      return;
    }

    while (this.activeWorkers < this.maxConcurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) break;

      this.activeWorkers++;
      this.emit('task:started', { taskId: task.id, activeWorkers: this.activeWorkers });

      // Relieve backpressure if queue fell below 75% of high water mark
      if (this.hasBackpressure && this.queue.length <= Math.floor(this.highWaterMark * 0.75)) {
        this.hasBackpressure = false;
        this.emit('backpressure:relieved', { queueSize: this.queue.length });
      }

      this.executeTask(task);
    }
  }

  private async executeTask<T>(task: WorkerTask<T>): Promise<void> {
    try {
      const result = await task.execute();
      this.completedCount++;
      this.emit('task:completed', { taskId: task.id, activeWorkers: this.activeWorkers - 1 });
      task.onSuccess?.(result);
    } catch (error) {
      this.failedCount++;
      const err = error instanceof Error ? error : new Error(String(error));
      this.emit('task:failed', { taskId: task.id, error: err });
      task.onError?.(err);
    } finally {
      this.activeWorkers--;
      if (this.queue.length === 0 && this.activeWorkers === 0) {
        this.emit('drain');
      }
      this.dispatch();
    }
  }

  /**
   * Pauses the dispatching of new tasks from the queue.
   * In-flight tasks will continue executing.
   */
  public pause(): void {
    this.isPaused = true;
    this.emit('paused');
  }

  /**
   * Resumes dispatching queued tasks.
   */
  public resume(): void {
    if (this.isPaused) {
      this.isPaused = false;
      this.emit('resumed');
      this.dispatch();
    }
  }

  /**
   * Gracefully waits until all active and queued tasks complete.
   */
  public async drain(timeoutMs?: number): Promise<void> {
    if (this.queue.length === 0 && this.activeWorkers === 0) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout | undefined;

      const onDrain = () => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        this.removeListener('drain', onDrain);
        resolve();
      };

      if (timeoutMs) {
        timeoutHandle = setTimeout(() => {
          this.removeListener('drain', onDrain);
          reject(new Error(`Drain operation timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }

      this.on('drain', onDrain);
    });
  }

  /**
   * Initiates shutdown of the pool.
   */
  public async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    await this.drain();
  }

  public getStats(): WorkerPoolStats {
    return {
      concurrencyLimit: this.maxConcurrency,
      activeCount: this.activeWorkers,
      queuedCount: this.queue.length,
      completedCount: this.completedCount,
      failedCount: this.failedCount,
      isPaused: this.isPaused,
      hasBackpressure: this.hasBackpressure,
    };
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public getActiveWorkers(): number {
    return this.activeWorkers;
  }
}
