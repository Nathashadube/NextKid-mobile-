/**
 * NextKid Mobile — API Client
 *
 * Single entry point: the microservices ALB.
 * ALB DNS: nextkid-production-alb-1485337033.af-south-1.elb.amazonaws.com
 *
 * ALB path-based routing rules (from terraform/ecs-services.tf):
 * ┌────────────────────────────┬──────────────────────────┬──────────┐
 * │ Path pattern               │ ECS Service              │ Priority │
 * ├────────────────────────────┼──────────────────────────┼──────────┤
 * │ /api/locations/*           │ location-service         │ 10       │
 * │ /api/profile*, /api/       │                          │          │
 * │   children*, /api/account* │ user-service             │ 20       │
 * │ /api/listings/*,           │                          │          │
 * │   /api/categories*         │ listing-service          │ 30       │
 * │ /api/schools/*             │ school-service           │ 40       │
 * │ /api/orders/*              │ order-service            │ 50       │
 * │ /*                         │ frontend-service         │ 100      │
 * └────────────────────────────┴──────────────────────────┴──────────┘
 *
 * Set EXPO_PUBLIC_API_BASE_URL in .env:
 *   dev:  http://nextkid-production-alb-1485337033.af-south-1.elb.amazonaws.com
 *   prod: https://api.nextkid.co.za
 */

import { getAccessToken, getSession, signOut } from './auth/cognito';

const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  'http://nextkid-production-alb-1485337033.af-south-1.elb.amazonaws.com';

// ============================================================================
// Core Request Infrastructure
// ============================================================================

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public errorCode?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  requiresAuth?: boolean;
  timeout?: number;
}

