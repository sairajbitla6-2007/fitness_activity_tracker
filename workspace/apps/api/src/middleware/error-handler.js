const ApiError = require('../errors/api-error');

function notFoundHandler(req, res) {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: `No route matches ${req.method} ${req.path}.`,
    },
  });
}

function errorHandler(error, _req, res, _next) {
  if (!(error instanceof ApiError)) {
    // Detailed errors stay in server logs; do not leak SQL or stack details to clients.
    console.error(error);
  }

  const isDatabaseError = typeof error?.code === 'string' &&
    (error.code.startsWith('ER_') || ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'PROTOCOL_CONNECTION_LOST'].includes(error.code));
  const statusCode = error instanceof ApiError
    ? error.statusCode
    : error?.type === 'entity.too.large'
      ? 413
      : error?.type === 'entity.parse.failed'
        ? 400
        : isDatabaseError
          ? 503
          : 500;
  const code = error instanceof ApiError
    ? error.code
    : error?.type === 'entity.too.large'
      ? 'PAYLOAD_TOO_LARGE'
      : error?.type === 'entity.parse.failed'
        ? 'INVALID_JSON'
        : isDatabaseError
          ? 'DATABASE_UNAVAILABLE'
          : 'INTERNAL_ERROR';

  res.status(statusCode).json({
    error: {
      code,
      message: error instanceof ApiError
        ? error.message
        : statusCode === 400
          ? 'Request body must contain valid JSON.'
          : statusCode === 413
            ? 'Request body is too large.'
            : statusCode === 503
              ? 'The service is temporarily unavailable.'
              : 'An unexpected error occurred.',
      ...(error instanceof ApiError && error.details ? { details: error.details } : {}),
    },
  });
}

module.exports = { notFoundHandler, errorHandler };
