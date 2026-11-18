import { Router } from 'express'
import { prisma } from '../db.ts'
import { notFound } from '../http/errors.ts'
import { audioUrl } from '../services/storage.ts'

export const turnsRouter = Router()

// GET /api/turns/:id/audio -> AudioUrlResponse (presigned URL, valid 5 minutes)
turnsRouter.get('/:id/audio', async (req, res) => {
  const turn = await prisma.turn.findUnique({ where: { id: req.params.id }, select: { audioKey: true } })
  if (!turn?.audioKey) throw notFound('Recording')
  res.json(await audioUrl(turn.audioKey))
})
