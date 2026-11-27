import 'dotenv/config'

// Required setting from server/.env; throws a clear error if missing.
export function requireEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not set. Add it to server/.env (see server/.env.example).`)
  return value
}
