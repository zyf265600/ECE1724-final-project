# DeepDive: A Voice Mock-Interview Room for Technical Questions

- Yifei Zhang · 1007965677 · york.zhang@mail.utoronto.ca
- Jingwen (Lisa) Zhong · 1008734746 · lisazhong@cs.toronto.edu
- Xujia Fang · 1013088007 · xujia.fang@mail.utoronto.ca

## 1. Motivation

### 1.1 Problem

The hardest technical-interview questions are follow-ups about the candidate's own project: *why this design? how do you know it works? which part did you build?* They depend on what the candidate just said, so no question list prepares for them. Realistic practice is rare:

- **Nobody asks follow-ups** when practising alone; friends do not know the project; mock interviews with experienced engineers start at US$179 each [1].
- **Speaking while observed is its own skill.** In a randomized study, students' performance dropped by more than half when an interviewer watched [2]; typing into a chat does not train this.
- **Feedback is vague.** Candidates rarely learn *which* answers lacked depth or evidence.

### 1.2 Target users

Students and early-career engineers facing internship and new-graduate technical interviews, e.g., university students, who are often asked to walk through a résumé project during a short hiring season.

### 1.3 Existing products

| Product | Strength | Gap for our users |
|---|---|---|
| interviewing.io [1] | Human interviewers; realistic follow-ups | From US$179 per interview; too costly to repeat |
| Yoodli [3] | AI role-plays with follow-up questions | Now aimed at enterprise sales training and onboarding |
| Gemini Live [4] | Free voice conversation; suggested by Google for interview practice | Must be prompted each time; no fixed rubric, so sessions are not comparable |

### 1.4 The gap

Our users lack a focused mock interview room where an AI interviewer asks **spoken follow-ups about the candidate's own project**, and every session is **scored against one fixed rubric with the candidate's own words as evidence**, so weak points become concrete and comparable.

## 2. Objectives, Architecture, and Key Features

### 2.1 Core functionality

1. **Virtual meeting room:** one AI interviewer asks the candidate to introduce a project, then asks spoken follow-ups that a large language model (LLM) writes from the transcript at the chosen difficulty, with live captions.
2. **Scored feedback:** after the interview, an LLM scores five skills; each score cites a quote and links to the recorded answer. The feedback can be downloaded as a Markdown file.
3. **History:** past interviews with overall scores.

### 2.2 Architecture: React + Express (Option B)

#### 2.2.1 Why Option B

- **Course fit:** A1–A3 built this exact stack.
- **Long-lived connection:** a 5–15-minute interview keeps one WebSocket open, streaming audio both ways; a standalone Express process holds it.
- **Separation:** a written contract lets frontend and backend owners work in parallel (§3); API keys stay server-side; the API is testable with `curl` first.

#### 2.2.2 Alternatives considered

| Alternative | What it offers | Why we did not choose it |
|---|---|---|
| Next.js full-stack | One codebase; Server Actions replace hand-written REST code | Our core page is a client-side meeting room, and Route Handlers cannot hold a WebSocket, so we would need a custom server anyway |
| Browser calls AI APIs directly | One fewer hop | Keys must reach the browser, and a closed tab could lose turns the report needs |
| Polling or Server-Sent Events | Plain HTTP, simpler | Polling delays every turn; Server-Sent Events only push downward, so answer audio needs separate uploads |

### 2.3 Components

```
┌────────────────────────────────────────────┐
│                React client                │
│    Home · Setup · Meeting Room · Report    │
│     records answers with MediaRecorder     │
└───────────┬────────────────────┬───────────┘
            │ REST               │ WebSocket
            │ (all pages)        │ (meeting room only)
            ▼                    ▼
┌───────────┴────────────────────┴───────────┐
│                Express API                 │
│      REST routes · WebSocket handler       │
│      speech · LLM · storage services       │
└──────┬──────────────┬──────────────┬───────┘
       │ Prisma       │ AWS SDK      │ HTTPS
       ▼              ▼              ▼
  PostgreSQL      Amazon S3    Boson STT/TTS
                                 + LLM API
```

Only the server talks to the database, S3 and the AI services: speech-to-text (STT), text-to-speech (TTS) and the LLM.

### 2.4 Database design (PostgreSQL + Prisma)

#### 2.4.1 Entities and relationships

| Entity | Key fields | Relationship |
|---|---|---|
| Interview | role, difficulty, durationMin, voice (MALE / FEMALE), status (CREATED → LIVE → SCORING → DONE / FAILED) | has many Turns, one Report |
| Turn | index, speaker (INTERVIEWER / CANDIDATE), text, audioKey | belongs to Interview |
| Report | overallScore, verdict, summary | one per Interview; has five Scores |
| Score | skill, score (1–4), comment, quote | belongs to Report; points to the quoted Turn |

