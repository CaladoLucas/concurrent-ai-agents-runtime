import { describe, expect, it } from 'vitest';
import { AsyncWorkerPool } from '../src/core/queue/worker-pool.js';

describe('Queue Engine - Async Worker Pool & Backpressure', () => {
  it('should strictly enforce maximum concurrency limits', async () => {
    const maxConcurrency = 3;
    const pool = new AsyncWorkerPool({ maxConcurrency });

    let activePeak = 0;
    const taskCount = 10;
    const executionPromises: Promise<number>[] = [];

    for (let i = 0; i < taskCount; i++) {
      executionPromises.push(
        pool.submit({
          execute: async () => {
            const currentActive = pool.getActiveWorkers();
            if (currentActive > activePeak) {
              activePeak = currentActive;
            }
            await new Promise((r) => setTimeout(r, 20));
            return i;
          },
        })
      );
    }

    const results = await Promise.all(executionPromises);
    expect(results.length).toBe(taskCount);
    expect(activePeak).toBeLessThanOrEqual(maxConcurrency);
    expect(activePeak).toBeGreaterThan(1); // Ensured concurrent overlap occurred
  });

  it('should process higher priority tasks before lower priority tasks', async () => {
    const pool = new AsyncWorkerPool({ maxConcurrency: 1 });
    const executedOrder: number[] = [];

    // Occupy the single worker
    const blocker = pool.submit({
      execute: async () => {
        await new Promise((r) => setTimeout(r, 30));
        executedOrder.push(0);
      },
      priority: 0,
    });

    // Queue lower priority task
    const lowPriority = pool.submit({
      execute: async () => {
        executedOrder.push(1);
      },
      priority: 10,
    });

    // Queue higher priority task
    const highPriority = pool.submit({
      execute: async () => {
        executedOrder.push(2);
      },
      priority: 100,
    });

    await Promise.all([blocker, lowPriority, highPriority]);

    expect(executedOrder[0]).toBe(0);
    expect(executedOrder[1]).toBe(2); // Higher priority executed first!
    expect(executedOrder[2]).toBe(1);
  });

  it('should emit backpressure events when queue size exceeds highWaterMark', async () => {
    const pool = new AsyncWorkerPool({ maxConcurrency: 1, highWaterMark: 3 });
    let backpressureTriggered = false;
    let backpressureRelieved = false;

    pool.on('backpressure:exceeded', () => {
      backpressureTriggered = true;
    });

    pool.on('backpressure:relieved', () => {
      backpressureRelieved = true;
    });

    // Submit blocker and 4 queued tasks
    const tasks = Array.from({ length: 5 }, (_, i) =>
      pool.submit({
        execute: async () => {
          await new Promise((r) => setTimeout(r, 15));
          return i;
        },
      })
    );

    await Promise.all(tasks);
    await pool.drain();

    expect(backpressureTriggered).toBe(true);
    expect(backpressureRelieved).toBe(true);
  });

  it('should cleanly drain all tasks', async () => {
    const pool = new AsyncWorkerPool({ maxConcurrency: 2 });
    let completed = 0;

    for (let i = 0; i < 6; i++) {
      pool.submit({
        execute: async () => {
          await new Promise((r) => setTimeout(r, 10));
          completed++;
        },
      });
    }

    await pool.drain();
    expect(completed).toBe(6);
    expect(pool.getActiveWorkers()).toBe(0);
    expect(pool.getQueueLength()).toBe(0);
  });
});
