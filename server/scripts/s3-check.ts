// S3 check: upload, download via presigned URL, compare, delete.
//   npm run s3:check -w server
import { randomBytes, randomUUID } from 'node:crypto'
import { audioKey, audioUrl, deleteAudio, putAudio } from '../src/services/storage.ts'

const key = audioKey(`check-${randomUUID()}`, randomUUID())
const body = randomBytes(1024)

await putAudio(key, body)
console.log(`Uploaded:   ${key}`)

const { url, expiresAt } = await audioUrl(key)
const res = await fetch(url)
const downloaded = Buffer.from(await res.arrayBuffer())
if (!res.ok || !downloaded.equals(body)) throw new Error(`Download through presigned URL failed (HTTP ${res.status})`)
console.log(`Downloaded: same ${body.length} bytes through a presigned URL (expires ${expiresAt})`)

await deleteAudio([key])
const after = await fetch((await audioUrl(key)).url)
if (after.ok) throw new Error('Object still exists after delete')
console.log(`Deleted:    object is gone (HTTP ${after.status})`)
console.log('S3 round trip OK')
