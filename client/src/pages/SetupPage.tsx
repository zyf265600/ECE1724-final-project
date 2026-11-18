import { useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { DURATIONS_MIN, type CreateInterviewRequest, type DurationMin } from '@deepdive/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { useMicCheck, type MicStatus } from '@/hooks/useMicCheck'
import { api, errorMessage } from '@/lib/api'
import { DIFFICULTY_LABEL, VOICE_LABEL } from '@/lib/labels'

// Every field has a default, so "Test microphone" then "Start interview" is enough.
const DEFAULTS: CreateInterviewRequest = {
  role: 'Software engineer intern',
  difficulty: 'MEDIUM',
  durationMin: 10,
  voice: 'FEMALE',
}

const MIC_TEXT: Record<MicStatus, string> = {
  idle: 'Not tested yet',
  asking: 'Waiting for permission…',
  working: 'Working',
  blocked: 'Microphone blocked. Allow it in the browser settings, then test again.',
  error: 'No microphone found.',
}

// Setup: choose the interview settings and check the microphone (docs/wireframes.md, section 2).
export function SetupPage() {
  const navigate = useNavigate()
  const mic = useMicCheck()
  const [form, setForm] = useState(DEFAULTS)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = <K extends keyof CreateInterviewRequest>(key: K, value: CreateInterviewRequest[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const interview = await api.createInterview({ ...form, role: form.role.trim() })
      navigate(`/interviews/${interview.id}/room`)
    } catch (err) {
      setError(errorMessage(err))
      setSubmitting(false)
    }
  }

  const canStart = mic.status === 'working' && form.role.trim() !== '' && !submitting

  return (
    // Bottom padding on phones leaves room for the pinned Start button.
    <form onSubmit={submit} className="space-y-6 pb-24 md:pb-0">
      <h1 className="text-2xl font-semibold">New interview</h1>

      <Field label="Role" htmlFor="role">
        <Input
          id="role"
          value={form.role}
          maxLength={100}
          onChange={(e) => set('role', e.target.value)}
          className="md:max-w-sm"
        />
      </Field>

      <Field label="Difficulty">
        <Choice
          value={form.difficulty}
          options={Object.entries(DIFFICULTY_LABEL)}
          onChange={(v) => set('difficulty', v as CreateInterviewRequest['difficulty'])}
        />
      </Field>

      <Field label="Length">
        <Choice
          value={String(form.durationMin)}
          options={DURATIONS_MIN.map((m) => [String(m), `${m} min`])}
          onChange={(v) => set('durationMin', Number(v) as DurationMin)}
        />
      </Field>

      <Field label="Voice">
        <Choice
          value={form.voice}
          options={Object.entries(VOICE_LABEL)}
          onChange={(v) => set('voice', v as CreateInterviewRequest['voice'])}
        />
      </Field>

      <Field label="Microphone">
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" onClick={mic.start} disabled={mic.status === 'asking'}>
            Test microphone
          </Button>
          <div className="h-2 w-32 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full bg-primary transition-[width]" style={{ width: `${mic.level * 100}%` }} />
          </div>
          <span className={`text-sm ${mic.status === 'blocked' || mic.status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
            {MIC_TEXT[mic.status]}
          </span>
        </div>
      </Field>

      {/* Pinned to the bottom on phones, inline on larger screens. */}
      <div className="fixed inset-x-0 bottom-0 space-y-2 border-t bg-background p-4 md:static md:border-0 md:p-0">
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" size="lg" disabled={!canStart} className="w-full md:w-auto">
          {submitting ? 'Starting…' : 'Start interview'}
        </Button>
      </div>
    </form>
  )
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 md:grid-cols-[8rem_1fr] md:items-center">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  )
}

// One-of-several buttons. Clicking the selected option again keeps it selected.
function Choice({
  value,
  options,
  onChange,
}: {
  value: string
  options: [string, string][]
  onChange: (value: string) => void
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value}
      onValueChange={(v) => v && onChange(v)}
      className="justify-start"
    >
      {options.map(([v, label]) => (
        <ToggleGroupItem
          key={v}
          value={v}
          className="px-4 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
        >
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
