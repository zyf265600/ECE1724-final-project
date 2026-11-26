# Design decisions

Short log of decisions that shape the code. Newest last.

## C1: contract and schema (2026-11-15)

The contract lives in `shared/src/` (`domain.ts`, `rest.ts`, `ws.ts`); the schema in `server/prisma/schema.prisma`.

1. **One recording per answer.** When the candidate clicks *Finish answer*, the client sends the whole MediaRecorder recording (`audio/webm;codecs=opus`) as one binary WebSocket frame. The server stores it in S3 as `interviews/{id}/turns/{turnId}.webm`, so playback needs only one object per turn.
   - Boson Higgs STT accepts PCM or Opus frames, not WebM files, so the server decodes the recording to PCM and sends it to STT in pieces of at most 60 seconds (Higgs STT kept only the last ~60 s in our tests).
2. **Interviewer audio is raw PCM.** Boson streaming TTS returns 16-bit, 24 kHz, mono PCM. The server forwards these chunks unchanged as binary frames between `audio.start` and `audio.end`; the client plays them with the Web Audio API. No re-encoding on the server.
3. **The server owns the room state.** It sends `state` (`speaking` / `thinking` / `listening` / `ended`) on connect and on every change. The client opens the microphone only in `listening`, after its own playback has finished.
4. **Enums are written twice, with identical values:** as string unions in `shared/src/domain.ts` and as Prisma enums. The client never imports Prisma types.
5. **No S3 keys leave the server.** `TurnDto` has `hasAudio`; the client asks `GET /api/turns/:id/audio` for a 5-minute presigned URL.
6. **Quotes can be missing.** `Score.quote` and `Score.turnId` are nullable: a quote the LLM returns that is not in the transcript is removed rather than shown.
7. **Deletes cascade in the database.** Deleting an Interview deletes its Turns, Report and Scores; the server deletes the S3 objects first.

## C2: foundations (2026-11-15)

1. **STT runs inside a Realtime session.** Boson has no file-upload transcription endpoint; `higgs-stt-3.1` is only available in Higgs Realtime. `server/src/services/stt.ts` opens a server-side Realtime WebSocket in manual mode (no turn detection, text output, never sends `response.create`), appends the answer as PCM, commits, and waits for `conversation.item.input_audio_transcription.completed`. Answers are committed in pieces of at most 55 s.
2. **ffmpeg decodes the answer.** `ffmpeg-static` ships an ffmpeg binary in `node_modules`, so `npm install` is enough on every platform. It turns the WebM/Opus recording into 24 kHz PCM for STT.
3. **Every external call has a timeout and one retry** (`server/src/services/retry.ts`). Only errors that another try can fix are retried: network errors, timeouts, 429 and 5xx. TTS retries only before its first byte.
4. **Voices:** `FEMALE` is Boson's preset `eleanor`, `MALE` is `oliver` (both calm).
5. **Prisma 7 uses the `pg` driver adapter** (`server/src/db.ts`). The generated client is not committed; `npm install` runs `prisma generate`.
6. **Measured (2026-11-15):** TTS first audio 0.5–0.8 s for one question; STT of a 5 s WebM answer 0.6 s, of a 76 s answer (two pieces) 2.9 s, with nothing lost at the cut.

Open question: *Score again* on the report page needs a way to restart scoring; none of the six REST endpoints does this yet. Decide in stage 2.1. (Decided in C5, decision 5.)

## C3: one voice round (2026-11-17)

1. **S3 is optional for now.** With `S3_BUCKET` empty, an answer is transcribed and saved without its recording (`audioKey` null, so `hasAudio` is false). If an upload fails, the answer is still saved without audio.
2. **The first question is fixed text**, so the interview starts without waiting for the LLM. Follow-ups come from DeepSeek (`deepseek-chat`), one question per call, at most two sentences.
3. **Silence never reaches STT.** Higgs STT invented a full sentence for a silent recording in our test, so the server rejects answers with no sample above about -40 dBFS.
4. **Reconnect resumes.** On connect, a LIVE interview whose last turn is a question goes to `listening`; one whose last turn is an answer (or that has no turns) gets its next question. This is also how the client retries `LLM_FAILED`.
5. **The microphone opens on the Begin click**, together with unlocking audio. It records only in `listening`, after the question has finished playing.
6. **Measured (2026-11-17):** DeepSeek writes a follow-up in about 1 s. From *Finish answer* on a 10 s answer to the next question's caption and first audio: about 2.4 s.

