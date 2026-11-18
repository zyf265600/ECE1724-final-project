import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router'
import type { InterviewDetail } from '@deepdive/shared'
import { Button } from '@/components/ui/button'
import { api, errorMessage } from '@/lib/api'
import { DIFFICULTY_LABEL, VOICE_LABEL } from '@/lib/labels'

// Meeting room. For now it loads the saved interview and shows its settings;
// the live voice loop (WebSocket, recording, playback) is added on top of this page.
export function RoomPage() {
  const { id = '' } = useParams()
  const [interview, setInterview] = useState<InterviewDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.getInterview(id).then(setInterview, (err) => setError(errorMessage(err)))
  }, [id])

  if (error) return <NotFound message={error} />
  if (!interview) return <p className="text-muted-foreground">Loading…</p>
  // A finished interview has nothing left to do here.
  if (interview.status === 'DONE') return <Navigate to={`/interviews/${id}/report`} replace />

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{interview.role}</h1>
      <p className="text-muted-foreground">
        {DIFFICULTY_LABEL[interview.difficulty]} · {interview.durationMin} min · {VOICE_LABEL[interview.voice]}{' '}
        interviewer
      </p>
      <p>Ready when you are.</p>
    </div>
  )
}

function NotFound({ message }: { message: string }) {
  return (
    <div className="space-y-4">
      <p>{message}</p>
      <Button asChild variant="outline">
        <Link to="/">Back to home</Link>
      </Button>
    </div>
  )
}
