# Design decisions

Each entry names the question, what we chose, and why.

## Architecture and contract

1. **How do the client and server agree on data shapes?**
   - **Decision:** one `shared/` package (`domain.ts`, `rest.ts`, `ws.ts`) with every REST body and WebSocket message, imported by both sides; enums are repeated with the same values as Prisma enums.
   - **Instead of:** separate type definitions on each side, or importing Prisma types in the client.
   - **Why:** a changed message shape fails the type-check on whichever side is out of date, and the client stays independent of the database.
2. **How does the meeting room talk to the server?**
   - **Decision:** one WebSocket per interview, used only in the meeting room; every other page uses REST.
   - **Instead of:** one HTTP request per turn, polling, or Server-Sent Events.
   - **Why:** the room needs two-way traffic (answers up; captions, state and interviewer audio down) without a delay per turn; Server-Sent Events only go from server to browser. Keeping other pages on REST means only the room depends on the socket.
3. **Who decides when the candidate may speak?**
   - **Decision:** the server owns the room state (`speaking`, `thinking`, `listening`, `ended`) and sends it on every change; the client records only in `listening`, after the question has finished playing.
   - **Instead of:** the client tracking the turn order itself.
   - **Why:** one source of truth survives reconnects and second tabs, and the candidate never records over the interviewer. A second tab closes the older socket (close code 4000).
4. **Who may access the database, S3 and the external APIs?**
   - **Decision:** only the server; the browser gets recordings through `GET /api/turns/:id/audio`, which returns a presigned URL valid for 5 minutes.
   - **Instead of:** public S3 URLs or client-side API calls.
   - **Why:** keys and credentials stay in `server/.env`, the bucket stays private, and S3 keys never leave the server (`TurnDto` only has `hasAudio`).
5. **How is a failed scoring run retried?**
   - **Decision:** a seventh endpoint, `POST /api/interviews/:id/report` (202), which works only on `FAILED` interviews.
   - **Instead of:** reusing one of the six planned endpoints, none of which can restart scoring.
   - **Why:** the report page needs a *Score again* button, and limiting it to `FAILED` means a finished report is never replaced.

## Voice loop

1. **How does the browser send an answer?**
   - **Decision:** record the whole answer with `MediaRecorder` (`audio/webm;codecs=opus`) and send it as one binary frame (at most 10 MB) when the candidate clicks *Finish answer*.
   - **Instead of:** streaming microphone audio while the candidate speaks.
   - **Why:** one file per answer is one S3 object (`interviews/{id}/turns/{turnId}.webm`) that plays back as is. The cost is that transcription starts only after the answer ends (about 1.1 s for a 10 s answer).
2. **How does an answer get transcribed?**
   - **Decision:** decode the recording to 24 kHz PCM with ffmpeg (`ffmpeg-static`), then send it to Higgs STT in a Realtime session in manual mode, in pieces of at most 55 s.
   - **Instead of:** sending the WebM file directly, or the whole answer as one piece.
   - **Why:** Higgs STT is only available in a Realtime session, takes PCM rather than WebM, and keeps only about the last 60 s of a commit.
3. **What happens to a silent answer?**
   - **Decision:** the server rejects answers with no sample above about -40 dBFS and asks the candidate to answer again.
   - **Instead of:** sending every recording to STT.
   - **Why:** Higgs STT invents a sentence for silent audio, which would enter the transcript as a fake answer.
4. **How is the interviewer's voice delivered?**
   - **Decision:** forward Boson's streamed TTS chunks (16-bit, 24 kHz, mono PCM) unchanged; the client plays each chunk as it arrives with the Web Audio API.
   - **Instead of:** waiting for the full audio file, or re-encoding to MP3 or Opus on the server.
   - **Why:** speech starts before the whole question is generated (first audio in 0.5–0.8 s), with no encoding delay.
5. **Where does the first question come from?**
   - **Decision:** a fixed opening question; follow-ups come from DeepSeek, one question of at most two sentences per call, based on the transcript and the chosen difficulty.
   - **Instead of:** letting the LLM write the opening question too.
   - **Why:** the interview starts at once instead of waiting about 1 s, and every session opens the same way.
