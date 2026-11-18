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

Requirements: Node.js 22 or newer, and PostgreSQL 16 or newer running locally.

```bash
npm install                            # installs client, server and shared; generates the Prisma client
cp server/.env.example server/.env     # then fill in the values
createdb deepdive                      # empty database named in DATABASE_URL
npm run db:migrate -w server           # creates the tables
npm run dev                            # starts server (port 4000) and client (port 5173)
```

Open <http://localhost:5173>. The page should show "Server status: ok".
In development, Vite forwards `/api` and `/ws` requests to the server, so the client always calls relative paths such as `/api/health`.

Other commands:

- `npm run typecheck`: type-check server and client
- `npm run build`: production build of the client
- `npm run lint -w client`: lint the client
- `npm run db:migrate -w server`: apply schema changes to the database (after editing `server/prisma/schema.prisma`)
- `npm run tts -w server -- "Some question?"`: speak a sentence with Higgs TTS, save it as a WAV file, and print the time to first audio
- `npm run stt -w server -- answer.webm`: transcribe an audio file with Higgs STT

## Workflow

- `main`: protected, stable, demo-ready code. Changes reach `main` only through pull requests, after CI passes and another member reviews.
- Each member works on their own branch and opens pull requests into `main`. After each merge, update your branch from the latest `main`.
- Commit messages: `feat: ...`, `fix: ...`, `docs: ...`, `chore: ...`.
- Never commit `.env` files or API keys.
