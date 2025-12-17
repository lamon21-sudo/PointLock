import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config';
import { logger } from './utils/logger';
import { ApiResponse, ERROR_CODES } from '@pick-rivals/shared-types';
import { AppError } from './utils/errors';

// Import routes
import healthRoutes from './routes/health.routes';
import eventsRoutes from './routes/events.routes';
import { authRoutes } from './modules/auth';

const app: Express = express();

// ===========================================
// Middleware
// ===========================================

// Security headers
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: config.nodeEnv === 'production'
    ? ['https://pickrivals.com'] // Update with actual domain
    : '*',
  credentials: true,
}));

// Parse JSON bodies
app.use(express.json({ limit: '10kb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Compress responses
app.use(compression());

// Request logging
app.use((req: Request, _res: Response, next: NextFunction) => {
  const start = Date.now();

  _res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(`${req.method} ${req.path} ${_res.statusCode} - ${duration}ms`);
  });

  next();
});

// ===========================================
// Routes
// ===========================================

// Health check
app.use('/health', healthRoutes);

// API v1 routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/events', eventsRoutes);

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  const response: ApiResponse<{ message: string; version: string }> = {
    success: true,
    data: {
      message: 'Welcome to PickRivals API',
      version: '0.1.0',
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: generateRequestId(),
    },
  };
  res.json(response);
});

// ===========================================
// Error Handling
// ===========================================

// 404 handler
app.use((_req: Request, res: Response) => {
  const response: ApiResponse = {
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'The requested resource was not found',
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: generateRequestId(),
    },
  };
  res.status(404).json(response);
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logger.error('Unhandled error:', err);

  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const errorCode = err instanceof AppError ? err.code : ERROR_CODES.INTERNAL_ERROR;

  const response: ApiResponse = {
    success: false,
    error: {
      code: errorCode,
      message: config.nodeEnv === 'production'
        ? 'An unexpected error occurred'
        : err.message,
      details: config.nodeEnv === 'development' ? err.stack : undefined,
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: generateRequestId(),
    },
  };

  res.status(statusCode).json(response);
});

// ===========================================
// Helpers
// ===========================================

function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export default app;
