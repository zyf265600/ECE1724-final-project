import type { ErrorRequestHandler, RequestHandler } from 'express'
import type { ApiError } from '@deepdive/shared'

type ErrorCode = ApiError['error']['code']

// Throw from a route to send a status and error code.
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

// JSON 404 for unknown /api paths.
export const apiNotFound: RequestHandler = (req) => {
  throw new HttpError(404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`)
}

// Turns any error into an ApiError body.
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    const body: ApiError = { error: { code: err.code, message: err.message } }
    res.status(err.status).json(body)
    return
  }
  // Malformed JSON body (from express.json()).
  if (err instanceof SyntaxError && 'body' in err) {
    const body: ApiError = { error: { code: 'VALIDATION_ERROR', message: 'Request body is not valid JSON' } }
    res.status(400).json(body)
    return
  }
  console.error(err)
  const body: ApiError = { error: { code: 'INTERNAL', message: 'Something went wrong on the server' } }
  res.status(500).json(body)
}
