# Test checklist

Manual end-to-end checks, run before each merge into `main`. Automated tests are added later.
Setup: `npm run dev`, then open <http://localhost:5173> in Chrome and allow the microphone.

## Setup and Home

- [ ] Setup: *Start interview* stays disabled until *Test microphone* shows "Working".
- [ ] Setup: *Start interview* saves the interview and opens its room.
- [ ] Home: the new interview is listed as "Unfinished"; clicking it opens its room.
- [ ] Home: ✕ asks for confirmation, then removes the row.

## Meeting room

- [ ] *Begin*: the first question is spoken and shown in the captions.
- [ ] After the question finishes, the status shows "Your turn" and the recording time counts up.
- [ ] *Finish answer*: the answer appears in the captions, then a follow-up question about it is spoken.
- [ ] A silent answer shows "No speech was heard…" and the recording starts again.
- [ ] Reloading the page shows *Resume interview*; it continues with the same captions.
- [ ] *End interview* asks for confirmation, then shows "Interview finished. Scoring your answers…".
- [ ] *End interview* while the interviewer is speaking: the room does not go back to "Your turn"; the report opens.
- [ ] When the time is up, the next answer ends the interview with the closing line.
- [ ] Phone width: tiles side by side, captions scroll, control bar pinned to the bottom.

## Scoring

- [ ] After *End interview* (or the closing line), the interview is scored within a few seconds: `GET /api/interviews/:id/report` returns 200.
- [ ] Ending before any answer still gives a report (every skill 1).
- [ ] `POST /api/interviews/:id/report` returns 409 for a `DONE` interview and 404 for an unknown id.
- [ ] `npm run score:review -w server`: every kept quote is in the turn it links to, and that turn is the candidate's (see `docs/scoring-review.md`).

## Report and history

- [ ] After the interview, the room opens the report by itself: verdict, overall score, summary, five skills with comments and quotes.
- [ ] While scoring, the report page shows "Scoring your answers…" and updates by itself.
- [ ] *Download Markdown* saves a `.md` file with the scores, quotes and transcript.
- [ ] A failed interview shows *Score again*; clicking it ends in the report.
- [ ] `/interviews/<unknown id>/report` shows "Interview not found."
- [ ] Home: a finished interview shows its score and verdict; clicking it opens the report.
- [ ] *Play my answer* (needs S3): plays the same words as the quote next to it.
