/**
 * Fetch wrapper with timeout support for React Native (Hermes).
 * AbortSignal.timeout() is not available in Hermes, so we use AbortController.
 */
export function fetchWithTimeout(
  url: string,
  options?: RequestInit & { timeout?: number },
): Promise<Response> {
  const { timeout = 10000, ...fetchOptions } = options || {};
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  return fetch(url, { ...fetchOptions, signal: controller.signal }).finally(() => clearTimeout(id));
}
