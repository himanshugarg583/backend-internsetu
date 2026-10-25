export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }

  static badRequest(msg: string, details?: unknown) {
    return new AppError(400, 'BAD_REQUEST', msg, details);
  }
  static unauthorized(msg = 'Authentication required') {
    return new AppError(401, 'UNAUTHORIZED', msg);
  }
  static forbidden(msg = 'Forbidden') {
    return new AppError(403, 'FORBIDDEN', msg);
  }
  static notFound(msg = 'Resource not found') {
    return new AppError(404, 'NOT_FOUND', msg);
  }
  static conflict(msg: string) {
    return new AppError(409, 'CONFLICT', msg);
  }
  static tooMany(msg: string) {
    return new AppError(429, 'TOO_MANY_REQUESTS', msg);
  }
  static config(msg: string) {
    return new AppError(503, 'CONFIGURATION_ERROR', msg);
  }
}
