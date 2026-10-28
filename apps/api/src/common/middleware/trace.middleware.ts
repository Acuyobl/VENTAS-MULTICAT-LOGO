import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

export function traceMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.headers['x-request-id'];
  const traceId = typeof incoming === 'string' && incoming.length <= 128 ? incoming : randomUUID();
  (req as Request & { traceId: string }).traceId = traceId;
  res.setHeader('x-request-id', traceId);
  next();
}
