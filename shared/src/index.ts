// API contract shared by client and server.
// Changes go through a pull request reviewed by Yifei.
export * from './domain.ts'

export interface HealthResponse {
  status: 'ok'
  time: string // ISO 8601 timestamp from the server
}
