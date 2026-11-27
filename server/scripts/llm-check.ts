// Checks both LLM keys by listing models (uses no tokens).
// Usage: npm run llm:check -w server
import 'dotenv/config'
import { CLAUDE_MODEL } from '../src/services/claude.ts'
import { checkLlm } from '../src/services/llmHealth.ts'

const { deepseek, claude } = await checkLlm()
console.log(`DeepSeek (deepseek-chat): ${deepseek}`)
console.log(`Claude (${CLAUDE_MODEL}), backup: ${claude}`)
if (deepseek !== 'ok' && claude !== 'ok') {
  console.error('No LLM can answer: interviews cannot ask follow-up questions or be scored.')
  process.exit(1)
}
