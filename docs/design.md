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

Open question: *Score again* on the report page needs a way to restart scoring; none of the six REST endpoints does this yet. Decide in stage 2.1.
