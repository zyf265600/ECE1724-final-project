# AI Interaction Record

## WebSocket for the meeting room, and streaming the interviewer's voice

### Prompt

> We’re thinking of using one HTTP request per interview turn: upload the candidate’s recording, then return the transcript, the next question, and its audio together. Does that make sense for a voice interview app? I’m mainly worried about how long the candidate would have to wait before hearing the next question.

### AI Response

*Summary.* The AI suggested a WebSocket for the meeting room instead of one request per turn:

- In the planned design, one non-streaming response carries the transcript, the question and the complete audio, so playback can start only after synthesis has finished. A WebSocket carries the answer upload, room events and streamed audio over one two-way connection, so the server can forward TTS audio while it is generated.
- Server-Sent Events can push audio down to the browser but cannot carry the answer recording up, so the answer would need a separate upload.
- Boson's own realtime API also uses WebSocket.

### What Your Team Did With It

- **Checked the reasoning and accepted it, but limited it to the meeting room:** everything else (Setup, past interviews, Report, playback links) stays on REST, so only the room depends on the socket.
- **Verified the streaming claim:** the server forwards Boson's streamed TTS as raw PCM chunks without re-encoding, and the browser queues each chunk with the Web Audio API as it arrives (`client/src/lib/pcmPlayer.ts`). We measured the first audio of a question at 0.5–0.8 s after the request (`docs/design.md`).
- **Added what the suggestion left out:** the client waits until the last queued chunk has actually played before reopening the microphone, so the candidate never records over the interviewer; and *End interview* stops the queued audio at once and drops later chunks.

## Checking the scoring on five sample interviews

### Prompt

> Can you write a script to try our scoring with DeepSeek on five sample interviews? Include a strong answer, a vague answer, a technically detailed answer with no evaluation, one where the interviewer gives the results and the candidate just agrees, and one with only a short answer.
>
> For each skill score, show the quote, which turn it points to, who said it, and whether the quote actually appears in that turn. We want to read the reports ourselves and see whether the scores make sense.

### AI Response

*Summary.* The AI drafted `server/scripts/score-review.ts` with the five transcripts and a label for each ("strong", "vague", …). We ran it on 2026-11-17 and printed one table per report. Every quote linked to a candidate turn and appeared in it, and the scores looked plausible.

### What Your Team Did With It

- **Found a flaw in the AI-drafted script itself:** the script put each sample's label into the role sent to the LLM (for example "Review 2 (vague) …"), so the model being tested saw the expected result. The apparently plausible scores were therefore not reliable evidence of scoring quality. We changed the script so the label is printed only; the LLM sees just the plain role and the transcript.
- **Found scoring mistakes that the automatic quote check cannot catch:** in sample 4 the summary praised "a concrete improvement in runtime", which only the interviewer had said. The server checks quotes against candidate turns, but the summary is not a quote, so nothing stopped it. In sample 5, a single sentence got clarity 3. We added two rules to the scoring prompt: "Credit only what the candidate said … also in the summary", and "One or two short sentences in total cannot show structure: CLARITY is then at most 2." The clarity cap is a conservative rule for very short transcripts; it may penalize concise answers and needs validation on more interviews.
- **Re-ran with the real LLM and judged each report by hand:** all 25 quotes were kept, each linked to a candidate turn of its own interview; sample 4's summary now asks for "results you measured yourself rather than confirming the interviewer's numbers"; sample 5's clarity dropped to 2. One score is still generous (personal contribution 3 for "I made a to-do list app for a course project."), and we recorded it rather than adding another rule for it. The recorded results are in `docs/scoring-review.md`; `npm run score:review -w server` reruns the evaluation on the same five transcripts.

## Microphone level bar and speaker halo

### Prompt

> The mic level bar on the Setup page barely moves when I talk. Speaking louder doesn’t seem to make much difference either. Can you make it follow my voice level more closely?

After trying the first suggestion:

> It reacts now, but it’s too sensitive and jumps around a lot. Can you smooth it out a bit? Also, the bar should only start moving after I click “Test microphone.” While the test is running, change the button to “Finish test,” and stop the mic test when I click it.

### AI Response

*Summary.*

- The first version computed the level from the raw amplitude, so normal speech filled only a small part of the bar. The AI suggested changing the level to a decibel scale (−50 dB, room noise, maps to empty; −10 dB, loud speech, maps to full) and turning off the browser's automatic gain control for the check, because it evens out loud and quiet speech.
- After the second prompt, it suggested adding smoothing (each frame the level rises a quarter of the way to the new value and falls a tenth of the way) and making the bar move only between *Test microphone* and *Finish test*.

### What Your Team Did With It

- **Found the problem by testing:** the first version passed type-check and lint but did not follow the voice; we noticed it in the browser. The first change then overcorrected and was too sensitive, which we also caught by trying it.
- **Verified with a simulated microphone:** with a fake input that alternates quiet and loud speech, the bar sat at about 10% for quiet speech and 75% for loud speech, and fell back smoothly within about 0.4 s of silence. Automatic gain control is off only for the check; the recorded answers are unchanged.
- **Reused it for the speaker halo:** the halo in the meeting room uses the same decibel mapping (`client/src/lib/audioLevel.ts`). When we asked how to make the halo react a little more to the voice, the AI suggested doubling the halo's smoothing speed only; we updated that parameter, played the same speech in Chrome and read the halo's size every 100 ms: the average change between readings rose from 0.092 to 0.126 times the avatar size for the interviewer (+37%) and from 0.074 to 0.104 for the candidate (+40%), while the Setup bar stayed as it was.
