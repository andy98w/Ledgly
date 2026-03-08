const API_URL = '/api/v1';

class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Clear any leftover legacy tokens from localStorage */
export function clearLegacyTokens() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem('auth_token');
  localStorage.removeItem('refresh_token');
}

// Deduplication: only one refresh in-flight at a time
let refreshPromise: Promise<void> | null = null;

async function attemptTokenRefresh(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    // Cookie-based refresh: the httpOnly cookie is sent automatically
    const response = await fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new ApiError(response.status, 'Token refresh failed');
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

const MAX_RATE_LIMIT_RETRIES = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  _isRetry = false,
  _rateLimitAttempt = 0,
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Send httpOnly cookies
  });

  // 429 rate-limit: exponential backoff (1s, 2s, 4s), max 3 retries
  if (response.status === 429 && _rateLimitAttempt < MAX_RATE_LIMIT_RETRIES) {
    const retryAfter = response.headers.get('Retry-After');
    const delayMs = retryAfter
      ? parseInt(retryAfter, 10) * 1000
      : 1000 * Math.pow(2, _rateLimitAttempt); // 1s, 2s, 4s
    await sleep(delayMs);
    return request<T>(endpoint, options, _isRetry, _rateLimitAttempt + 1);
  }

  // 401 interceptor: attempt refresh once, then retry
  if (response.status === 401 && !_isRetry && !endpoint.startsWith('/auth/refresh')) {
    try {
      await attemptTokenRefresh();
      return request<T>(endpoint, options, true);
    } catch {
      // Refresh failed — force logout
      clearLegacyTokens();
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      throw new ApiError(401, 'Session expired');
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'An error occurred' }));
    throw new ApiError(response.status, error.message);
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),

  post: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    }),

  patch: <T>(endpoint: string, data?: unknown) =>
    request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
    }),

  delete: <T>(endpoint: string) =>
    request<T>(endpoint, {
      method: 'DELETE',
    }),
};

export { ApiError };
