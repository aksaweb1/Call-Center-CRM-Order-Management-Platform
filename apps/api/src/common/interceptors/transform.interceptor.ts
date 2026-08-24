import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ok } from '../interfaces/api-response.interface';

/**
 * Normalizes Prisma.Decimal (and any object shaped like it) into numbers.
 * Prisma Decimal exposes itself as { s, e, d, ... }; JSON.stringify emits that
 * internal shape, which breaks monetary fields on the wire.
 */
function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  // Prisma Decimal detection: object with an `_d` or `d` coefficient vector.
  if (
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ((value as any).toNumber && typeof (value as any).toNumber === 'function')
  ) {
    const n = (value as any).toNumber();
    return Number.isFinite(n) && n % 1 !== 0 ? parseFloat(n.toFixed(2)) : n;
  }

  if (Array.isArray(value)) {
    return value.map((v) => normalizeValue(v));
  }

  if (value instanceof Date) return value;

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = normalizeValue(v);
    }
    return out;
  }
  return value;
}

/**
 * Wraps every success response in the standard envelope.
 * Already-enveloped responses (blobs, streams) can opt out by returning
 * an object with a `__raw` marker from the controller.
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, unknown>
{
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        if (data && typeof data === 'object' && (data as any).__raw) {
          return (data as any).__raw;
        }
        const normalized = normalizeValue(data);
        return ok(normalized as T);
      }),
    );
  }
}