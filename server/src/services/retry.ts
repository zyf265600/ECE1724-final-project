// Timeout and retry for calls to external services (Boson, DeepSeek).

// External service error; `retryable` is false when retrying cannot help.
export class UpstreamError extends Error {
  readonly service: string
  readonly retryable: boolean

  constructor(service: string, message: string, retryable: boolean) {
    super(`${service}: ${message}`)
    this.service = service
    this.retryable = retryable
  }
}

// 429 and 5xx are retryable.
export function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500
}

interface RetryOptions {
  attempts: number // total tries, including the first
  timeoutMs: number // per try
}

// Runs `call` up to `attempts` times, each with a `timeoutMs` timeout.
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
