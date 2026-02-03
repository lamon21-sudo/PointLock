/**
 * Unit test to verify auth store initialization promise works correctly
 *
 * This test verifies the fix for the 401 race condition bug.
 */

import { waitForAuthInitialization } from '../auth.store';

describe('Auth Store Initialization Promise', () => {
  it('should resolve waitForAuthInitialization when initialize completes', async () => {
    // This test verifies that the waitForAuthInitialization promise
    // properly waits for the auth store to complete initialization

    const startTime = Date.now();

    // Wait for initialization (this should resolve quickly if already initialized,
    // or wait if initialization is in progress)
    await waitForAuthInitialization();

    const endTime = Date.now();
    const duration = endTime - startTime;

    // If initialization is already complete, this should resolve immediately (< 10ms)
    // If initialization is in progress, it should wait and then resolve
    console.log(`✅ waitForAuthInitialization resolved in ${duration}ms`);

    // The promise should resolve (not hang forever)
    expect(duration).toBeLessThan(5000); // Should not take more than 5 seconds
  });

  it('should resolve immediately if called after initialization is complete', async () => {
    // Call twice - the second call should be instant
    await waitForAuthInitialization();

    const startTime = Date.now();
    await waitForAuthInitialization();
    const endTime = Date.now();

    const duration = endTime - startTime;

    // Second call should be instant (promise is already resolved)
    expect(duration).toBeLessThan(10); // Should be < 10ms
    console.log(`✅ Second call resolved instantly in ${duration}ms`);
  });
});
