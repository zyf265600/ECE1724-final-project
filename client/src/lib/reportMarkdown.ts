import { SKILL_WEIGHTS, type InterviewDetail, type ReportDto } from '@deepdive/shared'
import { DIFFICULTY_LABEL, SKILL_LABEL, VERDICT_LABEL, shortDate } from './labels'

export function reportMarkdown(interview: InterviewDetail, report: ReportDto): string {
  const lines = [
    `# ${interview.role}: interview report`,
    '',
    `${DIFFICULTY_LABEL[interview.difficulty]} · ${interview.durationMin} min · ${shortDate(interview.createdAt)}`,
    '',
    `**${VERDICT_LABEL[report.verdict]}**, ${report.overallScore.toFixed(1)} / 4`,
    '',
    report.summary,
    '',
    '| Skill | Weight | Score |',
    '|---|---|---|',
    ...report.scores.map((s) => `| ${SKILL_LABEL[s.skill]} | ${SKILL_WEIGHTS[s.skill] * 100}% | ${s.score} / 4 |`),
    '',
  ]
  for (const s of report.scores) {
    lines.push(`## ${SKILL_LABEL[s.skill]}: ${s.score} / 4`, '', s.comment, '')
    if (s.quote) lines.push(`> ${s.quote}`, '')
  }
  lines.push('## Transcript', '')
  for (const turn of interview.turns) {
    lines.push(`**${turn.speaker === 'INTERVIEWER' ? 'Interviewer' : 'You'}:** ${turn.text}`, '')
  }
  return lines.join('\n')
}

export function downloadText(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
