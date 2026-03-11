/**
 * Fetch wrapper with timeout support for React Native (Hermes).
 * AbortSignal.timeout() is not available in Hermes, so we use AbortController.
 *
 * - Actually aborts the underlying network request via AbortController.
 * - Respects an optional caller-provided signal (both signals can abort).
 * - Throws a descriptive error on timeout rather than a bare AbortError.
 */
export function fetchWithTimeout(
  url: string,
  options?: RequestInit & { timeout?: number },
): Promise<Response> {
  const { timeout = 10000, signal: callerSignal, ...fetchOptions } = options || {};
  const controller = new AbortController();
  let didTimeout = false;

  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeout);

  // If the caller supplied their own signal, forward its abort to our controller
  if (callerSignal) {
    if (callerSignal.aborted) {
      clearTimeout(timer);
      controller.abort();
    } else {
      callerSignal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  return fetch(url, { ...fetchOptions, signal: controller.signal })
    .catch((err: Error) => {
      if (didTimeout) {
        throw new Error(`Request timed out after ${timeout}ms: ${url}`);
      }
      throw err;
    })
    .finally(() => clearTimeout(timer));
}
