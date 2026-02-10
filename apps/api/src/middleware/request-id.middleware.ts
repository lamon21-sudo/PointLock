// =====================================================
// Request ID Middleware
// =====================================================
// Generates or propagates a unique request ID for each request.
// Uses x-request-id header if provided, otherwise generates a UUID.

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';
import * as Sentry from '@sentry/node';

declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();
  req.id = requestId;
  res.setHeader('x-request-id', requestId);

  // Set Sentry scope early so captured errors include request context
  Sentry.getCurrentScope().setContext('request', {
    requestId,
    method: req.method,
    url: req.url,
  });

  next();
}
