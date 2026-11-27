# DeepDive

A voice mock-interview room for technical interviews. An AI interviewer asks you to explain a project you built, asks spoken follow-up questions about what you just said, and then scores your answers against a fixed rubric, quoting your own words as evidence.

ECE1724 (Fall 2026) final project, Team 28.

## Team Information

| Name | Student number | Email |
|---|---|---|
| Yifei Zhang | 1007965677 | york.zhang@mail.utoronto.ca |
| Jingwen (Lisa) Zhong | 1008734746 | lisazhong@cs.toronto.edu |
| Xujia Fang | 1013088007 | xujia.fang@mail.utoronto.ca |

## Video Demo

[DeepDive demo video (Google Drive)](https://drive.google.com/file/d/1SdgaWBk-MCM45HffzprrhJ8GWalUvpMr/view?usp=sharing)

## Motivation

The hardest technical-interview questions are follow-ups about the candidate's own project: *Why did you design it this way? How do you know it works? Which part did you build yourself?* They depend on what the candidate just said, so no list of questions prepares for them.

Realistic practice is hard to get:

- **Nobody asks follow-ups when you practise alone.** Friends do not know the project, and a mock interview with an experienced engineer costs from US$179 ([interviewing.io](https://interviewing.io/faq)).
- **Speaking while observed is its own skill.** In a randomized study, students' performance dropped by more than half when an interviewer watched them (Behroozi et al., "Does Stress Impact Technical Interview Performance?", ESEC/FSE 2020). Typing into a chatbot does not train this.
- **Feedback is vague.** Candidates rarely learn *which* answer lacked depth or evidence.

Our users are students and early-career engineers preparing for internship and new-graduate interviews, where "walk me through a project on your résumé" is a standard question. General voice assistants can hold a conversation, but they have to be prompted each time and give no comparable score; tools with human interviewers are too expensive to repeat.

## Objectives

1. **A focused interview room:** one AI interviewer, by voice, with live captions, that asks follow-ups about the candidate's own project at a chosen difficulty.
2. **Feedback with evidence:** every session is scored against the same rubric, and every score quotes the candidate's own words and plays back the recorded answer, so weak points are concrete and sessions are comparable.
3. **A complete full-stack application** that meets the course requirements: React + TypeScript frontend, Express backend, PostgreSQL, cloud storage, and two advanced features (real-time communication and external API integration).

Explicitly out of scope: an avatar, several interviewers, automatic end-of-speech detection and interruptions, languages other than English, and user accounts (one deployment serves one user).

## Technical Stack and Architecture

We chose **Option B: a React frontend and a separate Express backend**. The meeting room keeps one WebSocket open for the whole interview, streaming audio both ways, and a standalone Express process holds that connection naturally. It also keeps every API key on the server.

![DeepDive architecture: React client, Express server, PostgreSQL, S3, Boson Higgs and the LLM](docs/images/architecture.png)

Only the server talks to the database and the AI services and holds the S3 credentials; the browser reaches a recording only through a 5-minute presigned URL that the server signs.

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router, Tailwind CSS v4, shadcn/ui; `useReducer` state machine for the meeting room; Web Audio API for playback and level meters |
| Backend | Node.js 22, Express 5, `ws` WebSocket library on the same HTTP server, TypeScript |
| Shared contract | `shared/`: domain enums, REST request/response types and WebSocket message types, imported by both client and server |
| Database | PostgreSQL 16 with Prisma 7 (`pg` driver adapter); schema and migrations in `server/prisma/` |
| Cloud storage | Amazon S3, private bucket, presigned URLs for playback |
| External APIs | Boson AI Higgs: streaming text-to-speech (TTS) and speech-to-text (STT); DeepSeek (`deepseek-chat`) for questions and scoring; Claude (`claude-opus-5-5`, Anthropic SDK) as the backup LLM |
| Testing and CI | Vitest, Supertest; GitHub Actions runs lint, type-check and tests on every pull request |

### Database schema

Four tables (`server/prisma/schema.prisma`):

| Table | Key fields | Relationship |
|---|---|---|
| Interview | role, difficulty (EASY / MEDIUM / HARD), durationMin, voice (MALE / FEMALE), status (CREATED → LIVE → SCORING → DONE / FAILED) | has many Turns and at most one Report |
| Turn | index, speaker (INTERVIEWER / CANDIDATE), text, audioKey | belongs to an Interview |
| Report | overallScore, verdict, summary | one per Interview; has five Scores |
| Score | skill, score (1–4), comment, quote | belongs to a Report; points to the Turn it quotes |

Each turn is saved the moment it happens, so a dropped connection loses at most the answer in progress, and a reload resumes the interview. Each skill score is its own row rather than part of a JSON blob, so a score can point to the Turn it quotes with a foreign key, and *Play my answer* follows that link to the recording. Deleting an interview cascades to its turns, report and scores.

### Cloud storage

The server uploads each answer to a private S3 bucket at `interviews/{interviewId}/turns/{turnId}.webm` and stores only the key in `Turn.audioKey`. The client never sees keys: the REST API reports `hasAudio`, and **Play my answer** calls `GET /api/turns/:id/audio`, which returns a presigned URL valid for 5 minutes. Deleting an interview deletes its S3 objects first, then the database rows.

### REST API

Documented in [docs/api.md](docs/api.md):

| Method and path | Purpose |
|---|---|
| `POST /api/interviews` | Create an interview from the Setup form |
| `GET /api/interviews` | List past interviews with their overall scores |
| `GET /api/interviews/:id` | One interview with its transcript |
| `GET /api/interviews/:id/report` | The report with its five scores |
| `POST /api/interviews/:id/report` | *Score again* after scoring failed |
| `GET /api/turns/:id/audio` | Presigned URL for one recorded answer |
| `DELETE /api/interviews/:id` | Delete an interview, its recordings and its report |

Request bodies are validated on the server; errors use one JSON shape with a code and a message.

### Key design decisions

All design decisions are listed in [docs/design.md](docs/design.md).

| Decision | Alternative we rejected | Why |
|---|---|---|
| One WebSocket for the meeting room; REST for every other page | Server-Sent Events or polling | Server-Sent Events only push from server to browser, so answer audio would need separate uploads; polling adds a delay to every turn. Keeping the other pages on REST means only the room depends on the socket. |
| Separate Express server (Option B) | Next.js full-stack | Next.js Route Handlers cannot hold a WebSocket open, so the room would need a custom server anyway. The `shared/` package still gives both sides one set of types. |
| A *Finish answer* button ends each answer | Automatic end-of-speech detection | Candidates pause to think in the middle of technical answers; automatic detection would cut them off. The cost is one click per answer. |
| The whole recording is sent once, when the answer ends | Streaming microphone audio during the answer | One file per answer gives one S3 object per turn and simple playback. Long answers are split for STT: a 76-second answer was transcribed in 2.9 s with nothing lost at the cut. The cost is that transcription starts only after *Finish answer* (about 1.1 s for a 10-second answer). |
| Interviewer audio is forwarded as raw PCM | Re-encoding to MP3 or Opus on the server | No encoding delay: the first audio of a question arrives in 0.5–0.8 s, and the browser plays PCM directly with the Web Audio API. |
| The opening question is fixed text | Letting the LLM write it | The interview starts without waiting about 1 s for the LLM, and every session opens the same way. |
| The server computes the overall score and the verdict | Asking the LLM for an overall verdict | Equal skill scores always give the same verdict: ≥ 3.3 Strong hire, ≥ 2.5 Hire, ≥ 1.8 No hire, otherwise Strong no hire. |
| A quote is checked only against the turn the LLM names | Searching the whole transcript for the quote | A quote found elsewhere may be the interviewer's words or another answer, and *Play my answer* would then play a recording that does not contain it. We added this check after the feedback on our proposal pointed out the problem. |
| Scores are stored as rows | One JSON column per report | Each score can point to the Turn it quotes, and the report reads scores with an ordinary query; the cost is one more table. |
| S3 keys never leave the server | Public object URLs | The bucket stays private; each playback gets a URL valid for 5 minutes. We checked this end to end: we uploaded a recording, played it through a presigned URL, deleted the interview, and the same URL then returned 403. |

## Features

### 1. Setup

Choose a role, difficulty, length (3, 5 or 10 minutes) and interviewer voice; every field has a default (the role starts as "Software engineer intern"), so *Test microphone* and *Start interview* are the only two clicks needed. A microphone check shows a live level bar, and *Start interview* is enabled once the microphone works; starting the interview ends the check, so no extra click is needed. *Start interview* creates the Interview over REST and opens its room. Past interviews are listed below the form with their scores, so starting a new interview and finding an old report happen in one place.

*Course requirements:* React + TypeScript, shadcn/ui form components, a database write through Express and Prisma.

### 2. Meeting room (advanced feature: real-time)

The room looks like a video call: an interviewer tile and a candidate tile, a timer, and live captions. A halo behind the speaker's avatar grows with their voice level.

One interview turn over the WebSocket:

1. The candidate clicks **Finish answer**; the browser sends the whole recording (WebM/Opus) as one binary frame.
2. The server stores it in S3, decodes it with ffmpeg and transcribes it with Higgs STT (in pieces of at most 55 seconds, because the STT session keeps only about the last 60 seconds of audio).
3. The server saves the candidate Turn and sends its caption.
4. The LLM writes the next follow-up question from the transcript at the chosen difficulty; the server saves it and sends its caption.
5. Higgs TTS streams the question as PCM audio; the server forwards the chunks and the browser plays them with the Web Audio API.
6. The server sends `state: listening`, and the microphone opens again.

The server owns the room state (`speaking` / `thinking` / `listening` / `ended`), so the client cannot record while the interviewer is talking. A button ends each answer instead of automatic end-of-speech detection, so the interviewer never cuts into a thinking pause. The time limit is checked between answers: an answer in progress is always heard out, then the interviewer says a closing line, and the room shows the scoring message only after that line has finished playing.

Measured: about **2.4 seconds** from *Finish answer* (10-second answer) to the first audio of the next question (STT about 1.1 s, LLM about 1 s, first TTS audio about 0.3 s).

### 3. AI scoring with checked quotes (advanced feature: external APIs)

When the interview ends, the transcript and the rubric go to the LLM in one JSON-mode call. Five skills are scored from 1 to 4:

| Skill | Weight |
|---|---|
| Technical depth | 25% |
| Trade-offs | 25% |
| Results and validation | 20% |
| Personal contribution | 15% |
| Clarity | 15% |

- **Validation:** exactly one entry per skill, integer scores 1–4, non-empty comments. An invalid reply is requested once more; after that the interview is FAILED and the report offers *Score again*.
- **The server computes the weighted score and the verdict**, not the LLM, so equal scores always give the same verdict.
- **Quote check:** LLMs can invent quotes, and a real quote can still come from the interviewer or from a different answer. The prompt numbers every turn and labels its speaker, and the LLM returns the turn number for each quote. The server keeps a quote only if that turn belongs to this interview, was spoken by the candidate, and contains the quoted words (after normalizing case and punctuation, whole words only). Otherwise the quote and its link are removed, never moved to another turn, so *Play my answer* always plays the quoted words.
- **Reviewed by hand:** five sample interviews scored 3.9 (strong answers with numbers), 2.8 (deep but no evaluation), 2.3 (only agreeing with the interviewer's numbers), 1.5 (vague) and 1.5 (one short answer), and every kept quote matched its candidate turn ([docs/scoring-review.md](docs/scoring-review.md)).

Every external call has a timeout and one retry for errors another try can fix (network errors, timeouts, 429 and 5xx). If DeepSeek still fails, the same call goes to Claude with the same prompts, and DeepSeek is skipped for the next 60 seconds. A health check at server start (and `npm run llm:check -w server`) asks both providers for their model lists, which uses no tokens.

### 4. Report

The report shows the verdict, the overall score and a summary, then for each skill: score, comment, the candidate's quote and **Play my answer**. The whole report and transcript can be downloaded as Markdown. While scoring is still running the page shows progress and checks again every 3 seconds; a failed scoring shows *Score again*.

### 5. Responsive design

Layouts are built with Tailwind breakpoints: on a phone the Setup form is one column, the meeting tiles stack, and the room controls stay pinned to the bottom of the screen.

### 6. Reliability and edge cases

A voice interview fails in ways a form does not: connections drop mid-answer, external services time out, and users click twice. These cases are handled explicitly:

- **Reload or dropped connection.** On every connect the server resends each saved turn as a caption and puts the room back in the right state: waiting for an answer if the last turn is a question, or writing the next question if the last turn is an answer. Opening the same interview in a second tab closes the first tab's connection, and the server stops saving turns from a closed connection, so two tabs can never save the same turn twice.
- **Ending the interview.** *End interview* stops the queued interviewer audio at once and drops any chunk still arriving; the server stops streaming speech once the interview is no longer live. Ending twice, or ending while a question is being written, ends and scores the interview only once.
- **Silent answers.** In our tests Higgs STT invented a full sentence for a silent recording, so the server rejects an answer with no sample louder than about −40 dBFS before it reaches STT.
- **Oversized answers.** An answer above 10 MB gets a clear error; a frame far above the limit closes the socket instead of crashing the server.
- **Storage failure.** If the S3 upload fails, the answer is still transcribed and saved, without a recording, and the report hides *Play my answer* for that turn.
- **External APIs.** Timeouts and one retry, as above; TTS is retried only before its first audio byte, so a question is never partly spoken twice. If writing the next question fails, the room shows an error with a **Retry** button; Retry reconnects, and because the last saved turn is an answer, the server writes the missing question.
- **Scoring.** An invalid LLM reply is requested once more, then the interview is FAILED and *Score again* is offered. *Score again* (`POST /api/interviews/:id/report`) works only on FAILED interviews, so a finished report is never replaced. Interviews left in SCORING by a server restart are scored again when the server starts. An interview with no answers is not sent to the LLM; every skill gets 1.

## User Guide

1. **Home.** Open <http://localhost:5173>. The home page introduces DeepDive; click **Start a new interview**.
   ![Home page](docs/images/home.png)
2. **Setup.** Enter the role (for example "Backend engineer intern"), pick difficulty, length and voice. Click **Test microphone**, speak, and check that the bar moves. Click **Start interview** (this also ends the microphone test).
   ![Setup page](docs/images/setup.png)
3. **Meeting room.** Click **Begin** and allow the microphone. The interviewer asks you to introduce a project. When the tile says it is your turn, answer out loud, then click **Finish answer**. Captions show both sides. Click **End interview** to stop early; otherwise the interview ends when the time is up.
   ![Meeting room](docs/images/room.png)
4. **Report.** The report opens by itself when scoring is done. Click **Play my answer** under a quote to hear that answer, or **Download Markdown** to keep the report. **Back to setup** returns to the Setup page.
   ![Report page](docs/images/report.png)
5. **Past interviews.** Below the Setup form, click an interview to open its report, or to resume it if it was not finished. The delete button removes the interview, its recordings and its report.

Use Chrome or Edge: the room records WebM audio, which Safari does not support.

## Development Guide

### Requirements

- Node.js 22 or newer
- PostgreSQL 16 or newer, running locally
- Chrome or Edge
- Keys: Boson AI, DeepSeek, an AWS IAM user with access to one S3 bucket; optional Anthropic key for the backup LLM

**Credentials sent to TA.** The API keys and AWS credentials are not in the repository. They were emailed to the TA in an encrypted archive, with the password in a separate email; the setup steps below say where each value goes.

### Environment setup

```bash
git clone https://github.com/zyf265600/ECE1724-final-project.git
cd ECE1724-final-project
npm install                          # client, server and shared; also generates the Prisma client and installs ffmpeg
cp server/.env.example server/.env   # then fill in the values below
```

Every value except `PORT` and `DATABASE_URL` is in the credentials sent to the TA.

| Variable | Meaning |
|---|---|
| `PORT` | Server port, default 4000 |
| `DATABASE_URL` | Your local PostgreSQL connection, e.g. `postgresql://postgres:postgres@localhost:5432/deepdive`; with a Homebrew install, use your macOS username and no password: `postgresql://<username>@localhost:5432/deepdive` |
| `BOSON_API_KEY` | Boson AI key for Higgs TTS and STT |
| `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `S3_BUCKET` | S3 bucket for recordings |
| `DEEPSEEK_API_KEY` | DeepSeek key for questions and scoring |
| `ANTHROPIC_API_KEY` | Optional: Claude answers when DeepSeek is down |

### Database initialization

```bash
createdb deepdive                    # the database named in DATABASE_URL
npm run db:migrate -w server         # applies the migrations in server/prisma/migrations
```

### Cloud storage configuration

With the credentials sent to the TA, copy the four AWS values into `server/.env` and run step 4. To use your own bucket instead, follow all four steps.

1. Create a private S3 bucket (block all public access, ACLs disabled).
2. Create an IAM user whose policy allows only `s3:PutObject`, `s3:GetObject` and `s3:DeleteObject` on `arn:aws:s3:::<bucket>/*`.
3. Put its access key, the bucket name and the region in `server/.env`.
4. Check it: `npm run s3:check -w server` uploads, downloads and deletes a test object.

Without `S3_BUCKET` the app still runs, but answers are saved without recordings and the report has no *Play my answer*.

### Local development and testing

```bash
npm run dev          # server on port 4000 and client on port 5173
```

Open <http://localhost:5173>. Vite forwards `/api` and `/ws` to the server.

| Command | What it does |
|---|---|
| `npm test` | Vitest tests for server and client. API tests use the database in `DATABASE_URL` and delete what they create; the LLM, S3 and Boson are mocked |
| `npm run typecheck` | Type-check server and client |
| `npm run lint -w client` | Lint the client |
| `npm run build` | Production build of the client |
| `npm run llm:check -w server` | Check that DeepSeek and Claude accept their keys |
| `npm run tts -w server -- "Some question?"` | Speak a sentence with Higgs TTS and print the time to first audio |
| `npm run stt -w server -- answer.webm` | Transcribe an audio file with Higgs STT |
| `npm run score:review -w server` | Score five sample transcripts and print every quote with its turn |

Design decisions are recorded in [docs/design.md](docs/design.md). The GitHub Actions workflow (`.github/workflows/ci.yml`) starts a PostgreSQL service, applies the migrations, and runs lint, type-check and tests; `main` accepts changes only through pull requests that pass it.

## Deployment Information

Not deployed. The application runs locally as described in the Development Guide.

## AI Assistance & Verification (Summary)

Example prompts and AI responses are recorded in [ai-session.md](ai-session.md).

- **Where AI contributed:** AI helped compare architecture options (Next.js versus React + Express, and WebSocket versus Server-Sent Events), interpret the Boson Higgs documentation to plan speech-to-text (STT) and text-to-speech (TTS) integration, draft WebSocket room-management code and scoring prompts, review code, and refine technical documentation.
- **A representative mistake:** The AI-drafted scoring review script included each sample's expected label (e.g., "vague") in the role field sent to the LLM. This exposed the expected result to the model and compromised the evaluation. We discovered the leakage while reviewing the first run, removed the labels from what the LLM sees, and reran all five reports. The corrected evaluation then revealed a separate attribution error: the LLM credited the candidate with an outcome stated only by the interviewer. Our quote validator did not catch this because it checks quoted evidence, not claims in the generated summary. We added an explicit attribution rule to the scoring prompt and confirmed that the observed error was corrected on rerun.
- **How we verified:** We measured TTS time to first audio, STT performance on longer answers, and end-to-end latency to inform design decisions. We manually reviewed five scored interviews, checking every quotation against the original utterance in the corresponding turn, and ran automated tests in CI. We also tested the S3 workflow end to end: uploading audio, playing it through a presigned URL, and confirming that the same URL returned HTTP 403 after deletion.

## Individual Contributions

| Member | GitHub | Main contributions |
|---|---|---|
| **Yifei Zhang** | `zyf265600` | Architecture and the shared contract (`shared/`: domain enums, REST and WebSocket types); Prisma schema and migrations; Express app and error handling; Higgs TTS and STT services with retry; follow-up question generation; WebSocket room (voice loop, room state, time limit, reconnect, ending the interview after the closing line); interview lengths; scoring with rubric validation and quote checks; fixes from code review; frontend redesign (navy theme, product home page, past interviews on Setup, waiting card, speaking outline, microphone check, voice halo, report link back to Setup); design log (`docs/design.md`) |
| **Jingwen (Lisa) Zhong** | `lisazhong13` (commit author name `zhongjingwen`) | Wireframes and page states; client setup with Tailwind CSS and shadcn/ui; API client and page layout; Setup form with microphone check; interview history with delete and resume; meeting room page, connection and recorder hooks, streaming PCM player; opening the report when scoring finishes; scoring review script and the review of five reports (`docs/scoring-review.md`); slides and video |
| **Xujia Fang** | `miura-tutu` | S3 storage service and S3 check script; REST routes for interviews and turns; *Score again* endpoint; report page with Markdown download and report API calls; Claude backup LLM and LLM health check; automated tests (server and client) and GitHub Actions CI; REST API reference (`docs/api.md`) and README |

The commit history on `main` matches this split: each member committed on their own branch and merged through pull requests reviewed by another member.

## Known Limitations

- **Browsers:** Chrome and Edge only. Safari cannot record WebM; its MP4 answers are transcribed correctly but stored under a `.webm` key, so playback may fail there.
- **Latency:** each turn takes about 2.4 s after *Finish answer*, mostly STT (about 1.1 s) and the LLM (about 1 s). Streaming the answer during recording would hide the STT time but complicate storage and segmentation.
- **Time limit:** the limit is checked between answers, so an interview can run over by up to one answer.
- **Scoring evidence:** the hand review covers five sample interviews. It found the scores fair, but one score was generous (personal contribution 3 for a single sentence), and it is not a calibration study.

## Lessons Learned and Concluding Remarks

- **Measure before deciding.** Measurements shaped the design: a talking-head avatar we tested (Boson's Higgs Avatar API) needed 4–6 s before the first frame of each new question appeared, so we dropped it, streaming TTS speaks in under a second, and Higgs STT's 60-second limit and its invented text for silence led to split answers and a silence check.
- **Agree the contract first.** With every REST body and WebSocket message in `shared/`, three people built the room UI, the REST routes and the voice loop in parallel, and a changed field failed the type-check instead of failing at runtime.
- **Check LLM output, and check the checks.** Validation, server-computed verdicts and the per-turn quote check make the report trustworthy, but our own review script leaked the sample labels to the LLM; only after fixing it did the hand review find two prompt problems that no code check catches.
- **Test in the browser.** A level bar that barely moved, an interviewer who kept talking after *End interview*, and a cut-off closing line all passed type-check and tests; we found them only by using the app.

DeepDive now runs a full voice interview end to end, from setup to a scored report whose quotes play back the candidate's own recording. Next time we would add automated tests and CI earlier; we set them up only in the polishing stage.

### Future work

The options we cut, and the limitations above, give the next steps:

- **A lifelike interviewer:** a talking face lip-synced to the voice, so practice feels like a real video call. This needs an avatar service that renders the first frame in well under a second; the one we tested took 4–6 s.
- **Personalized interviews:** upload a résumé and a job description, so questions target the candidate's own projects and the role they are applying for.
- **A second interviewer:** a behavioral and a technical interviewer taking turns, each with their own voice.
- **Lower delay per turn:** stream the answer to STT while the candidate speaks, so the transcript is ready when they click *Finish answer*, and keep one recording per answer for playback.
- **Progress over time:** show how each skill's score changes across a candidate's past interviews, and suggest which skill to practise next.
- **Accounts and deployment:** user accounts, so one deployment can serve many candidates, plus a public deployment; Safari support by storing each recording with its real format.
