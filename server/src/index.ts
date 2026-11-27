import 'dotenv/config'
import { createServer } from 'node:http'
import { createApp } from './app.ts'
import { attachRooms } from './room/server.ts'
import { checkLlm } from './services/llmHealth.ts'
import { resumeScoring } from './services/scoring.ts'

const PORT = Number(process.env.PORT ?? 4000)

const server = createServer(createApp())
attachRooms(server) // WebSockets share the HTTP server

server.listen(PORT, () => {
  console.log(`DeepDive server listening on http://localhost:${PORT}`)
  // If DeepSeek is down, start on Claude.
  checkLlm()
    .then(({ deepseek, claude }) => console.log(`LLM: DeepSeek ${deepseek}; Claude ${claude}`))
    .catch((err) => console.error('LLM check failed:', err))
  // Resume scoring interrupted by a restart.
  resumeScoring().catch((err) => console.error('resume scoring failed:', err))
})
