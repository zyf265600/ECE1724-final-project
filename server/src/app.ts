import express from 'express'
import type { HealthResponse } from '@deepdive/shared'
import { apiNotFound, errorHandler } from './http/errors.ts'
import { interviewsRouter } from './routes/interviews.ts'
import { turnsRouter } from './routes/turns.ts'

// Express app only; index.ts starts the HTTP server.
export function createApp() {
  const app = express()
  app.use(express.json())

  app.get('/api/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', time: new Date().toISOString() }
    res.json(body)
  })

  app.use('/api/interviews', interviewsRouter)
  app.use('/api/turns', turnsRouter)

  app.use('/api', apiNotFound)
  app.use(errorHandler)
  return app
}
