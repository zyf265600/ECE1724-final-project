// Answer recordings in a private S3 bucket; the database stores only the key.
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { ANSWER_MIME_TYPE, type AudioUrlResponse } from '@deepdive/shared'
import { requireEnv } from '../env.ts'

const URL_TTL_SECONDS = 5 * 60

// Created on first use, so the server runs before S3 is set up.
let client: S3Client | null = null
function s3(): S3Client {
  requireEnv('AWS_REGION')
  client ??= new S3Client({})
  return client
}

const bucket = () => requireEnv('S3_BUCKET')

// Without S3, answers are saved without recordings.
export function storageConfigured(): boolean {
  return Boolean(process.env.S3_BUCKET && process.env.AWS_REGION)
}

export function audioKey(interviewId: string, turnId: string): string {
  return `interviews/${interviewId}/turns/${turnId}.webm`
}

export async function putAudio(key: string, body: Buffer): Promise<void> {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: ANSWER_MIME_TYPE }))
}

export async function audioUrl(key: string): Promise<AudioUrlResponse> {
  const url = await getSignedUrl(s3(), new GetObjectCommand({ Bucket: bucket(), Key: key }), {
    expiresIn: URL_TTL_SECONDS,
  })
  return { url, expiresAt: new Date(Date.now() + URL_TTL_SECONDS * 1000).toISOString() }
}

// Deletes the given objects in one request (S3 accepts up to 1000 keys).
export async function deleteAudio(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const result = await s3().send(
    new DeleteObjectsCommand({
      Bucket: bucket(),
      Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
    }),
  )
  if (result.Errors?.length) {
    throw new Error(`S3 could not delete ${result.Errors.length} object(s): ${result.Errors[0]?.Message}`)
  }
}
