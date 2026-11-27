// Checks both LLMs by listing models (no tokens). Runs at start and via `npm run llm:check`.
import Anthropic from '@anthropic-ai/sdk'
import { CLAUDE_MODEL, claudeConfigured } from './claude.ts'
import { deepseekConfigured, markDeepSeekDown } from './llm.ts'

const DEEPSEEK_MODELS_URL = 'https://api.deepseek.com/models'
const TIMEOUT_MS = 5_000

export type LlmStatus = 'ok' | 'not configured' | `down: ${string}`

export async function checkLlm(): Promise<{ deepseek: LlmStatus; claude: LlmStatus }> {
  const [deepseek, claude] = await Promise.all([
    probe(deepseekConfigured(), checkDeepSeek),
    probe(claudeConfigured(), checkClaude),
  ])
  if (deepseek.startsWith('down')) markDeepSeekDown(deepseek.slice('down: '.length))
  return { deepseek, claude }
}

async function probe(configured: boolean, check: () => Promise<void>): Promise<LlmStatus> {
  if (!configured) return 'not configured'
  try {
    await check()
    return 'ok'
  } catch (err) {
    return `down: ${(err as Error).message}`
  }
}

async function checkDeepSeek(): Promise<void> {
  const res = await fetch(DEEPSEEK_MODELS_URL, {
    headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY?.trim()}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

async function checkClaude(): Promise<void> {
  await new Anthropic({ maxRetries: 0 }).models.retrieve(CLAUDE_MODEL, {}, { timeout: TIMEOUT_MS })
}
