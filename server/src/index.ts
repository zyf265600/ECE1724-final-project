import 'dotenv/config'
import { createServer } from 'node:http'
import { createApp } from './app.ts'

const PORT = Number(process.env.PORT ?? 4000)

const server = createServer(createApp())

server.listen(PORT, () => {
  console.log(`DeepDive server listening on http://localhost:${PORT}`)
})
