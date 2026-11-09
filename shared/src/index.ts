// Types shared by client and server.
// The full API contract (REST bodies and WebSocket messages) is added here in the next step.

export interface HealthResponse {
  status: 'ok'
  time: string // ISO 8601 timestamp from the server
}
