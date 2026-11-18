import { Router } from 'express'
import type { InterviewDetail, InterviewListItem } from '@deepdive/shared'
import { prisma } from '../db.ts'
import { toInterviewDto, toReportDto, toTurnDto } from '../dto.ts'
import { HttpError, notFound } from '../http/errors.ts'
import { deleteAudio } from '../services/storage.ts'
import { parseCreateInterview } from '../validation.ts'

export const interviewsRouter = Router()

// POST /api/interviews -> 201 InterviewDto (status CREATED)
interviewsRouter.post('/', async (req, res) => {
  const data = parseCreateInterview(req.body)
  const interview = await prisma.interview.create({ data })
  res.status(201).json(toInterviewDto(interview))
})

// GET /api/interviews -> InterviewListItem[], newest first
interviewsRouter.get('/', async (_req, res) => {
  const rows = await prisma.interview.findMany({
    orderBy: { createdAt: 'desc' },
    include: { report: { select: { overallScore: true, verdict: true } } },
  })
  const body: InterviewListItem[] = rows.map(({ report, ...interview }) => ({
    ...toInterviewDto(interview),
    overallScore: report?.overallScore ?? null,
    verdict: report?.verdict ?? null,
  }))
  res.json(body)
})

// GET /api/interviews/:id -> InterviewDetail (turns in speaking order)
interviewsRouter.get('/:id', async (req, res) => {
  const row = await prisma.interview.findUnique({
    where: { id: req.params.id },
    include: { turns: { orderBy: { index: 'asc' } } },
  })
  if (!row) throw notFound('Interview')
  const { turns, ...interview } = row
  const body: InterviewDetail = { ...toInterviewDto(interview), turns: turns.map(toTurnDto) }
  res.json(body)
})

// GET /api/interviews/:id/report -> ReportDto; 409 until scoring is done
interviewsRouter.get('/:id/report', async (req, res) => {
  const row = await prisma.interview.findUnique({
    where: { id: req.params.id },
    include: { report: { include: { scores: true } } },
  })
  if (!row) throw notFound('Interview')
  if (row.status !== 'DONE' || !row.report) {
    throw new HttpError(409, 'CONFLICT', `Report not ready: interview is ${row.status}`)
  }
  res.json(toReportDto(row.report))
})

// DELETE /api/interviews/:id -> 204. Recordings go first, so a failed S3 call
// leaves the rows in place and the delete can be repeated.
interviewsRouter.delete('/:id', async (req, res) => {
  const row = await prisma.interview.findUnique({
    where: { id: req.params.id },
    include: { turns: { select: { audioKey: true } } },
  })
  if (!row) throw notFound('Interview')
  await deleteAudio(row.turns.flatMap((t) => (t.audioKey ? [t.audioKey] : [])))
  await prisma.interview.delete({ where: { id: row.id } }) // turns, report and scores cascade
  res.status(204).end()
})
