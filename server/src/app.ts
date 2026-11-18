import express from 'express'
import type { HealthResponse } from '@deepdive/shared'
import { apiNotFound, errorHandler } from './http/errors.ts'
import { interviewsRouter } from './routes/interviews.ts'
import { turnsRouter } from './routes/turns.ts'

// Builds the Express app without starting it, so index.ts owns the HTTP server
// (the WebSocket server attaches to the same one).
export function createApp() {
  const app = express()
  app.use(express.json())

  // Health check: lets the client (and us) confirm the server is running.
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
