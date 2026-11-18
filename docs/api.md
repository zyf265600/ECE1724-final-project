# REST API

Base path `/api`. Request and response bodies are JSON; their TypeScript types are in `shared/src/rest.ts`.
All timestamps are ISO 8601 strings. The meeting room's WebSocket protocol is in `shared/src/ws.ts`.

## Errors

Every 4xx/5xx response has the same body (`ApiError`):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "durationMin must be one of 5, 10, 15" } }
```

| Status | `code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body is not valid JSON, or a field is missing or not allowed |
| 404 | `NOT_FOUND` | Unknown interview, turn, recording or route |
| 409 | `CONFLICT` | Report requested before scoring is done |
| 500 | `INTERNAL` | Anything else (details are logged on the server only) |

## Endpoints

| Method and path | Success | Errors |
|---|---|---|
| `POST /api/interviews` | 201 `InterviewDto` | 400 |
| `GET /api/interviews` | 200 `InterviewListItem[]` | |
| `GET /api/interviews/:id` | 200 `InterviewDetail` | 404 |
| `GET /api/interviews/:id/report` | 200 `ReportDto` | 404, 409 |
| `GET /api/turns/:id/audio` | 200 `AudioUrlResponse` | 404 |
| `DELETE /api/interviews/:id` | 204, no body | 404 |

### POST /api/interviews

Creates an interview with status `CREATED`. The meeting room starts it later over the WebSocket.

| Field | Type | Rule |
|---|---|---|
| `role` | string | 1–100 characters after trimming spaces |
| `difficulty` | `"EASY"` \| `"MEDIUM"` \| `"HARD"` | |
| `durationMin` | `5` \| `10` \| `15` | |
| `voice` | `"MALE"` \| `"FEMALE"` | Interviewer voice |

```bash
curl -X POST localhost:4000/api/interviews -H 'content-type: application/json' \
  -d '{"role":"Backend intern","difficulty":"MEDIUM","durationMin":10,"voice":"FEMALE"}'
```

```json
{
  "id": "e34bbb2c-f638-4b07-a021-f70cffbe0d3e",
  "role": "Backend intern",
  "difficulty": "MEDIUM",
  "durationMin": 10,
  "voice": "FEMALE",
  "status": "CREATED",
  "createdAt": "2026-11-15T06:18:47.876Z",
  "startedAt": null,
  "endedAt": null
}
```

### GET /api/interviews

All interviews, newest first. Each item is an `InterviewDto` plus `overallScore` and `verdict`, which are `null` until the report exists.

```bash
curl localhost:4000/api/interviews
```

### GET /api/interviews/:id

One interview with its `turns` in speaking order (`index` 0, 1, 2, …). A turn has `hasAudio: true` when its recording is stored; the S3 key itself is never returned.

### GET /api/interviews/:id/report

The scored report: `overallScore` (1–4), `verdict`, `summary`, and five `scores` in rubric order (technical depth, trade-offs, results and validation, personal contribution, clarity).
Returns 409 while the interview is not `DONE`, so the report page can poll it.

### GET /api/turns/:id/audio

A presigned URL for one candidate answer, valid for 5 minutes. The browser plays it directly from S3 (`<audio src={url}>`).

```json
{ "url": "https://<bucket>.s3.ca-central-1.amazonaws.com/interviews/…/turns/….webm?X-Amz-…", "expiresAt": "2026-11-15T06:23:47.876Z" }
```

### DELETE /api/interviews/:id

Deletes the interview's recordings from S3 first, then the interview row; its turns, report and scores are deleted with it (cascade). If the S3 call fails, nothing is deleted from the database and the request can be repeated.

## Checking S3

`npm run s3:check -w server` uploads a small object, downloads it through a presigned URL, compares the bytes and deletes it. Run it after filling in the `AWS_*` and `S3_BUCKET` values in `server/.env`.
