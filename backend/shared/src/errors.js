/**
 * SupportFlow standard error classes.
 * Follows the error catalog in API_SPEC.md:
 * Envelope: { error: { code, message, details?, requestId } }
 */

export class AppError extends Error {
  constructor(message, code = 'INTERNAL_ERROR', statusCode = 500, details = null) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(requestId = null) {
    const errorObj = {
      code: this.code,
      message: this.message
    };
    if (this.details !== null && this.details !== undefined) {
      errorObj.details = this.details;
    }
    if (requestId) {
      errorObj.requestId = requestId;
    }
    return { error: errorObj };
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Request validation failed', details = null) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = 'Authentication required', code = 'UNAUTHENTICATED') {
    super(message, code, 401);
  }
}

export class InvalidCredentialsError extends AppError {
  constructor(message = 'Invalid email or password') {
    super(message, 'INVALID_CREDENTIALS', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Permission denied', code = 'FORBIDDEN') {
    super(message, code, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 'NOT_FOUND', 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict with current state', code = 'CONFLICT') {
    super(message, code, 409);
  }
}

export class DatabaseUnavailableError extends AppError {
  constructor(message = 'Database service unavailable') {
    super(message, 'DATABASE_UNAVAILABLE', 503);
  }
}

export class QueueUnavailableError extends AppError {
  constructor(message = 'Queue service unavailable') {
    super(message, 'QUEUE_UNAVAILABLE', 503);
  }
}

export class StorageUnavailableError extends AppError {
  constructor(message = 'Storage service unavailable') {
    super(message, 'STORAGE_UNAVAILABLE', 503);
  }
}

export class AiProviderUnavailableError extends AppError {
  constructor(message = 'AI provider unavailable') {
    super(message, 'AI_PROVIDER_UNAVAILABLE', 503);
  }
}
