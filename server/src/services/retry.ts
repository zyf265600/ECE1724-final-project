// Timeout and retry for calls to external services (Boson, DeepSeek).

// An external service answered with an error, or the connection failed.
// `retryable` is false when trying again cannot help (bad key, bad request, no credit).
export class UpstreamError extends Error {
  readonly service: string
  readonly retryable: boolean

  constructor(service: string, message: string, retryable: boolean) {
    super(`${service}: ${message}`)
    this.service = service
    this.retryable = retryable
  }
}

// 429 (rate limit) and 5xx are worth another try; other 4xx are our own mistake.
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

interface RetryOptions {
  attempts: number // total tries, including the first
  timeoutMs: number // per try
}

// Runs `call` up to `attempts` times. Each try gets its own AbortSignal that fires
// after `timeoutMs`; a timeout or a retryable error leads to the next try after a short pause.
export async function withRetry<T>(
  call: (signal: AbortSignal) => Promise<T>,
  { attempts, timeoutMs }: RetryOptions,
): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await call(AbortSignal.timeout(timeoutMs))
    } catch (err) {
      lastError = err
      const retryable = !(err instanceof UpstreamError) || err.retryable
      if (!retryable || attempt === attempts) break
      await new Promise((resolve) => setTimeout(resolve, 500 * attempt))
    }
  }
  throw lastError
}