#### 2.4.2 Data access

Each Turn is saved **as it happens**, so a dropped connection loses at most one answer. Scores are rows rather than one JSON blob, so history can query them, at the cost of one table.

### 2.5 Cloud storage (Amazon S3)

The server uploads each answer's audio to a **private** bucket at `interviews/{id}/turns/{turnId}.webm`, storing only the key in `Turn.audioKey`. **Play my answer** calls `GET /api/turns/:id/audio`, which returns a 5-minute **presigned URL**. Deleting an interview removes its objects, then its rows.

### 2.6 Data flows

#### 2.6.1 REST API

Documented in `docs/api.md`: `POST /api/interviews`, `GET /api/interviews`, `GET /api/interviews/:id`, `GET /api/interviews/:id/report`, `GET /api/turns/:id/audio`, `DELETE /api/interviews/:id`.

#### 2.6.2 Interview turn (WebSocket)

**Finish answer** → binary audio → server stores it in S3, runs STT, saves the Turn, sends its caption → LLM writes the next question → server saves it, sends caption and streamed TTS audio → `state: listening` reopens the microphone.

#### 2.6.3 Scoring

Transcript and rubric go to the LLM → response validated → Report and Scores saved → `report.ready` → report page loads via REST.

### 2.7 UI/UX

#### 2.7.1 Pages and interaction

- **Setup in two clicks:** defaults for role, difficulty, length and voice; microphone check.
- **Meeting room like a video call:** interviewer tile with a speaking ring, timer, captions. The microphone opens only on the candidate's turn, with the state shown (*speaking / thinking / your turn*), so the interviewer never cuts into a thinking pause.
- **Evidence-based report:** a verdict, then per skill: score, comment, the candidate's words, **Play my answer**. Failures show **Retry** or **Score again**, never silence.

#### 2.7.2 Scoring rubric

Each skill 1–4: technical depth 25%, trade-offs 25%, results and validation 20%, personal contribution 15%, clarity 15%. The **server**, not the LLM, computes the weighted score and verdict, so equal scores give equal verdicts.

### 2.8 Course technologies

- **TypeScript** everywhere, with `shared/` REST and WebSocket types used by both sides.
- **React** Router pages; a `useReducer` state machine for the meeting room.
- **Tailwind CSS + shadcn/ui** styling; **responsive** layouts: one column on phones, stacked meeting tiles, controls pinned to the bottom.
- **Express** middleware as in A1, plus the `ws` WebSocket library on the same server; **PostgreSQL + Prisma** (§2.4); **S3** (§2.5).

### 2.9 Advanced features

We chose the two features the product cannot exist without.

#### 2.9.1 Real-time functionality

Over one WebSocket, answer audio goes up; captions, state changes and streamed interviewer audio come down. Everything is saved via Prisma, so no other page depends on the socket.

#### 2.9.2 External API integration

Boson AI Higgs STT and TTS [5] for speech; an LLM API (DeepSeek) for questions and scoring. Each call has a timeout and retry; scoring JSON is validated, and **any quote not found in the transcript is removed**, since LLMs can invent quotes.

### 2.10 Scope, feasibility and risks

#### 2.10.1 Options we excluded

| Excluded option | Why | Instead |
|---|---|---|
| Talking-head avatar | 10–25 s to render each new question (§4.2.3) | Portrait, speaking indicator |
| Several interviewers | More turn-taking logic | One interviewer |
| Automatic turn detection, interruptions | Can cut in on thinking pauses | **Finish answer** button |
| Multiple languages | Multiplies prompts and testing | English only |
| User accounts | Not needed for the core loop | One user per deployment |
| Redux Toolkit | Complex state lives in one page | `useReducer` |

#### 2.10.2 Feasibility and risks

Scope is focused (four pages, four tables, six endpoints, one socket); the challenge is the real-time voice loop and trustworthy scoring. The voice loop is measured first.

- **Delay after each answer:** streamed TTS (~1 s to first audio in our tests), short prompts, a visible "thinking" state.
- **Long answers:** Higgs STT kept only the last ~60 s of audio in our tests, so answers are sent in ≤60-second segments.
- **API cost and invalid scores:** a spending cap, short test interviews, validation and **Score again**.

## 3. Project Plan and Team Responsibilities

### 3.1 Ownership

- **Yifei Zhang, architecture and AI pipeline:** contract, database schema, WebSocket turn loop (STT → LLM → TTS), scoring prompts and validation, integration. Starts with the contract and turn loop.
- **Jingwen (Lisa) Zhong, frontend:** meeting-room UI (recording, playback, captions), Report and History pages (shadcn/ui, responsive); wireframes, slides and video demo.
- **Xujia Fang, backend:** REST endpoints (Prisma), S3 storage and playback links; `docs/api.md`, test checklist, meeting notes, README and `ai-session.md`.

