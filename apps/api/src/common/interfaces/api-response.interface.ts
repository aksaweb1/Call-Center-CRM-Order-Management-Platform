/**
 * Consistent API response envelope used across every endpoint.
 */
export interface ApiResponseImpl<T> {
  success: boolean;
  data: T | null;
  message: string;
  meta?: PaginationMeta;
  timestamp: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function ok<T>(
  data: T,
  message = 'OK',
  meta?: PaginationMeta,
): ApiResponseImpl<T> {
  return {
    success: true,
    data,
    message,
    meta,
    timestamp: new Date().toISOString(),
  };
}

export function fail<T = null>(
  message: string,
  data: T = null as T,
): ApiResponseImpl<T> {
  return {
    success: false,
    data,
    message,
    timestamp: new Date().toISOString(),
  };
}