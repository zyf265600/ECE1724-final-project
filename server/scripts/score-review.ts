// C5 check: scores five sample transcripts and prints, for every score, the quote,
// the turn it links to and whether the quote is really in that candidate turn.
// The five interviews stay in the database, so their reports can be opened in the app.
//   npm run score:review -w server
import 'dotenv/config'
import type { Difficulty, Speaker } from '@deepdive/shared'
import { prisma } from '../src/db.ts'
import { scoreInterview } from '../src/services/scoring.ts'

const I = 'INTERVIEWER'
const C = 'CANDIDATE'
const OPENING = 'Hi, thanks for joining. To start, tell me about one project you worked on: what problem it solved, and what you built yourself.'

interface Sample {
  label: string // printed only; never sent to the LLM
  role: string
  difficulty: Difficulty
  turns: [Speaker, string][]
}

const SAMPLES: Sample[] = [
  {
    label: 'Sample 1: strong',
    role: 'Backend engineer intern',
    difficulty: 'HARD',
    turns: [
      [I, OPENING],
      [C, 'I built the product search service at my internship. Search used SQL LIKE queries and took about 800 milliseconds at p95. I designed and wrote a vector search service in Go that stores product embeddings in an HNSW index, and I owned it from design to rollout.'],
      [I, 'Why HNSW rather than IVF, and what did that choice cost you?'],
      [C, 'I benchmarked both on our two million products. IVF needed about a third of the memory, but to reach 95 percent recall it had to probe so many lists that p95 latency went over 40 milliseconds. HNSW reached 97 percent recall at 9 milliseconds. The cost was memory: the graph took 6 gigabytes, so we moved to a bigger instance. If memory were the limit I would pick IVF with product quantization.'],
      [I, 'How did you measure recall, and against what baseline?'],
      [C, 'I computed exact nearest neighbors with brute force on a sample of 5,000 real queries and counted how many of the top ten results HNSW returned. The baseline for latency was the old SQL search, measured with the same replayed query log. In the A/B test, click-through on search went up 6 percent.'],
    ],
  },
  {
    label: 'Sample 2: vague',
    role: 'Frontend developer intern',
    difficulty: 'MEDIUM',
    turns: [
      [I, OPENING],
      [C, 'We made a web app for our club. It was in React. It worked pretty well and people liked it.'],
      [I, 'What part of the app did you build yourself?'],
      [C, 'We all worked on everything together, so it is hard to say. We used a lot of libraries and it was fast.'],
      [I, 'When you say it was fast, how did you know?'],
      [C, 'It just felt fast when we used it. Nobody complained.'],
    ],
  },
  {
    label: 'Sample 3: deep but no results',
    role: 'Machine learning intern',
    difficulty: 'MEDIUM',
    turns: [
      [I, OPENING],
      [C, 'I fine-tuned a small language model to classify support tickets into twelve categories. I wrote the training loop in PyTorch, used LoRA adapters on the attention layers so only about one percent of the weights were trained, and handled class imbalance with a weighted loss.'],
      [I, 'Why LoRA instead of full fine-tuning?'],
      [C, 'Full fine-tuning did not fit on our single 24 gigabyte GPU, and LoRA let us keep one base model and swap adapters per customer. The trade-off is a bit less accuracy on rare classes, which is why I added the weighted loss.'],
      [I, 'How well did it work?'],
      [C, 'It worked better than before, I think. We did not really set up a proper evaluation before I left, but the team said the routing looked good.'],
    ],
  },
  {
    // The interviewer states the numbers; the candidate only agrees. A quote of the
    // interviewer's words must be dropped.
    label: 'Sample 4: interviewer states the result',
    role: 'Data engineer intern',
    difficulty: 'EASY',
    turns: [
      [I, OPENING],
      [C, 'I worked on a nightly data pipeline that loads sales data into the warehouse. I rewrote the slowest step to use Spark instead of a single Python script.'],
      [I, 'So the Spark rewrite cut the nightly run from six hours to forty minutes and saved the team a lot of waiting?'],
      [C, 'Yes, that is right, it was much quicker after that.'],
      [I, 'Which part of the rewrite did you do yourself?'],
      [C, 'I wrote the join and the deduplication step and tested them on one week of data.'],
    ],
  },
  {
    label: 'Sample 5: one short answer',
    role: 'Software engineer intern',
    difficulty: 'EASY',
    turns: [
      [I, OPENING],
      [C, 'I made a to-do list app for a course project.'],
      [I, 'That is all the time we have. Thanks for walking me through your project.'],
    ],
  },
]

// Checked here on its own, not with the server's checkQuote, so the review can catch a bug in it.
function inTurn(quote: string | null, text: string | undefined): string {
  if (!quote || !text) return '-'
  if (text.toLowerCase().includes(quote.toLowerCase())) return 'yes'
  const words = (t: string) => ` ${t.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
  return words(text).includes(words(quote)) ? 'yes, apart from punctuation' : 'NO'
}

for (const sample of SAMPLES) {
  const interview = await prisma.interview.create({
    data: {
      role: sample.role,
      difficulty: sample.difficulty,
      durationMin: 10,
      voice: 'FEMALE',
      status: 'SCORING',
      startedAt: new Date(),
      endedAt: new Date(),
      turns: { create: sample.turns.map(([speaker, text], index) => ({ index, speaker, text })) },
    },
  })
  const ok = await scoreInterview(interview.id)
  console.log(`\n## ${sample.label}, ${sample.role} (${interview.id})`)
  if (!ok) {
    console.log('Scoring FAILED')
    continue
  }
  const report = await prisma.report.findUniqueOrThrow({
    where: { interviewId: interview.id },
    include: { scores: { include: { turn: true } } },
  })
  console.log(`Overall ${report.overallScore} ${report.verdict}. ${report.summary}`)
  console.log('| Skill | Score | Quote | Turn | Speaker | In that turn |')
  console.log('|---|---|---|---|---|---|')
  for (const s of report.scores) {
    console.log(
      `| ${s.skill} | ${s.score} | ${s.quote ?? '-'} | ${s.turn?.index ?? '-'} | ${s.turn?.speaker ?? '-'} | ${inTurn(s.quote, s.turn?.text)} |`,
    )
  }
}
await prisma.$disconnect()
