// =====================================================
// Cache Service Test Suite
// =====================================================
// Tests for Redis caching layer with mocked Redis client.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  get,
  set,
  del,
  delPattern,
  getOrFetch,
  getCacheMetrics,
  resetCacheMetrics,
} from './cache.service';

// ===========================================
// Mock Redis Connection
// ===========================================

const mockRedis = {
  get: vi.fn(),
  setex: vi.fn(),
  del: vi.fn(),
  scan: vi.fn(),
};

vi.mock('../queues/connection', () => ({
  getRedisConnection: () => mockRedis,
}));

// ===========================================
// Test Setup
// ===========================================

beforeEach(() => {
  vi.clearAllMocks();
  resetCacheMetrics();
});

afterEach(() => {
  vi.resetAllMocks();
});

// ===========================================
// Test: get()
// ===========================================

describe('get', () => {
  it('returns cached value on cache hit', async () => {
    const testData = { tier: 'ELITE', coinsEarned: 15000 };
    mockRedis.get.mockResolvedValue(JSON.stringify(testData));

    const result = await get<typeof testData>('tier:user:123');

    expect(result).toEqual(testData);
    expect(mockRedis.get).toHaveBeenCalledWith('tier:user:123');
    expect(getCacheMetrics().hits).toBe(1);
    expect(getCacheMetrics().misses).toBe(0);
  });

  it('returns null on cache miss', async () => {
    mockRedis.get.mockResolvedValue(null);

    const result = await get<unknown>('tier:user:missing');

    expect(result).toBeNull();
    expect(getCacheMetrics().misses).toBe(1);
    expect(getCacheMetrics().hits).toBe(0);
  });

  it('returns null and increments errors on Redis failure', async () => {
    mockRedis.get.mockRejectedValue(new Error('Connection refused'));

    const result = await get<unknown>('tier:user:error');

    expect(result).toBeNull();
    expect(getCacheMetrics().errors).toBe(1);
  });

  it('handles BigInt deserialization', async () => {
    const testData = { amount: { __type: 'BigInt', value: '9007199254740993' } };
    mockRedis.get.mockResolvedValue(JSON.stringify(testData));

    const result = await get<{ amount: bigint }>('test:bigint');

    expect(result?.amount).toBe(BigInt('9007199254740993'));
  });
});

// ===========================================
// Test: set()
// ===========================================

describe('set', () => {
  it('sets value with TTL', async () => {
    const testData = { tier: 'PREMIUM' };
    mockRedis.setex.mockResolvedValue('OK');

    await set('tier:user:123', testData, 300);

    expect(mockRedis.setex).toHaveBeenCalledWith(
      'tier:user:123',
      300,
      JSON.stringify(testData)
    );
  });

  it('handles BigInt serialization', async () => {
    const testData = { amount: BigInt('9007199254740993') };
    mockRedis.setex.mockResolvedValue('OK');

    await set('test:bigint', testData, 60);

    const calledWith = mockRedis.setex.mock.calls[0][2];
    const parsed = JSON.parse(calledWith);
    expect(parsed.amount).toEqual({ __type: 'BigInt', value: '9007199254740993' });
  });

  it('fails silently on Redis error', async () => {
    mockRedis.setex.mockRejectedValue(new Error('Connection refused'));

    // Should not throw
    await expect(set('tier:user:123', { test: true }, 300)).resolves.toBeUndefined();
    expect(getCacheMetrics().errors).toBe(1);
  });
});

// ===========================================
// Test: del()
// ===========================================

describe('del', () => {
  it('deletes key', async () => {
    mockRedis.del.mockResolvedValue(1);

    await del('tier:user:123');

    expect(mockRedis.del).toHaveBeenCalledWith('tier:user:123');
  });

  it('fails silently on Redis error', async () => {
    mockRedis.del.mockRejectedValue(new Error('Connection refused'));

    // Should not throw
    await expect(del('tier:user:123')).resolves.toBeUndefined();
  });
});

