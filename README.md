# DeepDive

ECE1724 final project, Team 28. Proposal: [docs/Team28_Final_Project_Proposal.md](docs/Team28_Final_Project_Proposal.md).

## Repository layout

| Folder | What it holds |
|---|---|
| `client/` | React + Vite + TypeScript frontend |
| `server/` | Express 5 + TypeScript backend |
| `shared/` | TypeScript types used by both client and server (the API contract) |
| `docs/` | Proposal and other project documents |

## Development guide

Requirements: Node.js 22 or newer, PostgreSQL 16 or newer running locally, and Chrome or Edge (the meeting room records WebM audio).

```bash
npm install                            # installs client, server and shared; generates the Prisma client
cp server/.env.example server/.env     # then fill in BOSON_API_KEY, DEEPSEEK_API_KEY and the S3 settings
createdb deepdive                      # empty database named in DATABASE_URL
npm run db:migrate -w server           # creates the tables
npm run dev                            # starts server (port 4000) and client (port 5173)
```

Open <http://localhost:5173>: the Home page introduces the app, and *Start a new interview* opens the Setup page, which also lists past interviews.
*Start interview* on the Setup page opens the meeting room; *Begin* starts the voice interview (allow the microphone when the browser asks).
When the interview ends, the answers are scored and the report opens; *Play my answer* replays the quoted answer from S3. Past reports are listed on the Setup page.
In development, Vite forwards `/api` and `/ws` requests to the server, so the client always calls relative paths such as `/api/health`.

Other commands:

- `npm run typecheck`: type-check server and client
- `npm test`: run the automated tests (Vitest). The server tests need the database in `DATABASE_URL`; they delete what they create. DeepSeek is mocked, so no API key is needed
- `npm run build`: production build of the client
- `npm run lint -w client`: lint the client
- `npm run db:migrate -w server`: apply schema changes to the database (after editing `server/prisma/schema.prisma`)
- `npm run tts -w server -- "Some question?"`: speak a sentence with Higgs TTS, save it as a WAV file, and print the time to first audio
- `npm run stt -w server -- answer.webm`: transcribe an audio file with Higgs STT
- `npm run s3:check -w server`: upload, download and delete a test object in the S3 bucket
- `npm run llm:check -w server`: check that DeepSeek and the Claude backup (optional `ANTHROPIC_API_KEY`) accept their keys
- `npm run score:review -w server`: score five sample transcripts and print every quote with the turn it links to

The REST API is documented in [docs/api.md](docs/api.md). CI (`.github/workflows/ci.yml`) runs lint, type-check and the tests on every pull request.

## Workflow

- `main`: protected, stable, demo-ready code. Changes reach `main` only through pull requests, after CI passes and another member reviews.
- Each member works on their own branch and opens pull requests into `main`. After each merge, update your branch from the latest `main`.
- Commit messages: `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`.
- Never commit `.env` files or API keys.
