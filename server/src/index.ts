import 'dotenv/config'
import { createServer } from 'node:http'
import { createApp } from './app.ts'
import { attachRooms } from './room/server.ts'

const PORT = Number(process.env.PORT ?? 4000)

const server = createServer(createApp())
attachRooms(server) // meeting-room WebSockets share the port with the REST API

server.listen(PORT, () => {
  console.log(`DeepDive server listening on http://localhost:${PORT}`)
})
