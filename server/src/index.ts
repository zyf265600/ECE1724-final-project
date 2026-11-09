import 'dotenv/config'
import express from 'express'
import type { HealthResponse } from '@deepdive/shared'

const app = express()
const PORT = Number(process.env.PORT ?? 4000)

app.use(express.json())

// Health check: lets the client (and us) confirm the server is running.
app.get('/api/health', (_req, res) => {
  const body: HealthResponse = { status: 'ok', time: new Date().toISOString() }
  res.json(body)
})

app.listen(PORT, () => {
  console.log(`DeepDive server listening on http://localhost:${PORT}`)
})
