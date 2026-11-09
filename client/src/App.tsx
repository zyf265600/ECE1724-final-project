import { useEffect, useState } from 'react'
import type { HealthResponse } from '@deepdive/shared'

// Placeholder page: proves the client can reach the server through the Vite proxy.
// Real pages (Home, Setup, Meeting Room, Report) replace this later.
export default function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<HealthResponse>
      })
      .then(setHealth)
      .catch((err: Error) => setError(err.message))
  }, [])

  return (
    <main style={{ padding: 24 }}>
      <h1>DeepDive</h1>
      {error && <p>Server unreachable: {error}</p>}
      {!error && !health && <p>Checking server…</p>}
      {health && (
        <p>
          Server status: {health.status} (time {health.time})
        </p>
      )}
    </main>
  )
}