## C4: full interview (2026-11-17)

1. **The time limit is checked between answers.** After each answer the server compares `startedAt + durationMin` with the clock. If time is up, the interviewer says a fixed closing line instead of a new question, and the interview moves to `SCORING`. An answer already in progress is always heard out; the room shows "Time is up. Finish your answer to end the interview."
2. **Unfinished interviews can be resumed from the list of past interviews** (on Home until C7, now below the Setup form). Clicking a `CREATED` or `LIVE` row opens its room; *Resume interview* reconnects and continues (C3 decision 4).

## C5: scoring (2026-11-17)

Code: `server/src/services/scoring.ts`. Review of five reports: [scoring-review.md](scoring-review.md).

1. **One LLM call in JSON mode** returns a summary and, per skill, a score, a comment, a quote and the quote's turn number. The rubric gives each score 1–4 a one-line meaning, so scores are comparable between interviews. Temperature 0.2.
2. **Validation:** exactly one entry per skill, integer score 1–4, non-empty comment and summary. An invalid reply is asked for once more; after that the interview is `FAILED`.
3. **Quotes** follow the rule in the next section (the linked turn must be a CANDIDATE turn of this interview that contains the quote). A dropped quote is logged on the server.
4. **Verdict from the weighted score**, rounded to one decimal as the report shows it: ≥ 3.3 `STRONG_HIRE`, ≥ 2.5 `HIRE`, ≥ 1.8 `NO_HIRE`, otherwise `STRONG_NO_HIRE`. (Before C6 the score kept two decimals, so 2.45 showed as "2.5" next to `NO_HIRE`.) An interview with no answers is not sent to the LLM: every skill gets 1.
5. **Score again** is a seventh endpoint, `POST /api/interviews/:id/report` (202). It works only on `FAILED` interviews, so a finished report is never replaced. The Proposal promises *Score again* for failures; none of the six endpoints could do it.
6. **Scoring starts when the interview ends** (in the room, then `report.ready`), and again at server start for interviews still in `SCORING`.

## C6: report, history, playback (2026-11-17)

1. **The room opens the report by itself** once the closing words have played and scoring is over (`report.ready`, `SCORING_FAILED`, or the socket closed). The report page polls every 3 s while the interview is `SCORING`, so a lost socket only delays it.
2. **One report page for every finished state:** `SCORING` shows "Scoring your answers…", `FAILED` shows *Score again*, `CREATED` / `LIVE` link back to the room.
3. **Markdown is built in the browser** from the loaded interview and report (verdict, scores, comments, quotes, then the transcript). No extra endpoint.
4. ***Play my answer* appears only when the quoted turn has a recording** (`hasAudio`). Until S3 is set up, no turn has one, so the button never shows.
5. **Fixes from a code review of C3–C6:**
   - A room socket has an `error` listener; a bad frame (for example an answer above the size limit) used to crash the server.
   - *End interview* while the interviewer speaks: nothing in flight may leave `ended` again, and the interview is ended (and scored) only once.
   - A room stops working once its socket closes; the next socket's room continues from the saved turns, so the two never save the same turn number.
   - On connect the server resends every saved turn as a caption, so a question saved during a disconnect still appears. A `CREATED` interview gets no `state` on connect (changes C1 decision 3).
   - Quotes must match whole words ("ache" no longer matches inside "cache").
6. **Browsers:** Chrome and Edge. Safari cannot record WebM; its MP4 answer is transcribed correctly but stored under a `.webm` key, so playback may fail there.
7. ***End interview* silences the interviewer at once.** The client stops the queued audio and drops any chunk that still arrives; the server stops streaming speech once the interview is no longer `LIVE`. The closing line after the time limit still plays to the end, because the interview is `LIVE` until it finishes.

## C7: polish (2026-11-23)

