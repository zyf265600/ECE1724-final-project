# Test checklist

Manual end-to-end checks, run before each merge into `main`.
Automated tests (`npm test`, also run by CI on every pull request) cover what does not need a microphone: request validation, the REST endpoints against PostgreSQL, the quote check, weighted score and verdict, scoring retries with a mocked LLM, the switch to Claude when DeepSeek fails, and the Markdown report.
Setup: `npm run dev`, then open <http://localhost:5173> in Chrome and allow the microphone.

## Home and Setup

- [ ] Home: each scroll stops on the next section; *See how it works* jumps to the second section; *Start a new interview* opens Setup.
- [ ] Setup: the level bar stays still until *Test microphone*, then follows the voice; *Finish test* stops it.
- [ ] Setup: *Start interview* stays disabled until *Test microphone* shows "Working".
- [ ] Setup: *Start interview* saves the interview and opens its room.
- [ ] Setup, Past interviews: the new interview is listed as "Unfinished"; clicking it opens its room.
- [ ] Setup, Past interviews: ✕ asks for confirmation, then removes the row.

## Meeting room

- [ ] *Begin*: the first question is spoken and shown in the captions.
- [ ] While the interviewer speaks, the interviewer tile has a blue outline; on your turn, your tile has it.
- [ ] The halo behind the speaker's avatar grows and shrinks with their voice, and disappears when they are silent or it is not their turn.
- [ ] After the question finishes, the status shows "Your turn" and the recording time counts up.
- [ ] *Finish answer*: the answer appears in the captions, then a follow-up question about it is spoken.
- [ ] A silent answer shows "No speech was heard…" and the recording starts again.
- [ ] Reloading the page shows *Resume interview*; it continues with the same captions.
- [ ] *End interview* asks for confirmation, then shows "Interview finished. Scoring your answers…".
- [ ] *End interview* while the interviewer is speaking: the voice stops at once, the room does not go back to "Your turn", and the report opens.
- [ ] When the time is up, the next answer ends the interview with the closing line.
- [ ] Phone width: tiles side by side, captions scroll, control bar pinned to the bottom.

## Scoring

- [ ] After *End interview* (or the closing line), the interview is scored within a few seconds: `GET /api/interviews/:id/report` returns 200.
- [ ] Ending before any answer still gives a report (every skill 1).
- [ ] `POST /api/interviews/:id/report` returns 409 for a `DONE` interview and 404 for an unknown id.
- [ ] `npm run score:review -w server`: every kept quote is in the turn it links to, and that turn is the candidate's (see `docs/scoring-review.md`).

## Report and past interviews

- [ ] After the interview, the room opens the report by itself: verdict, overall score, summary, five skills with comments and quotes.
- [ ] While scoring, the report page shows "Scoring your answers…" and updates by itself.
- [ ] *Download Markdown* saves a `.md` file with the scores, quotes and transcript.
- [ ] A failed interview shows *Score again*; clicking it ends in the report.
- [ ] *Back to setup* above the report opens the Setup page.
- [ ] `/interviews/<unknown id>/report` shows "Interview not found."
- [ ] Setup, Past interviews: a finished interview shows its score and verdict; clicking it opens the report.
- [ ] `npm run s3:check -w server` ends with "S3 round trip OK".
- [ ] *Play my answer*: plays the same words as the quote next to it.
- [ ] Deleting an interview also deletes its recordings: an old *Play my answer* link then returns 403.
