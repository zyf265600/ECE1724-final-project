import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { Download, Loader2, Play } from 'lucide-react'
import { SKILL_WEIGHTS, type InterviewDetail, type ReportDto, type ScoreDto } from '@deepdive/shared'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ApiRequestError, api, errorMessage } from '@/lib/api'
import { DIFFICULTY_LABEL, SKILL_LABEL, VERDICT_LABEL, shortDate } from '@/lib/labels'
import { downloadText, reportMarkdown } from '@/lib/reportMarkdown'

const POLL_MS = 3000

type Load =
  | { kind: 'loading' }
  | { kind: 'ready'; interview: InterviewDetail; report: ReportDto }
  | { kind: 'scoring' } // 409 while SCORING: poll
  | { kind: 'failed' } // status FAILED: offer Score again
  | { kind: 'unfinished'; interviewId: string } // CREATED or LIVE
  | { kind: 'error'; message: string; notFound: boolean }

// Report (docs/wireframes.md, section 4): verdict first, then evidence per skill.
export function ReportPage() {
  const { id = '' } = useParams()
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [attempt, setAttempt] = useState(0) // bumped by Score again to restart polling

  const fetchReport = useCallback(async (): Promise<Load> => {
    try {
      const interview = await api.getInterview(id)
      if (interview.status === 'FAILED') return { kind: 'failed' }
      if (interview.status === 'CREATED' || interview.status === 'LIVE') return { kind: 'unfinished', interviewId: id }
      if (interview.status === 'SCORING') return { kind: 'scoring' }
      return { kind: 'ready', interview, report: await api.getReport(id) }
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 409) return { kind: 'scoring' }
      const notFound = err instanceof ApiRequestError && err.status === 404
      return { kind: 'error', message: notFound ? 'Interview not found.' : errorMessage(err), notFound }
    }
  }, [id])

  // Load, then keep polling while scoring runs.
  useEffect(() => {
    let stopped = false
    let timer: ReturnType<typeof setTimeout>
    const tick = async () => {
      const next = await fetchReport()
      if (stopped) return
      setLoad(next)
      if (next.kind === 'scoring') timer = setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => {
      stopped = true
      clearTimeout(timer)
    }
  }, [fetchReport, attempt])

  const scoreAgain = async () => {
    try {
      await api.scoreAgain(id)
      setAttempt((n) => n + 1)
    } catch (err) {
      setLoad({ kind: 'error', message: `Could not score again: ${errorMessage(err)}`, notFound: false })
    }
  }

  switch (load.kind) {
    case 'loading':
      return <p className="text-muted-foreground">Loading…</p>
    case 'scoring':
      return (
        <p className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Scoring your answers…
        </p>
      )
    case 'failed':
      return (
        <div className="space-y-4">
          <p>Scoring failed.</p>
          <Button onClick={scoreAgain}>Score again</Button>
        </div>
      )
    case 'unfinished':
      return (
        <div className="space-y-4">
          <p>This interview is not finished yet.</p>
          <Button asChild>
            <Link to={`/interviews/${load.interviewId}/room`}>Go to the interview</Link>
          </Button>
        </div>
      )
    case 'error':
      return (
        <div className="space-y-4">
          <p>{load.message}</p>
          <Button asChild variant="outline">
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      )
    case 'ready':
      return <Report interview={load.interview} report={load.report} />
  }
}

function Report({ interview, report }: { interview: InterviewDetail; report: ReportDto }) {
  const download = () =>
    // en-CA formats the local date as YYYY-MM-DD.
    downloadText(`deepdive-report-${new Date(interview.createdAt).toLocaleDateString('en-CA')}.md`, reportMarkdown(interview, report))
  const hasAudio = (turnId: string | null) => interview.turns.some((t) => t.id === turnId && t.hasAudio)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{interview.role}</h1>
          <p className="text-muted-foreground">
            {DIFFICULTY_LABEL[interview.difficulty]} · {interview.durationMin} min · {shortDate(interview.createdAt)}
          </p>
        </div>
        {/* Desktop: top right. Phone: at the bottom (below). */}
        <Button variant="outline" className="hidden md:inline-flex" onClick={download}>
          <Download /> Download Markdown
        </Button>
      </div>

      <Card className="gap-2 p-6">
        <p className="text-sm font-medium text-muted-foreground">{VERDICT_LABEL[report.verdict]}</p>
        <p className="text-4xl font-semibold">{report.overallScore.toFixed(1)} / 4</p>
        <p>{report.summary}</p>
      </Card>

      <ul className="space-y-3">
        {report.scores.map((score) => (
          <li key={score.skill}>
            <SkillCard score={score} canPlay={hasAudio(score.turnId)} />
          </li>
        ))}
      </ul>

      <Button variant="outline" className="w-full md:hidden" onClick={download}>
        <Download /> Download Markdown
      </Button>
    </div>
  )
}

function SkillCard({ score, canPlay }: { score: ScoreDto; canPlay: boolean }) {
  return (
    <Card className="gap-2 p-4">
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-medium">
          {SKILL_LABEL[score.skill]}{' '}
          <span className="text-sm font-normal text-muted-foreground">{SKILL_WEIGHTS[score.skill] * 100}%</span>
        </p>
        <p className="font-semibold">{score.score} / 4</p>
      </div>
      <p className="text-sm">{score.comment}</p>
      {score.quote && <blockquote className="border-l-2 pl-3 text-sm italic">“{score.quote}”</blockquote>}
      {score.turnId && canPlay && <PlayAnswer turnId={score.turnId} />}
    </Card>
  )
}

// Fetches a short-lived URL for the recording on click, then plays it.
function PlayAnswer({ turnId }: { turnId: string }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const play = async () => {
    setError(null)
    try {
      setUrl((await api.getAudioUrl(turnId)).url)
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  if (url) return <audio src={url} controls autoPlay className="w-full" />
  return (
    <div className="space-y-2">
      <Button variant="outline" size="sm" onClick={play}>
        <Play /> Play my answer
      </Button>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  )
}