6. **How does an answer end?**
   - **Decision:** the candidate clicks *Finish answer*; the interviewer never interrupts.
   - **Instead of:** automatic end-of-speech detection.
   - **Why:** candidates pause to think in the middle of technical answers, and automatic detection would cut them off. The cost is one click per answer.
7. **What happens when time runs out?**
   - **Decision:** the time limit (3, 5 or 10 minutes) is checked between answers; when it has passed, the interviewer says a fixed closing line and the interview moves to `SCORING`.
   - **Instead of:** stopping the candidate mid-answer.
   - **Why:** an answer in progress is always heard out; the room shows "Time is up. Finish your answer to end the interview."
8. **What does *End interview* do while the interviewer is speaking?**
   - **Decision:** the client stops the queued audio and drops later chunks; the server stops streaming once the interview is no longer `LIVE`.
   - **Instead of:** letting the current question finish playing.
   - **Why:** the candidate asked to stop, so the room goes quiet at once. Clicking it again, or during the closing line, still ends and scores the interview only once.
9. **What happens after a dropped connection?**
   - **Decision:** every turn is saved as it happens; on reconnect the server resends the saved turns as captions and continues (`listening` if the last turn is a question, otherwise the next question).
   - **Instead of:** keeping the interview only in memory, or restarting it.
   - **Why:** a dropped connection loses at most the answer in progress, and the same path also retries a failed follow-up question.

## Scoring

1. **How is an interview scored?**
   - **Decision:** one LLM call in JSON mode (temperature 0.2) over the numbered, speaker-labelled transcript; the reply has a summary and, per skill, a score 1–4, a comment, a quote and the quote's turn number.
   - **Instead of:** one call per skill, or free-text feedback.
   - **Why:** one fixed rubric, with a one-line meaning for each score level, keeps scores comparable between interviews; JSON can be validated.
2. **What if the LLM's reply is invalid?**
   - **Decision:** require exactly one entry per skill, integer scores 1–4, and a non-empty comment and summary; ask once more, then mark the interview `FAILED`.
   - **Instead of:** saving whatever the LLM returns.
   - **Why:** a report with missing or out-of-range scores is worse than a clear failure with *Score again*.
3. **When is a quote trusted?**
   - **Decision:** keep a quote only if its linked turn belongs to this interview, the speaker is `CANDIDATE`, and the normalized quote (case, spaces, punctuation, curly quotes) appears in that turn's text as whole words; otherwise `quote` and `turnId` are null.
   - **Instead of:** searching the whole transcript for the quote.
   - **Why:** a quote found elsewhere may be the interviewer's words or another answer, and *Play my answer* would then play a recording that does not contain it. A quote is never moved to another turn.
4. **Who computes the overall score and the verdict?**
   - **Decision:** the server: weighted average (technical depth 25%, trade-offs 25%, results and validation 20%, personal contribution 15%, clarity 15%), rounded to one decimal; ≥ 3.3 Strong hire, ≥ 2.5 Hire, ≥ 1.8 No hire, otherwise Strong no hire.
   - **Instead of:** asking the LLM for an overall verdict.
   - **Why:** equal skill scores always give the same verdict, and the verdict always matches the number shown. An interview with no answers is not sent to the LLM; every skill gets 1.
5. **What earns credit?**
   - **Decision:** only what the candidate said, in the scores and in the summary; one or two short sentences get clarity at most 2.
   - **Instead of:** scoring the conversation as a whole.
   - **Why:** a result stated by the interviewer and merely confirmed by the candidate is not the candidate's evidence. Five sample interviews were reviewed by hand: [scoring-review.md](scoring-review.md).
6. **When does scoring run?**
   - **Decision:** in the background when the interview ends; the room waits for `report.ready`, and the report page polls every 3 s if the socket is gone. Interviews left in `SCORING` are scored again at server start.
   - **Instead of:** scoring inside the request that ends the interview.
   - **Why:** scoring takes several seconds; a restart or a closed tab must not leave an interview unscored. Only one scoring run per interview is active.
