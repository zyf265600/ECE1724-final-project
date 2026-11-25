import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { AudioLines, Loader2, Mic, MicOff, User } from 'lucide-react'
import type { InterviewDetail, TurnDto } from '@deepdive/shared'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useRecorder } from '@/hooks/useRecorder'
import { useRoom } from '@/hooks/useRoom'
import { api, errorMessage } from '@/lib/api'
import { DIFFICULTY_LABEL } from '@/lib/labels'

// Meeting room (docs/wireframes.md, section 3): loads the interview, then runs
// the live voice loop over the WebSocket.
export function RoomPage() {
  const { id = '' } = useParams()
  const [interview, setInterview] = useState<InterviewDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getInterview(id).then(setInterview, (err) => setError(errorMessage(err)))
  }, [id])

  if (error) return <Message text={error} />
  if (!interview) return <p className="text-muted-foreground">Loading…</p>
  // A finished interview has nothing left to do here; its report page shows scoring progress.
  if (interview.status !== 'CREATED' && interview.status !== 'LIVE') {
    return <Navigate to={`/interviews/${id}/report`} replace />
  }
  return <Room interview={interview} />
}

function Room({ interview }: { interview: InterviewDetail }) {
  const room = useRoom(interview.id, interview.turns)
  const mic = useRecorder()
  const { view } = room
  const [joined, setJoined] = useState(false)
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState<string | null>(null)
  const [startedAt, setStartedAt] = useState(interview.startedAt)
  const lastAnswer = useRef<Blob | null>(null) // kept so a failed transcription can be resent
  const secondsLeft = useSecondsLeft(startedAt, interview.durationMin)

  const navigate = useNavigate()
  const ended = view.state === 'ended'
  const speaking = view.playing || view.state === 'speaking'
  const canAnswer = joined && view.connection === 'open' && view.state === 'listening' && !view.playing

  // The microphone records only on the candidate's turn, after the question has been heard.
  // After the interview: open the report once the closing words have played and scoring
  // has finished, failed, or can no longer be followed on this socket (the report page polls).
  const scoringOver = view.reportReady || view.error?.code === 'SCORING_FAILED' || view.connection === 'closed'
  useEffect(() => {
    if (ended && !view.playing && scoringOver) navigate(`/interviews/${interview.id}/report`, { replace: true })
  }, [ended, view.playing, scoringOver, navigate, interview.id])

  const { recording, start: startRecording, stop: stopRecording } = mic
  useEffect(() => {
    if (canAnswer && !recording) startRecording()
    if (!canAnswer && recording) void stopRecording()
  }, [canAnswer, recording, startRecording, stopRecording])

  // "Begin" (new interview) or "Resume" (after a reload): the click unlocks audio.
  const join = async () => {
    setJoinError(null)
    setJoining(true) // a second click while the microphone prompt is open does nothing
    try {
      await mic.open()
      await room.unlockAudio()
      setJoined(true)
      if (interview.status === 'CREATED') {
        room.start()
        setStartedAt((s) => s ?? new Date().toISOString())
      }
    } catch {
      setJoinError('Microphone blocked. Allow it in the browser settings, then try again.')
    } finally {
      setJoining(false)
    }
  }

  const finishAnswer = async () => {
    const answer = await mic.stop()
    if (!answer) return
    lastAnswer.current = answer
    room.sendAnswer(answer)
  }

  const retry = async () => {
    if (view.error?.code === 'STT_FAILED' && lastAnswer.current) {
      await mic.stop() // drop the new recording; send the saved one again
      room.sendAnswer(lastAnswer.current)
    } else {
      room.reconnect()
    }
  }

  if (ended) {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" /> Interview finished. Scoring your answers…
        </p>
        <Captions turns={view.captions} />
      </div>
    )
  }

  // Before Begin (or Resume): a waiting room with the one action. Also shown again if a
  // reconnect finds the interview not started yet.
  if (!joined || view.state === null) {
    const created = interview.status === 'CREATED'
    return (
      <div className="flex min-h-[65svh] items-center justify-center">
        <Card className="w-full max-w-md items-center gap-3 px-6 py-10 text-center md:px-10">
          <p className="text-sm text-muted-foreground">
            {interview.role} · {DIFFICULTY_LABEL[interview.difficulty]} · {interview.durationMin} min
          </p>
          <h1 className="text-3xl font-medium text-white">
            {created ? 'Ready when you are.' : 'Your interview is still running.'}
          </h1>
          <Button size="lg" className="mt-4 w-full" onClick={join} disabled={joining || view.connection !== 'open'}>
            {created ? 'Begin' : 'Resume interview'}
          </Button>
          {joinError && <p className="text-sm text-destructive">{joinError}</p>}
          {view.error && <p className="text-sm text-destructive">{view.error.message}</p>}
        </Card>
      </div>
    )
  }

  return (
    // Bottom padding on phones leaves room for the pinned control bar.
    <div className="space-y-4 pb-36 md:pb-0">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-white">
          {interview.role} · {DIFFICULTY_LABEL[interview.difficulty]}
        </h1>
        <span className="shrink-0 rounded-full border bg-card px-3 py-1 font-mono text-sm whitespace-nowrap tabular-nums">
          {secondsLeft === 0 ? 'Time is up' : `${formatTime(secondsLeft)} left`}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Interviewer" active={speaking} icon={<AudioLines className="size-7 md:size-9" />} />
        <Tile
          label="You"
          active={recording}
          icon={<User className="size-7 md:size-9" />}
          status={
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              {recording ? <Mic className="size-3.5 text-destructive" /> : <MicOff className="size-3.5" />}
              {recording ? 'Recording' : 'Mic off'}
            </span>
          }
        />
      </div>

      <p className="flex min-h-5 items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
        <StatusLabel
          speaking={speaking}
          state={view.state}
          recording={recording}
          seconds={mic.seconds}
          timeUp={secondsLeft === 0}
        />
      </p>

      <Captions turns={view.captions} />

      {/* Pinned to the bottom on phones, inline on larger screens. */}
      <div className="fixed inset-x-0 bottom-0 z-10 space-y-2 border-t bg-background p-4 md:static md:border-0 md:bg-transparent md:p-0">
        {view.error && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-4">
              {view.error.message}
              {view.error.retryable ? (
                <Button variant="outline" size="sm" onClick={retry}>
                  Retry
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={room.dismissError}>
                  Dismiss
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex gap-3 md:justify-center">
          <Button size="lg" className="flex-1 md:flex-none" disabled={!recording} onClick={finishAnswer}>
            Finish answer
          </Button>
          <EndButton onEnd={room.end} />
        </div>
      </div>
    </div>
  )
}

// One participant. A static outline marks who is speaking: the interviewer while their
// audio plays, the candidate while the microphone records.
function Tile({ label, active, icon, status }: { label: string; active: boolean; icon: ReactNode; status?: ReactNode }) {
  return (
    <div
      className={`relative grid h-36 place-items-center rounded-xl bg-(--tile) ring-1 ring-white/5 md:h-auto md:aspect-video ${
        active ? 'outline-3 -outline-offset-3 outline-(--speaking)' : ''
      }`}
    >
      <span
        className={`grid size-16 place-items-center rounded-full text-white md:size-20 ${
          active ? 'bg-primary' : 'bg-navy-700'
        }`}
      >
        {icon}
      </span>
      <span className="absolute bottom-2.5 left-3 text-sm font-medium">{label}</span>
      {status && <span className="absolute top-2.5 right-3">{status}</span>}
    </div>
  )
}

function StatusLabel(props: {
  speaking: boolean
  state: string | null
  recording: boolean
  seconds: number
  timeUp: boolean
}) {
  if (props.speaking) return <>Interviewer is speaking</>
  if (props.state === 'thinking' || props.state === null) {
    return (
      <>
        <Loader2 className="size-4 animate-spin" /> Thinking…
      </>
    )
  }
  // The server closes the interview after this answer.
  if (props.recording && props.timeUp) return <>Time is up. Finish your answer to end the interview.</>
  if (props.recording) return <>Your turn · {formatTime(props.seconds)} recording</>
  return <>Your turn</>
}

function Captions({ turns }: { turns: TurnDto[] }) {
  const box = useRef<HTMLDivElement>(null)
  // Keep the newest caption in view.
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight })
  }, [turns.length])

  return (
    <Card className="gap-0 p-0">
      <p className="border-b px-4 py-2.5 text-sm font-medium">Captions</p>
      <div ref={box} className="h-64 space-y-3 overflow-y-auto px-4 py-3 md:h-72">
        {turns.length === 0 && <p className="text-sm text-muted-foreground">Captions appear here.</p>}
        {turns.map((turn) => (
          <div key={turn.id}>
            <p className={`text-xs font-medium ${turn.speaker === 'INTERVIEWER' ? 'text-navy-200' : 'text-muted-foreground'}`}>
              {turn.speaker === 'INTERVIEWER' ? 'Interviewer' : 'You'}
            </p>
            <p>{turn.text}</p>
          </div>
        ))}
      </div>
    </Card>
  )
}

function EndButton({ onEnd }: { onEnd: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="lg" className="bg-destructive text-white shadow-none hover:bg-destructive/85">
          End interview
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End now?</AlertDialogTitle>
          <AlertDialogDescription>
            Your answers so far will be scored. The answer you are giving now is not included.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep going</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onEnd}>
            End interview
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// Seconds left, counted from when the interview went live; updated every second.
function useSecondsLeft(startedAt: string | null, minutes: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const total = minutes * 60
  return startedAt ? Math.max(0, total - Math.floor((now - Date.parse(startedAt)) / 1000)) : total
}

const formatTime = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`

function Message({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="space-y-4">
      <p>{text}</p>
      {children}
      <Button asChild variant="outline">
        <Link to="/">Back to home</Link>
      </Button>
    </div>
  )
}
