// =====================================================
// Redis Helper for Tests
// =====================================================
// Manages isolated Redis instances for queue testing.
// Prevents test interference by using prefixed keys.

import Redis from 'ioredis';
import { Queue } from 'bullmq';
import { config } from '../../src/config';

let testRedis: Redis | null = null;
const testQueues = new Map<string, Queue>();

/**
 * Get or create Redis client for test environment.
 * Uses separate database index to avoid collision with dev/prod.
 */
export function getTestRedis(): Redis {
  if (!testRedis) {
    testRedis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: 15, // Use database 15 for tests (dev uses 0)
      maxRetriesPerRequest: null, // Required for BullMQ
      enableReadyCheck: false,
    });

    testRedis.on('error', (err) => {
      console.error('Test Redis error:', err);
    });
  }
  return testRedis;
}

/**
 * Create a BullMQ queue with test prefix for isolation.
 * Automatically tracks created queues for cleanup.
 *
 * @param name - Queue name (will be prefixed with 'test:')
 * @returns BullMQ Queue instance
 */
export function createTestQueue<T = unknown>(name: string): Queue<T> {
  const queueName = `test:${name}`;

  if (testQueues.has(queueName)) {
    return testQueues.get(queueName) as Queue<T>;
  }

  const redis = getTestRedis();
  const queue = new Queue<T>(queueName, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: true,
      removeOnFail: false,
      attempts: 1, // No retries in tests unless explicitly needed
    },
  });

  testQueues.set(queueName, queue);
  return queue;
}

/**
 * Clean all test queue keys from Redis.
 * Removes jobs, completed sets, failed sets, etc.
 */
export async function cleanTestQueues(): Promise<void> {
  const redis = getTestRedis();

  // Close all tracked queues
  for (const [name, queue] of testQueues.entries()) {
    await queue.obliterate({ force: true });
    await queue.close();
    testQueues.delete(name);
  }

  // Delete all keys with test: prefix
  const keys = await redis.keys('bull:test:*');
  if (keys.length > 0) {
    await redis.del(...keys);
  }
}

/**
 * Wait for a queue to become empty (all jobs processed).
 * Useful for ensuring async operations complete before assertions.
 *
 * @param queue - Queue to monitor
 * @param timeout - Max wait time in milliseconds (default: 5000ms)
 * @returns true if queue emptied, false if timeout
 */
export async function waitForQueueEmpty(
  queue: Queue,
  timeout: number = 5000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const [waiting, active, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getDelayedCount(),
    ]);

    if (waiting === 0 && active === 0 && delayed === 0) {
      return true;
    }

    // Wait 100ms before checking again
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  return false;
}

/**
 * Get all jobs in a queue (for debugging).
 * @param queue - Queue to inspect
 * @returns Array of all jobs across all states
 */
export async function getAllQueueJobs(queue: Queue): Promise<{
  waiting: any[];
  active: any[];
  completed: any[];
  failed: any[];
  delayed: any[];
}> {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaiting(),
    queue.getActive(),
    queue.getCompleted(),
    queue.getFailed(),
    queue.getDelayed(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

/**
 * Disconnect test Redis client.
 * Call this in afterAll() hooks to prevent connection leaks.
 */
export async function disconnectTestRedis(): Promise<void> {
  // Clean up queues first
  await cleanTestQueues();

  // Disconnect Redis
  if (testRedis) {
    await testRedis.quit();
    testRedis = null;
  }
}

/**
 * Check if Redis is reachable.
 * Useful for health checks in test setup.
 */
export async function isRedisReachable(): Promise<boolean> {
  try {
    const redis = getTestRedis();
    const result = await redis.ping();
    return result === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Flush all keys in test Redis database.
 * DANGEROUS: Use only in test teardown.
 */
export async function flushTestRedis(): Promise<void> {
  const redis = getTestRedis();
  await redis.flushdb();
}