7. **What if DeepSeek is down?**
   - **Decision:** send the same prompts to Claude, and skip DeepSeek for the next 60 s; only when `ANTHROPIC_API_KEY` is set. `npm run llm:check -w server` checks both keys without using tokens.
   - **Instead of:** failing the turn or the scoring run.
   - **Why:** an outage of one provider should not stop an interview, and the 60 s pause avoids waiting for DeepSeek's timeout on every call.

## Storage and reliability

1. **What if S3 is not configured or an upload fails?**
   - **Decision:** transcribe and save the answer anyway, without its recording; `hasAudio` is false and the report hides *Play my answer* for that turn.
   - **Instead of:** failing the answer.
   - **Why:** losing a recording is better than losing the answer, and the app runs without S3.
2. **In what order is an interview deleted?**
   - **Decision:** delete the S3 objects first, then the interview row; turns, report and scores cascade.
   - **Instead of:** deleting the rows first.
   - **Why:** if the S3 call fails, the rows stay and the delete can be repeated, so no recording is left without an owner. Old playback URLs return 403 afterwards.
3. **How are external calls protected?**
   - **Decision:** every call to Boson and the LLM has a timeout and one retry, only for errors another try can fix (network errors, timeouts, 429, 5xx); TTS retries only before its first byte.
   - **Instead of:** no retries, or retrying every error.
   - **Why:** an invalid key or no credit fails at once with a clear error, and a half-played question is never restarted from the beginning.
4. **Which browsers are supported?**
   - **Decision:** Chrome and Edge.
   - **Instead of:** also supporting Safari.
   - **Why:** the room records WebM/Opus; Safari records MP4, which is transcribed correctly but stored under a `.webm` key, so playback may fail there.

## Frontend

1. **How are the pages organized?**
   - **Decision:** four pages: Home (product introduction), Setup (form, microphone check, past interviews), Meeting Room and Report.
   - **Instead of:** a separate History page.
   - **Why:** starting an interview and finding an old report happen in one place.
2. **How is the meeting-room state managed?**
   - **Decision:** one `useReducer` in `client/src/hooks/useRoom.ts`; other pages use local `useState`.
   - **Instead of:** Redux Toolkit.
   - **Why:** the complex state (connection, room state, captions, playback, errors, report ready) exists only in the room, so a global store adds setup without removing code.
3. **How is the style kept consistent?**
   - **Decision:** one navy theme from CSS variables in `client/src/index.css` (the shadcn/ui tokens plus a small navy scale); responsive layout with one column and fixed main buttons on phones.
   - **Instead of:** colors written as hex values in each page.
   - **Why:** one change to a variable restyles every page.
4. **How does the Home page scroll?**
   - **Decision:** five full-screen sections with CSS scroll snapping, and no other scroll effects.
   - **Instead of:** scroll animations.
   - **Why:** each scroll lands on one complete section, with no extra code to maintain.
5. **How does the room show who is speaking?**
   - **Decision:** a blue outline on the speaker's tile, and a halo behind the avatar that grows with their loudness (up to 1.6 times the avatar), updated every frame without a React render.
   - **Instead of:** an animated avatar.
   - **Why:** the interview has no avatar, and the cues are cheap to render while audio plays.
6. **How does the microphone check measure loudness?**
   - **Decision:** a decibel scale (-50 dB empty, -10 dB full) with smoothing, and automatic gain control turned off for the check; the bar moves only between *Test microphone* and *Finish test*, and *Start interview* also ends the test.
   - **Instead of:** raw amplitude.
   - **Why:** on a raw amplitude scale normal speech barely moves the bar, and automatic gain control evens out loud and quiet speech. Recorded answers are unaffected.
7. **How is a report exported?**
   - **Decision:** the report downloads as Markdown built in the browser from the data already loaded.
   - **Instead of:** an export endpoint.
   - **Why:** the page already has every field it needs, so no extra server code is required.

## Measurements

- TTS first audio: 0.5–0.8 s per question.
- STT: 0.6 s for a 5 s answer; 2.9 s for a 76 s answer sent in two pieces, with nothing lost at the cut.
- DeepSeek writes a follow-up in about 1 s; from *Finish answer* to the next question's first audio takes about 2.4 s.
