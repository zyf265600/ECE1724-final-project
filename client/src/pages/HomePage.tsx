import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { X } from 'lucide-react'
import type { InterviewListItem } from '@deepdive/shared'
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
import { api, errorMessage } from '@/lib/api'
import { DIFFICULTY_LABEL, hasReport, resultLabel, shortDate } from '@/lib/labels'

// Home: start a new interview, and the history of past ones (docs/wireframes.md, section 1).
export function HomePage() {
  const [interviews, setInterviews] = useState<InterviewListItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const fetchList = () =>
    api.listInterviews().then(
      (list) => {
        setInterviews(list)
        setError(null)
      },
      (err) => setError(errorMessage(err)),
    )
  useEffect(() => {
    void fetchList()
  }, [])

  const remove = async (id: string) => {
    try {
      await api.deleteInterview(id)
      setInterviews((list) => list?.filter((item) => item.id !== id) ?? null)
    } catch (err) {
      setError(`Could not delete: ${errorMessage(err)}`)
    }
  }

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">Practice explaining your project.</h1>
        <p className="text-muted-foreground">An AI interviewer asks spoken follow-ups, then scores you.</p>
        <Button asChild size="lg">
          <Link to="/setup">Start a new interview</Link>
        </Button>
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Past interviews</h2>
        {error && (
          <Alert variant="destructive">
            <AlertDescription className="flex items-center justify-between gap-4">
              {error}
              <Button variant="outline" size="sm" onClick={fetchList}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {!interviews && !error && <p className="text-muted-foreground">Loading…</p>}
        {interviews?.length === 0 && <p className="text-muted-foreground">No interviews yet.</p>}
        {interviews && interviews.length > 0 && <HistoryList items={interviews} onDelete={remove} />}
      </section>
    </div>
  )
}

function HistoryList({ items, onDelete }: { items: InterviewListItem[]; onDelete: (id: string) => void }) {
  const navigate = useNavigate()
  const open = (item: InterviewListItem) => {
    if (hasReport(item)) navigate(`/interviews/${item.id}/report`)
  }

  return (
    <>
      {/* Desktop: table */}
      <table className="hidden w-full text-sm md:table">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 font-medium">Date</th>
            <th className="py-2 font-medium">Role</th>
            <th className="py-2 font-medium">Difficulty</th>
            <th className="py-2 font-medium">Length</th>
            <th className="py-2 font-medium">Result</th>
            <th className="py-2" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              onClick={() => open(item)}
              className={`border-b ${hasReport(item) ? 'cursor-pointer hover:bg-muted/50' : ''}`}
            >
              <td className="py-3">{shortDate(item.createdAt)}</td>
              <td className="py-3">{item.role}</td>
              <td className="py-3">{DIFFICULTY_LABEL[item.difficulty]}</td>
              <td className="py-3">{item.durationMin} min</td>
              <td className="py-3">{resultLabel(item)}</td>
              <td className="py-3 text-right">
                <DeleteButton item={item} onDelete={onDelete} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Phone: cards */}
      <ul className="space-y-3 md:hidden">
        {items.map((item) => (
          <li key={item.id}>
            <Card
              onClick={() => open(item)}
              className={`flex-row items-start justify-between gap-2 p-4 ${hasReport(item) ? 'cursor-pointer' : ''}`}
            >
              <div className="space-y-1">
                <p className="font-medium">{item.role}</p>
                <p className="text-sm text-muted-foreground">
                  {shortDate(item.createdAt)} · {DIFFICULTY_LABEL[item.difficulty]} · {item.durationMin} min
                </p>
                <p className="text-sm">{resultLabel(item)}</p>
              </div>
              <DeleteButton item={item} onDelete={onDelete} />
            </Card>
          </li>
        ))}
      </ul>
    </>
  )
}

function DeleteButton({ item, onDelete }: { item: InterviewListItem; onDelete: (id: string) => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={`Delete ${item.role} interview`}
          onClick={(e) => e.stopPropagation()} // do not open the row
        >
          <X />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent onClick={(e) => e.stopPropagation()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete this interview and its recordings?</AlertDialogTitle>
          <AlertDialogDescription>
            {item.role}, {shortDate(item.createdAt)}. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => onDelete(item.id)}>
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