// ===========================================
// Test: delPattern()
// ===========================================

describe('delPattern', () => {
  it('deletes keys matching pattern using SCAN', async () => {
    // First scan returns some keys
    mockRedis.scan
      .mockResolvedValueOnce(['5', ['tier:player:NBA:1', 'tier:player:NBA:2']])
      .mockResolvedValueOnce(['0', ['tier:player:NBA:3']]);
    mockRedis.del.mockResolvedValue(2);

    await delPattern('tier:player:*');

    expect(mockRedis.scan).toHaveBeenCalledTimes(2);
    expect(mockRedis.del).toHaveBeenCalledWith('tier:player:NBA:1', 'tier:player:NBA:2');
    expect(mockRedis.del).toHaveBeenCalledWith('tier:player:NBA:3');
  });

  it('handles empty result set', async () => {
    mockRedis.scan.mockResolvedValue(['0', []]);

    await delPattern('nonexistent:*');

    expect(mockRedis.del).not.toHaveBeenCalled();
  });
});

// ===========================================
// Test: getOrFetch()
// ===========================================

describe('getOrFetch', () => {
  it('returns cached value without calling fetcher on hit', async () => {
    const cached = { tier: 'ELITE' };
    mockRedis.get.mockResolvedValue(JSON.stringify(cached));
    const fetcher = vi.fn().mockResolvedValue({ tier: 'FREE' });

    const result = await getOrFetch('tier:user:123', fetcher, 300);

    expect(result).toEqual(cached);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('calls fetcher and caches result on miss', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockResolvedValue('OK');
    const fetchedData = { tier: 'STANDARD', coinsEarned: 3000 };
    const fetcher = vi.fn().mockResolvedValue(fetchedData);

    const result = await getOrFetch('tier:user:456', fetcher, 300);

    expect(result).toEqual(fetchedData);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(mockRedis.setex).toHaveBeenCalledWith(
      'tier:user:456',
      300,
      JSON.stringify(fetchedData)
    );
  });

  it('calls fetcher on Redis error (graceful degradation)', async () => {
    mockRedis.get.mockRejectedValue(new Error('Connection refused'));
    const fetchedData = { tier: 'FREE' };
    const fetcher = vi.fn().mockResolvedValue(fetchedData);

    const result = await getOrFetch('tier:user:789', fetcher, 300);

    expect(result).toEqual(fetchedData);
    expect(fetcher).toHaveBeenCalled();
  });

  it('returns fetched data even if set fails', async () => {
    mockRedis.get.mockResolvedValue(null);
    mockRedis.setex.mockRejectedValue(new Error('Write error'));
    const fetchedData = { tier: 'PREMIUM' };
    const fetcher = vi.fn().mockResolvedValue(fetchedData);

    const result = await getOrFetch('tier:user:abc', fetcher, 300);

    expect(result).toEqual(fetchedData);
  });
});

// ===========================================
// Test: getCacheMetrics()
// ===========================================

describe('getCacheMetrics', () => {
  it('tracks hits, misses, and errors', async () => {
    mockRedis.get
      .mockResolvedValueOnce(JSON.stringify({ data: 1 })) // hit
      .mockResolvedValueOnce(null) // miss
      .mockRejectedValueOnce(new Error('fail')); // error

    await get('key1');
    await get('key2');
    await get('key3');

    const metrics = getCacheMetrics();
    expect(metrics.hits).toBe(1);
    expect(metrics.misses).toBe(1);
    expect(metrics.errors).toBe(1);
  });

  it('resetCacheMetrics resets all counters', async () => {
    mockRedis.get.mockResolvedValue(JSON.stringify({ data: 1 }));
    await get('key1');
    expect(getCacheMetrics().hits).toBe(1);

    resetCacheMetrics();

    expect(getCacheMetrics().hits).toBe(0);
    expect(getCacheMetrics().misses).toBe(0);
    expect(getCacheMetrics().errors).toBe(0);
  });
});
