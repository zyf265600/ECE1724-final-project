import request from 'supertest'
import { afterAll, describe, expect, it } from 'vitest'
import { createApp } from '../src/app.ts'
import { prisma } from '../src/db.ts'

// Runs against the database in DATABASE_URL (in CI, an empty PostgreSQL).
// Every interview created here is deleted in afterAll.
const app = createApp()
const created: string[] = []
const body = { role: 'Backend engineer', difficulty: 'MEDIUM', durationMin: 10, voice: 'FEMALE' }

async function createInterview(): Promise<string> {
  const res = await request(app).post('/api/interviews').send(body).expect(201)
  created.push(res.body.id)
  return res.body.id
}

afterAll(async () => {
  await prisma.interview.deleteMany({ where: { id: { in: created } } })
  await prisma.$disconnect()
})

describe('REST API', () => {
  it('GET /api/health answers ok', async () => {
    const res = await request(app).get('/api/health').expect(200)
    expect(res.body.status).toBe('ok')
  })

  it('POST /api/interviews saves a CREATED interview', async () => {
    const res = await request(app).post('/api/interviews').send(body).expect(201)
    created.push(res.body.id)
    expect(res.body).toMatchObject({ ...body, status: 'CREATED', startedAt: null })
  })

  it('POST /api/interviews rejects an invalid body', async () => {
    const res = await request(app)
      .post('/api/interviews')
      .send({ ...body, durationMin: 7 })
      .expect(400)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('GET /api/interviews lists the interview, and GET /api/interviews/:id returns it', async () => {
    const id = await createInterview()
    const list = await request(app).get('/api/interviews').expect(200)
    expect(list.body.find((item: { id: string }) => item.id === id)).toMatchObject({ overallScore: null, verdict: null })

    const detail = await request(app).get(`/api/interviews/${id}`).expect(200)
    expect(detail.body).toMatchObject({ id, turns: [] })
  })

  it('GET .../report is 409 until scoring is done, then returns the scores in rubric order', async () => {
    const id = await createInterview()
    await request(app).get(`/api/interviews/${id}/report`).expect(409)

    await prisma.interview.update({ where: { id }, data: { status: 'DONE' } })
    await prisma.report.create({
      data: {
        interviewId: id,
        overallScore: 2.5,
        verdict: 'HIRE',
        summary: 'Test summary.',
        scores: {
          create: [
            { skill: 'CLARITY', score: 3, comment: 'c' },
            { skill: 'TECHNICAL_DEPTH', score: 2, comment: 't' },
          ],
        },
      },
    })
    const res = await request(app).get(`/api/interviews/${id}/report`).expect(200)
    expect(res.body).toMatchObject({ overallScore: 2.5, verdict: 'HIRE' })
    expect(res.body.scores.map((s: { skill: string }) => s.skill)).toEqual(['TECHNICAL_DEPTH', 'CLARITY'])
  })

  it('POST .../report (Score again) is 409 unless scoring failed', async () => {
    const id = await createInterview()
    const res = await request(app).post(`/api/interviews/${id}/report`).expect(409)
    expect(res.body.error.code).toBe('CONFLICT')
  })

  it('DELETE /api/interviews/:id removes the interview', async () => {
    const id = await createInterview()
    await request(app).delete(`/api/interviews/${id}`).expect(204)
    await request(app).get(`/api/interviews/${id}`).expect(404)
  })

  it('unknown ids and paths are 404 with the error shape', async () => {
    const missing = '00000000-0000-0000-0000-000000000000'
    expect((await request(app).get(`/api/interviews/${missing}`).expect(404)).body.error.code).toBe('NOT_FOUND')
    await request(app).get(`/api/turns/${missing}/audio`).expect(404)
    await request(app).get('/api/nothing-here').expect(404)
  })
})
