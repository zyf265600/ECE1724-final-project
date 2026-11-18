import type { ErrorRequestHandler, RequestHandler } from 'express'
import type { ApiError } from '@deepdive/shared'

type ErrorCode = ApiError['error']['code']

// Throw this from a route to send a specific status and error code.
// Express 5 passes errors thrown in async handlers to errorHandler on its own.
export class HttpError extends Error {
  readonly status: number
  readonly code: ErrorCode

  constructor(status: number, code: ErrorCode, message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

export const notFound = (what: string) => new HttpError(404, 'NOT_FOUND', `${what} not found`)

// Unknown /api paths get the same JSON error shape as everything else.
export const apiNotFound: RequestHandler = (req) => {
  throw new HttpError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`)
}

// Last middleware: turns any error into an ApiError body.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    const body: ApiError = { error: { code: err.code, message: err.message } }
    res.status(err.status).json(body)
    return
  }
  // Malformed JSON body (thrown by express.json()).
  if (err instanceof SyntaxError && 'body' in err) {
    const body: ApiError = { error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON' } }
    res.status(400).json(body)
    return
  }
  console.error(err)
  const body: ApiError = { error: { code: 'INTERNAL', message: 'Something went wrong on the server' } }
  res.status(500).json(body)
}