### 3.2 Development stages

| Phase | Stage (dates) | Checkpoint |
|---|---|---|
| **1. Meeting room** | 1.1 Design: flow, wireframes, contract, schema (Nov 2–8) | C1: contract agreed; proposal submitted |
| | 1.2 Foundations: Express + Prisma, React shell, S3, TTS/STT scripts (Nov 9–11) | C2: interview saved from UI; S3 round trip; TTS plays |
| | 1.3 Live loop: WebSocket, recording, STT → LLM → TTS (Nov 12–15) | C3: one spoken turn |
| | 1.4 Complete room: timer, closing, errors (Nov 16–17) | C4: full interview end to end |
| **2. Feedback** | 2.1 Scoring: prompt, validation, tables (Nov 18–20) | C5: five test reports reviewed for fairness |
| | 2.2 Report, history, playback (Nov 21–24; A4 due Nov 22) | C6: feature complete |
| | 2.3 Hardening: responsive, browsers, slides (Nov 25–26) | C7: slides submitted; demo tagged |
| | 2.4 Final: fixes, README, video (Nov 27 – Dec 6) | C8: presentation; submission |

### 3.3 Integration and coordination

- **Contract first:** `shared/` types are fixed at C1; changes need a pull request (PR) reviewed by Yifei.
- **No waiting:** the room uses a mock server, report pages use sample data, and endpoints are tested with `curl`, before the live loop works.
- **GitHub:** protected `main`, short-lived branches, each PR reviewed by another member.
- **Weekly rhythm:** Monday progress meeting; Sunday merge check (full flow, tagged build); decisions logged in `docs/design.md`.

### 3.4 Dependencies and risks

Scoring needs transcripts (C4); playback needs S3 (C2). If an area slips, Yifei joins it and its lowest-priority item moves to stage 2.4. If the live loop misses C4, the demo falls back to typed answers while voice is finished.

## 4. Initial Team Reasoning and AI-Assisted Exploration

### 4.1 Initial team reasoning

#### 4.1.1 Origin

About two years ago, one of us wanted to build a mock-interview app, but a convincing spoken interviewer was impractical. Better LLMs and fast STT and TTS models have since made it feasible.

#### 4.1.2 Problem framing

Candidates cannot practise follow-ups about their own project aloud and get no concrete feedback. A solution must ask answer-dependent questions by voice in a call-like setting and tie feedback to specific answers.

#### 4.1.3 Initial technical hypotheses

(1) An LLM between STT and TTS suffices for a believable interviewer; (2) a talking-head avatar would add immersion; (3) one LLM call with a fixed rubric gives consistent scores.

#### 4.1.4 Open questions

Is the delay per answer acceptable? Can an avatar keep up live? Can LLM quotes be trusted? How simple can the live loop be while still feeling like a real interview?

### 4.2 Exploration and evaluation

#### 4.2.1 Team discussion

Text-only input is simpler, but typing does not match a real interview, where candidates think aloud while watched [2]. Voice in a virtual meeting room stayed core.

#### 4.2.2 Documentation and experiment

Lectures and A1–A3 gave the Express + Prisma + React structure; Boson and LLM API documentation defined the server's calls. Boson TTS began speaking about one second after a streamed request, supporting hypothesis 1.

#### 4.2.3 AI example 1: avatar (rejected)

An AI assistant proposed voice plus a talking-head avatar (our hypothesis 2). We tested Boson AI's Higgs Avatar API: a full clip for a new question took 10–25 seconds and streaming needed 4–6 seconds for the first frame. A 10-second pause destroys the immersion the avatar was meant to add, so we chose a portrait with a speaking indicator.

#### 4.2.4 AI example 2: WebSocket (accepted)

We planned one HTTP request per turn; the AI suggested WebSocket. We verified the reasoning: per-turn requests cannot stream interviewer audio, Server-Sent Events cannot carry audio upward, and Boson's own realtime API uses WebSocket. We accepted it but **limited it to the meeting room**.

## References

1. interviewing.io FAQ: <https://interviewing.io/faq>
2. Behroozi et al., "Does Stress Impact Technical Interview Performance?", ESEC/FSE 2020: <https://2020.esec-fse.org/details/fse-2020-papers/140/Does-Stress-Impact-Technical-Interview-Performance->
3. Yoodli: <https://yoodli.ai/>
4. Grow with Google, interview preparation: <https://grow.google/interview-warmup/>
5. Boson AI documentation: <https://docs.boson.ai/overview>
