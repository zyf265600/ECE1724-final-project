import 'dotenv/config'

// Reads a required setting from server/.env. Fails with a clear message instead of
// letting `undefined` reach an SDK and fail later with a confusing error.
export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not set. Add it to server/.env (see server/.env.example).`)
  return value
}
