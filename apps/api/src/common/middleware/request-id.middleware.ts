import { randomUUID } from 'crypto';
import { Request, Response } from 'express';

/**
 * Assigns / propagates `X-Request-Id` for end-to-end request tracing.
 */
export function requestId(
  req: Request,
  res: Response,
  next: () => void,
): void {
  const incoming = (req.headers['x-request-id'] as string) || randomUUID();
  req.headers['x-request-id'] = incoming;
  (req as unknown as { requestId: string }).requestId = incoming;
  res.setHeader('X-Request-Id', incoming);
  next();
}