1. **Home introduces the product** in five full-screen sections over photos (Unsplash, credited at the bottom); each scroll stops on a section (CSS scroll snapping, home page only), with no other scroll effects. The text describes only working features.
2. **Past interviews moved below the Setup form**, so the app keeps four pages and starting an interview and finding an old report happen in one place.
3. **One dark navy theme.** Colors are CSS variables in `client/src/index.css` (the shadcn/ui tokens plus a small navy scale); pages use the names, not hex values.
4. **Meeting room:** before *Begin* a waiting card replaces the call; the call opens directly, with no countdown or entrance effect. The tile of whoever is speaking gets a static blue outline: the interviewer while their audio plays, the candidate while the microphone records.
5. **Microphone check:** the level bar moves only between *Test microphone* and *Finish test*. It maps loudness in decibels (-50 dB empty, -10 dB full) and is smoothed (it rises a quarter and falls a tenth of the way per frame). Automatic gain control is off for the check, because it evens out loud and quiet speech.
6. **S3 checked end to end (2026-11-23):** `npm run s3:check -w server` passes; in a recorded interview the answer was stored (225 KB WebM), *Play my answer* played it through a presigned URL, and deleting the interview deleted the object (the old URL then returns 403). This replaces C6 decision 4's "until S3 is set up".
7. **A halo follows the speaker's voice (2026-11-25).** Behind the avatar of whoever is speaking, a circle grows (up to 1.6 times the avatar) and brightens with their loudness, as in a video call. The interviewer's level is read from the audio being played, the candidate's from the microphone, on the same decibel scale as the microphone check (`client/src/lib/audioLevel.ts`), smoothed about twice as fast so it moves with each word. The halo is updated once per animation frame without re-rendering React. The outline from decision 4 stays.
8. **The report links back to Setup**, where the next interview starts and past reports are listed.
9. **Claude is the backup LLM (2026-11-25).** Every LLM call (follow-up questions and scoring) goes to DeepSeek first. If DeepSeek fails after its retry, the same call is sent to Claude (`claude-opus-5-5`, official Anthropic SDK) with the same system and user prompts, and DeepSeek is skipped for the next 60 s before it is tried again. Only the call changes: Claude gets a larger `max_tokens` because its thinking counts towards it, low effort for questions, and only the outermost `{...}` of its reply is kept for scoring. Claude is used only when `ANTHROPIC_API_KEY` is set.
10. **LLM health check (2026-11-25).** At start, and with `npm run llm:check -w server`, the server asks DeepSeek and Claude for their model lists, which uses no tokens (`server/src/services/llmHealth.ts`). If DeepSeek fails the check, the first calls go straight to Claude.

## Proposal feedback: quotes must match their turn (2026-11-15)

Feedback received on the proposal:

> DeepDive gives spoken interview practice a clear purpose and ties its report to evidence the candidate can check. Measuring the voice path first, segmenting answers within the 60-second STT limit you observed, and dropping the avatar when it slowed the conversation are good examples of basing design decisions on your own measurements.
>
> Removing quotes that do not appear in the transcript is a useful safeguard. However, a quote can appear in the transcript and still come from the interviewer or from a different answer than the one it links to. In your five planned test reports, checking that each retained quote belongs to the linked candidate turn would help confirm that the text quote and audio playback match.

What we keep: measuring before deciding (C2 measurements above), answer segmentation, no avatar.

What we change: decision 6 only checked that a quote is somewhere in the transcript. If the quote came from the interviewer or from another answer, the quote text and *Play my answer* would not match. The rules below replace decision 6 with a check against the one linked turn.

1. **The LLM names the turn.** The scoring prompt numbers every turn and labels its speaker. For each score the LLM returns `quote` together with the `turnIndex` it was taken from.
2. **The server checks the quote against that one turn.** A quote is kept only if all of these hold; otherwise `quote` and `turnId` are both set to null:
   - the turn belongs to this interview;
   - the turn's speaker is `CANDIDATE`;
   - after normalizing case, whitespace, punctuation and curly quotes, the quote is a substring of that turn's text.
   The server never moves a quote to a different turn.
3. **C5 check.** For each of the five test reports, record per score: the quote, the linked turn index and speaker, whether the quote is in that turn's text, and whether *Play my answer* plays the same words. Every kept quote must pass; dropped quotes are counted.
