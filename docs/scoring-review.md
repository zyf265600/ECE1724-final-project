# C5: scoring review

Five sample interviews scored with the real LLM (DeepSeek), checked by hand for fairness and for quotes.
Reproduce with `npm run score:review -w server` (transcripts in `server/scripts/score-review.ts`; the five reports stay in the database and open in the app).

## Reports

| # | Sample | Overall | Verdict | Fair? |
|---|---|---|---|---|
| 1 | Strong: vector search, numbers, baseline, own work | 3.85 | STRONG_HIRE | Yes. Personal contribution 3, not 4: decisions are stated but their effect is not. |
| 2 | Vague: "we", "it felt fast" | 1.5 | STRONG_NO_HIRE | Yes. Results 2 matches the rubric ("vague claims"). |
| 3 | Deep, but no evaluation | 2.6 | HIRE | Yes. Depth and trade-offs 3, results 1 (no evaluation was set up). |
| 4 | The interviewer states the result, the candidate only agrees | 2.1 | NO_HIRE | Yes. Results 1: the comment says the figure came from the interviewer. |
| 5 | One short answer | 1.3 | STRONG_NO_HIRE | Yes. |

The first run (2026-11-17) found two problems, fixed in the scoring prompt before the run above:
- Sample 4: the summary praised "a concrete improvement in runtime", which only the interviewer had said. New rule: credit only what the candidate said, also in the summary.
- Sample 5: clarity 3 for a single sentence. New rule: one or two short sentences give clarity at most 2.

## Quotes

For every score: the quote, the turn it links to, that turn's speaker, and whether the quote is in that turn's text.

| # | Quotes kept | Linked turn is CANDIDATE | Quote is in the linked turn | Dropped by the server |
|---|---|---|---|---|
| 1 | 5 / 5 | 5 | 5 | 0 |
| 2 | 5 / 5 | 5 | 5 | 0 |
| 3 | 5 / 5 | 5 | 5 | 0 |
| 4 | 5 / 5 | 5 | 5 | 0 |
| 5 | 5 / 5 | 5 | 5 | 0 |

- In sample 4 the tempting quote ("cut the nightly run from six hours to forty minutes") is the interviewer's; the LLM did not use it.
- In sample 5 the same sentence supports all five scores, because it is the only answer.
- *Play my answer* plays the same words: not checked yet. Recordings need S3, which is not set up; the samples are text only.

The server-side check (`checkQuote` in `server/src/services/scoring.ts`) was also tested with quotes the LLM did not produce:

| Case | Result |
|---|---|
| Interviewer's words, linked to the interviewer turn | dropped |
| Interviewer's words, linked to a candidate turn | dropped |
| Candidate's words, linked to a different candidate turn | dropped |
| Candidate's words with different punctuation and curly quotes | kept |
| Turn number not in this interview | dropped |
| No turn number | dropped |
