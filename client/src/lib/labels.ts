// Display text for values from shared/src/domain.ts.
import type { Difficulty, InterviewListItem, Verdict, Voice } from '@deepdive/shared'

export const DIFFICULTY_LABEL: Record<Difficulty, string> = { EASY: 'Easy', MEDIUM: 'Medium', HARD: 'Hard' }

export const VOICE_LABEL: Record<Voice, string> = { FEMALE: 'Female', MALE: 'Male' }

export const VERDICT_LABEL: Record<Verdict, string> = {
  STRONG_HIRE: 'Strong hire',
  HIRE: 'Hire',
  NO_HIRE: 'No hire',
  STRONG_NO_HIRE: 'Strong no hire',
}

// "Nov 15"
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

// The history "Result" column (docs/wireframes.md, Home).
export function resultLabel(item: InterviewListItem): string {
  switch (item.status) {
    case 'DONE':
      return item.overallScore !== null && item.verdict
        ? `${item.overallScore.toFixed(1)} / 4 · ${VERDICT_LABEL[item.verdict]}`
        : 'Done'
    case 'SCORING':
      return 'Scoring…'
    case 'FAILED':
      return 'Failed'
    default:
      return 'Unfinished'
  }
}

// Interviews that have (or will soon have) a report page to open.
export const hasReport = (item: InterviewListItem) =>
  item.status === 'DONE' || item.status === 'SCORING' || item.status === 'FAILED'