export async function apiRequest<T = unknown>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const {
    method = 'GET',
    body,
    headers = {},
    requiresAuth = true,
    timeout = 30000,
  } = options;

  const url = `${API_BASE_URL}${endpoint}`;

  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Type': 'mobile',
    'X-Client-Platform': 'expo',
    ...headers,
  };

  if (requiresAuth) {
    const accessToken = await getAccessToken();
    if (!accessToken) {
      throw new ApiError('Not authenticated', 401, 'AUTH_REQUIRED');
    }
    requestHeaders['Authorization'] = `Bearer ${accessToken}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Auto-retry once after token refresh on 401
    if (response.status === 401) {
      const session = await getSession();
      if (session) {
        const retryToken = await getAccessToken();
        if (retryToken) {
          requestHeaders['Authorization'] = `Bearer ${retryToken}`;
          const retryResponse = await fetch(url, {
            method,
            headers: requestHeaders,
            body: body ? JSON.stringify(body) : undefined,
          });
          if (retryResponse.ok) return retryResponse.json() as Promise<T>;
        }
      }
      await signOut();
      throw new ApiError('Session expired', 401, 'SESSION_EXPIRED');
    }

    if (!response.ok) {
      let errorData: { message?: string; code?: string; errorCode?: string } = {};
      try {
        errorData = await response.json();
      } catch {
        errorData = { message: response.statusText };
      }
      throw new ApiError(
        errorData.message ?? `Request failed: ${response.status}`,
        response.status,
        errorData.code ?? errorData.errorCode
      );
    }

    if (response.status === 204) return undefined as T;

    return response.json() as Promise<T>;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof ApiError) throw error;
    if (error instanceof Error) {
      if (error.name === 'AbortError') throw new ApiError('Request timeout', 408, 'TIMEOUT');
      throw new ApiError(error.message, 0, 'NETWORK_ERROR');
    }
    throw new ApiError('Unknown error', 0, 'UNKNOWN_ERROR');
  }
}

// ============================================================================
// Convenience Helpers
// ============================================================================

export const get = <T = unknown>(
  endpoint: string,
  options?: Omit<RequestOptions, 'method' | 'body'>
) => apiRequest<T>(endpoint, { ...options, method: 'GET' });

export const post = <T = unknown>(
  endpoint: string,
  body?: unknown,
  options?: Omit<RequestOptions, 'method' | 'body'>
) => apiRequest<T>(endpoint, { ...options, method: 'POST', body });

export const put = <T = unknown>(
  endpoint: string,
  body?: unknown,
  options?: Omit<RequestOptions, 'method' | 'body'>
) => apiRequest<T>(endpoint, { ...options, method: 'PUT', body });

export const patch = <T = unknown>(
  endpoint: string,
  body?: unknown,
  options?: Omit<RequestOptions, 'method' | 'body'>
) => apiRequest<T>(endpoint, { ...options, method: 'PATCH', body });

export const del = <T = unknown>(
  endpoint: string,
  options?: Omit<RequestOptions, 'method' | 'body'>
) => apiRequest<T>(endpoint, { ...options, method: 'DELETE' });

// Also export getAccessToken so order/[id].tsx can use it for raw fetch calls
export { getAccessToken } from './auth/cognito';

// ============================================================================
// Domain API Methods — mapped to ALB routing rules
// ============================================================================

// ----------------------------------------------------------------------------
// USER SERVICE  →  /api/profile*, /api/children*, /api/account*  (priority 20)
// ----------------------------------------------------------------------------

/** Profile */
export const profileApi = {
  get:    ()                           => get<Record<string, unknown>>('/api/profile'),
  update: (data: Record<string, unknown>) => put('/api/profile', data),
};

/** Children (requires child_profiles table migration) */
export const childrenApi = {
  list:       ()                         => get<unknown[]>('/api/children'),
  get:        (id: string)               => get<Record<string, unknown>>(`/api/children/${id}`),
  create:     (data: unknown)            => post<Record<string, unknown>>('/api/children', data),
  update:     (id: string, data: unknown) => put<Record<string, unknown>>(`/api/children/${id}`, data),
  addSize:    (id: string, data: unknown) => post<Record<string, unknown>>(`/api/children/${id}/sizes`, data),
  prediction: (id: string)               => get<Record<string, unknown>>(`/api/children/${id}/prediction`),
  cached:     ()                         => get<unknown[]>('/api/children/cached'),
};

/** Account */
export const accountApi = {
  delete: () => del('/api/account/delete'),
};

// ----------------------------------------------------------------------------
// LISTING SERVICE  →  /api/listings/*, /api/categories*  (priority 30)
// ----------------------------------------------------------------------------

/** Listings */
export const listingsApi = {
  list:   (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return get<unknown[]>(`/api/listings${query}`);
  },
  get:    (id: string)               => get<Record<string, unknown>>(`/api/listings/${id}`),
  create: (data: unknown)            => post<Record<string, unknown>>('/api/listings/create', data),
  update: (id: string, data: unknown) => put<Record<string, unknown>>(`/api/listings/${id}`, data),
  delete: (id: string)               => del(`/api/listings/${id}`),
};

/** Upload (presigned S3 URL — hits frontend-service) */
export const uploadApi = {
  presign: (data: unknown) => post<{ uploadUrl: string; publicUrl: string }>('/api/upload', data),
};

// ----------------------------------------------------------------------------
// LOCATION SERVICE  →  /api/locations/*  (priority 10)
// ----------------------------------------------------------------------------

/** Locations */
export const locationsApi = {
  schoolsSearch: (query: string, params?: Record<string, string>) =>
    get<unknown[]>(`/api/locations/schools/search?${new URLSearchParams({ q: query, ...params })}`),
  schools:   (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return get<unknown[]>(`/api/locations/schools${query}`);
  },
  cities:    (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return get<unknown[]>(`/api/locations/cities${query}`);
  },
  suburbs:   (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return get<unknown[]>(`/api/locations/suburbs${query}`);
  },
  placesAutocomplete: (query: string) =>
    get<unknown[]>(`/api/locations/places/autocomplete?${new URLSearchParams({ q: query })}`),
  placesDetails: (placeId: string) =>
    get<Record<string, unknown>>(`/api/locations/places/details?${new URLSearchParams({ placeId })}`),
  placesReverse: (lat: number, lng: number) =>
    get<Record<string, unknown>>(`/api/locations/places/reverse?${new URLSearchParams({ lat: String(lat), lng: String(lng) })}`),
};

// ----------------------------------------------------------------------------
// SCHOOL SERVICE  →  /api/schools/*  (priority 40)
// ----------------------------------------------------------------------------

/** Schools */
export const schoolsApi = {
  list: (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return get<unknown[]>(`/api/schools${query}`);
  },
  get:         (id: string)               => get<Record<string, unknown>>(`/api/schools/${id}`),
  approve:     (id: string, data: unknown) => post(`/api/schools/${id}/approve`, data),
  inviteAdmin: (id: string, data: unknown) => post(`/api/schools/${id}/admins/invite`, data),
};

// ----------------------------------------------------------------------------
// ORDER SERVICE  →  /api/orders/*  (priority 50)
// ----------------------------------------------------------------------------

/** Orders */
export const ordersApi = {
  list:          ()               => get<unknown[]>('/api/orders'),
  get:           (id: string)     => get<Record<string, unknown>>(`/api/orders/${id}`),
  create:        (data: unknown)  => post<Record<string, unknown>>('/api/orders', data),
  cancel:        (id: string)     => post(`/api/orders/${id}/cancel`),
  pay:           (id: string)     => post<{ redirectUrl: string }>(`/api/orders/${id}/pay`),
  confirmReceipt: (id: string)    => post(`/api/orders/${id}/confirm-receipt`),
  qrDropoff:     (id: string)     => get<Record<string, unknown>>(`/api/orders/${id}/qr/dropoff`),
  qrCollection:  (id: string)     => get<Record<string, unknown>>(`/api/orders/${id}/qr/collection`),
};

// ----------------------------------------------------------------------------
// FRONTEND SERVICE  →  /*  catch-all  (priority 100)
// All remaining routes are handled by the Next.js frontend-service.
// ----------------------------------------------------------------------------

/** Feed (uses child_profiles + size_predictions — needs DB migration) */
export const feedApi = {
  get:    (params?: Record<string, string>) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
    return get<unknown[]>(`/api/feed${query}`);
  },
  cached: () => get<unknown[]>('/api/feed/cached'),
};

/** Wishlist */
export const wishlistApi = {
  list:   ()              => get<unknown[]>('/api/wishlist'),
  add:    (listingId: string) => post(`/api/wishlist/${listingId}`),
  remove: (listingId: string) => del(`/api/wishlist/${listingId}`),
  cached: ()              => get<unknown[]>('/api/wishlist/cached'),
};

/** Notifications */
export const notificationsApi = {
  list:       ()                => get<unknown[]>('/api/notifications'),
  markAsRead: (ids?: string[])  => put('/api/notifications', { ids }),
};

/** Lockers */
export const lockersApi = {
  nearby: (params: Record<string, string>) =>
    get<{ lockers: unknown[] }>(`/api/lockers/nearby?${new URLSearchParams(params)}`),
  search: (query: string) =>
    get<unknown[]>(`/api/lockers/search?${new URLSearchParams({ q: query })}`),
};

/** Checkout */
export const checkoutApi = {
  schoolMatch:   (listingId: string) =>
    get<Record<string, unknown>>(`/api/checkout/school-match?${new URLSearchParams({ listingId })}`),
  shippingRates: (data: unknown) =>
    post<Record<string, unknown>>('/api/shipping/rates', data),
};

/** Seller */
export const sellerApi = {
  bankDetails: {
    get:  ()           => get<Record<string, unknown>>('/api/seller/bank-details'),
    save: (data: unknown) => post('/api/seller/bank-details', data),
  },
  stats: (id: string)  => get<Record<string, unknown>>(`/api/seller/${id}/stats`),
};

/** Admin */
export const adminApi = {
  scan: (data: unknown) => post('/api/qr/scan', data),
  payouts: {
    list:   ()                          => get<unknown[]>('/api/admin/payouts'),
    update: (id: string, data: unknown) => put(`/api/admin/payouts/${id}`, data),
    pay:    (id: string)                => post(`/api/admin/payouts/${id}/pay`),
  },
};

/** Klerebank */
export const klerebankApi = {
  dashboard: ()  => get<Record<string, unknown>>('/api/klerebank/dashboard'),
  referrals: ()  => get<Record<string, unknown>>('/api/klerebank/referrals'),
  ledger:    ()  => get<unknown[]>('/api/klerebank/ledger'),
};

/** Offers */
export const offersApi = {
  list:   ()               => get<unknown[]>('/api/offers'),
  get:    (id: string)     => get<Record<string, unknown>>(`/api/offers/${id}`),
  create: (data: unknown)  => post<Record<string, unknown>>('/api/offers', data),
  update: (id: string, data: unknown) => put(`/api/offers/${id}`, data),
};

/** Reservations */
export const reservationsApi = {
  list:   ()              => get<unknown[]>('/api/reservations'),
  create: (data: unknown) => post<Record<string, unknown>>('/api/reservations', data),
};

// ============================================================================
// Health Check
// ============================================================================

/**
 * Ping the ALB to confirm connectivity before starting the app.
 * Returns true if the backend is reachable.
 */
export async function checkBackendHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// Utilities
// ============================================================================

export function isAuthError(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    (error.statusCode === 401 ||
      error.errorCode === 'AUTH_REQUIRED' ||
      error.errorCode === 'SESSION_EXPIRED')
  );
}

export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiError && error.errorCode === 'NETWORK_ERROR';
}

export function isTimeoutError(error: unknown): boolean {
  return error instanceof ApiError && error.errorCode === 'TIMEOUT';
}
