# C5: scoring review

Five sample interviews scored with DeepSeek and reviewed by hand for fairness and quotes.
Reproduce: `npm run score:review -w server` (transcripts in `server/scripts/score-review.ts`). Sample labels are printed only, never sent to the LLM. The reports stay in the database.

## Reports

| # | Sample | Overall | Verdict | Fair? |
|---|---|---|---|---|
| 1 | Strong: vector search, numbers, baseline, own work | 3.9 | STRONG_HIRE | Yes. Personal contribution 3, not 4: decisions are stated but their effect is not. |
| 2 | Vague: "we", "it felt fast" | 1.5 | STRONG_NO_HIRE | Yes. Results 2 matches the rubric ("vague claims"). |
| 3 | Deep, but no evaluation | 2.8 | HIRE | Yes. Depth and trade-offs 3, results 2 ("it worked better, I think"). |
| 4 | The interviewer states the result, the candidate only agrees | 2.3 | NO_HIRE | Yes. The summary asks for "results you measured yourself rather than confirming the interviewer's numbers". |
| 5 | One short answer | 1.5 | STRONG_NO_HIRE | Mostly. Personal contribution 3 for "I made a to-do list app" is generous: the rubric's 3 asks for a clear own part, and the sentence is clear but says nothing more. |

Fixed after an earlier run:

- Sample 4: the summary praised "a concrete improvement in runtime", which only the interviewer said. Rule added: credit only what the candidate said, also in the summary.
- Sample 5: clarity 3 for one sentence. Rule added: one or two short sentences get clarity at most 2.
- The script sent the sample label in the role ("Review 2 (vague) …"), so the LLM saw the expected result. The role is now plain.

## Quotes, per score

"In that turn" is checked by the script itself (text match, then ignoring punctuation), independent of the server's check. These interviews were typed, so playback is checked below.

### Sample 1: strong, Backend engineer intern

| Skill | Score | Quote | Turn | Speaker | In that turn |
|---|---|---|---|---|---|
| TECHNICAL_DEPTH | 4 | I designed and wrote a vector search service in Go that stores product embeddings in an HNSW index, and I owned it from design to rollout. | 1 | CANDIDATE | yes |
| TRADE_OFFS | 4 | IVF needed about a third of the memory, but to reach 95 percent recall it had to probe so many lists that p95 latency went over 40 milliseconds. | 3 | CANDIDATE | yes |
| RESULTS_VALIDATION | 4 | I computed exact nearest neighbors with brute force on a sample of 5,000 real queries and counted how many of the top ten results HNSW returned. | 5 | CANDIDATE | yes |
| PERSONAL_CONTRIBUTION | 3 | I designed and wrote a vector search service in Go that stores product embeddings in an HNSW index, and I owned it from design to rollout. | 1 | CANDIDATE | yes |
| CLARITY | 4 | The baseline for latency was the old SQL search, measured with the same replayed query log. | 5 | CANDIDATE | yes |

### Sample 2: vague, Frontend developer intern

| Skill | Score | Quote | Turn | Speaker | In that turn |
|---|---|---|---|---|---|
| TECHNICAL_DEPTH | 1 | We made a web app for our club. It was in React. It worked pretty well and people liked it. | 1 | CANDIDATE | yes |
| TRADE_OFFS | 1 | We used a lot of libraries and it was fast. | 3 | CANDIDATE | yes |
| RESULTS_VALIDATION | 2 | It just felt fast when we used it. Nobody complained. | 5 | CANDIDATE | yes |
| PERSONAL_CONTRIBUTION | 2 | We all worked on everything together, so it is hard to say. | 3 | CANDIDATE | yes |
| CLARITY | 2 | We all worked on everything together, so it is hard to say. We used a lot of libraries and it was fast. | 3 | CANDIDATE | yes |

### Sample 3: deep but no results, Machine learning intern

| Skill | Score | Quote | Turn | Speaker | In that turn |
|---|---|---|---|---|---|
| TECHNICAL_DEPTH | 3 | used LoRA adapters on the attention layers so only about one percent of the weights were trained, and handled class imbalance with a weighted loss | 1 | CANDIDATE | yes |
| TRADE_OFFS | 3 | Full fine-tuning did not fit on our single 24 gigabyte GPU, and LoRA let us keep one base model and swap adapters per customer. | 3 | CANDIDATE | yes |
| RESULTS_VALIDATION | 2 | It worked better than before, I think. We did not really set up a proper evaluation before I left, but the team said the routing looked good. | 5 | CANDIDATE | yes |
| PERSONAL_CONTRIBUTION | 3 | I wrote the training loop in PyTorch, used LoRA adapters on the attention layers | 1 | CANDIDATE | yes |
| CLARITY | 3 | I fine-tuned a small language model to classify support tickets into twelve categories. | 1 | CANDIDATE | yes |

### Sample 4: interviewer states the result, Data engineer intern

| Skill | Score | Quote | Turn | Speaker | In that turn |
|---|---|---|---|---|---|
| TECHNICAL_DEPTH | 2 | I worked on a nightly data pipeline that loads sales data into the warehouse. I rewrote the slowest step to use Spark instead of a single Python script. | 1 | CANDIDATE | yes |
| TRADE_OFFS | 2 | I rewrote the slowest step to use Spark instead of a single Python script. | 1 | CANDIDATE | yes |
| RESULTS_VALIDATION | 2 | Yes, that is right, it was much quicker after that. | 3 | CANDIDATE | yes |
| PERSONAL_CONTRIBUTION | 3 | I wrote the join and the deduplication step and tested them on one week of data. | 5 | CANDIDATE | yes |
| CLARITY | 3 | I wrote the join and the deduplication step and tested them on one week of data. | 5 | CANDIDATE | yes |

### Sample 5: one short answer, Software engineer intern

| Skill | Score | Quote | Turn | Speaker | In that turn |
|---|---|---|---|---|---|
| TECHNICAL_DEPTH | 1 | I made a to-do list app for a course project. | 1 | CANDIDATE | yes |
| TRADE_OFFS | 1 | I made a to-do list app for a course project. | 1 | CANDIDATE | yes |
| RESULTS_VALIDATION | 1 | I made a to-do list app for a course project. | 1 | CANDIDATE | yes |
| PERSONAL_CONTRIBUTION | 3 | I made a to-do list app for a course project. | 1 | CANDIDATE | yes |
| CLARITY | 2 | I made a to-do list app for a course project. | 1 | CANDIDATE | yes |

Result: 25 of 25 quotes kept, each in its linked CANDIDATE turn. None dropped; sample 4 does not quote the interviewer.

## Playback

Checked with one recorded interview: all four kept quotes link to the candidate turn, and *Play my answer* plays that turn's recording (13.9 s), the audio the quote was transcribed from.

## The server's quote check

`checkQuote` (`server/src/services/scoring.ts`), tested with constructed quotes:

| Case | Result |
|---|---|
| Interviewer's words, linked to the interviewer turn | dropped |
| Interviewer's words, linked to a candidate turn | dropped |
| Candidate's words, linked to a different candidate turn | dropped |
| Candidate's words with different punctuation and curly quotes | kept |
| Turn number not in this interview | dropped |
| No turn number | dropped |
| Part of a word ("ache" inside "cache") | dropped |
| Whole words in the right turn | kept |
