export class CustomError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends CustomError {
  public errors: any[];

  constructor(message: string = "Validation failed", errors: any[] = []) {
    super(message, 400);
    this.errors = errors;
  }
}

export class AuthenticationError extends CustomError {
  constructor(message: string = "Authentication failed") {
    super(message, 401);
  }
}

export class AuthorizationError extends CustomError {
  constructor(message: string = "Access denied") {
    super(message, 403);
  }
}

export class NotFoundError extends CustomError {
  constructor(message: string = "Resource not found") {
    super(message, 404);
  }
}

export class ConflictError extends CustomError {
  constructor(message: string = "Resource conflict") {
    super(message, 409);
  }
}

export class ServiceUnavailableError extends CustomError {
  constructor(message: string = "Service temporarily unavailable") {
    super(message, 503);
  }
}

export class DatabaseError extends CustomError {
  constructor(message: string = "Database operation failed") {
    super(message, 500);
  }
}
