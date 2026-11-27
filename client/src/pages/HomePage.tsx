import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'

// Home: one full-screen section per step. Photos from Unsplash (Unsplash License).

interface Photo {
  src: string
  by: string
  page: string // Unsplash id, for the credit
}

interface Section {
  id: string
  photo: Photo
  focus: string // CSS background-position for the subject
  align: 'center' | 'left' | 'right'
  content: ReactNode
}

function Lines({ children }: { children: string[] }) {
  return (
    <p className="mt-5 max-w-2xl space-y-1 text-lg leading-relaxed text-lede">
      {children.map((line) => (
        <span key={line} className="block">
          {line}
        </span>
      ))}
    </p>
  )
}

function Kicker({ children }: { children: string }) {
  return <p className="mb-3 text-sm font-semibold tracking-[0.12em] text-navy-200 uppercase">{children}</p>
}

const Start = () => (
  <Button asChild size="lg">
    <Link to="/setup">Start a new interview</Link>
  </Button>
)

const SECTIONS: Section[] = [
  {
    id: 'top',
    photo: { src: '/home/headphones-desk.jpg', by: 'Gustavo Alejandro Espinosa Reyes', page: '8WtjnY3p0L4' },
    focus: '50% 28%',
    align: 'center',
    content: (
      <>
        <Kicker>Voice mock interview</Kicker>
        <h1 className="text-5xl leading-[1.08] font-semibold tracking-tight text-white md:text-7xl">
          Practice explaining
          <br />
          <span className="bg-linear-90 from-navy-400 to-navy-100 bg-clip-text text-transparent">your project.</span>
        </h1>
        <Lines>{['An AI interviewer asks spoken follow-ups, then scores you.']}</Lines>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Start />
          <Button asChild size="lg" variant="outline">
            <a href="#follow-ups">See how it works</a>
          </Button>
        </div>
      </>
    ),
  },
  {
    id: 'follow-ups',
    photo: { src: '/home/desks-windows.jpg', by: 'Sam', page: 'xzZ0PZobjek' },
    focus: '85% 70%',
    align: 'left',
    content: (
      <>
        <Kicker>Spoken follow-ups</Kicker>
        <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Every question comes from your answer.
        </h2>
        <Lines>
          {[
            'Start with one project you built: what it solved and what you did.',
            'Each follow-up is written from your transcript, at the difficulty you pick.',
          ]}
        </Lines>
      </>
    ),
  },
  {
    id: 'room',
    photo: { src: '/home/laptop-night.jpg', by: 'Chirayu Trivedi', page: 'nPJFU_zTVhA' },
    focus: '70% 60%',
    align: 'left',
    content: (
      <>
        <Kicker>Meeting room</Kicker>
        <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Answer out loud, at your own pace.
        </h2>
        <Lines>
          {[
            'The interviewer speaks every question, with live captions.',
            'Nobody cuts you off: press Finish answer when you are done.',
          ]}
        </Lines>
      </>
    ),
  },
  {
    id: 'report',
    photo: { src: '/home/talking-hall.jpg', by: 'Michael Shtern', page: 'MN6mNZ9vgXw' },
    focus: '30% 60%',
    align: 'right',
    content: (
      <>
        <Kicker>Scored report</Kicker>
        <h2 className="text-4xl font-semibold tracking-tight text-white md:text-5xl">
          Know exactly what to fix next.
        </h2>
        <Lines>
          {[
            'Five skills scored from 1 to 4 against a fixed rubric.',
            'Every score quotes your own words: play that answer back, or download the report.',
          ]}
        </Lines>
      </>
    ),
  },
  {
    id: 'ready',
    photo: { src: '/home/stage-mic.jpg', by: 'Porus Nagare', page: 'hPXnueqSTIE' },
    focus: '40% 40%',
    align: 'center',
    content: (
      <>
        <h2 className="text-4xl font-semibold tracking-tight text-white md:text-6xl">Ready when you are.</h2>
        <Lines>{['Bring one project you built. Use Chrome or Edge with a microphone.']}</Lines>
        <div className="mt-8">
          <Start />
        </div>
      </>
    ),
  },
]

// Shade behind the text.
const SHADE: Record<Section['align'], string> = {
  center:
    'bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgb(3_8_20/0.35),rgb(3_8_20/0.8)),linear-gradient(180deg,rgb(3_8_20/0.6),rgb(3_8_20/0.15)_40%,rgb(3_8_20/0.75))]',
  left: 'bg-[linear-gradient(90deg,rgb(3_8_20/0.88),rgb(3_8_20/0.4)_55%,rgb(3_8_20/0.15)),linear-gradient(180deg,rgb(3_8_20/0.5),transparent_40%,rgb(3_8_20/0.65))]',
  right:
    'bg-[linear-gradient(270deg,rgb(3_8_20/0.88),rgb(3_8_20/0.4)_55%,rgb(3_8_20/0.15)),linear-gradient(180deg,rgb(3_8_20/0.5),transparent_40%,rgb(3_8_20/0.65))]',
}

const ALIGN: Record<Section['align'], string> = {
  center: 'items-center text-center',
  left: 'items-start text-left',
  right: 'items-end text-left md:[&>div]:max-w-xl',
}

export function HomePage() {
  // Enable scroll snapping on <html> while Home is mounted.
  useEffect(() => {
    const html = document.documentElement
    html.classList.add('snap-y', 'snap-mandatory')
    return () => html.classList.remove('snap-y', 'snap-mandatory')
  }, [])

  return (
    <main>
      {SECTIONS.map((s, i) => (
        <section
          key={s.id}
          id={s.id}
          className={`relative isolate flex min-h-svh snap-start flex-col justify-center overflow-hidden px-6 py-24 md:px-[8vw] ${ALIGN[s.align]}`}
        >
          <div
            className="absolute inset-0 -z-30 bg-cover bg-no-repeat brightness-[0.8] contrast-[1.15] grayscale"
            style={{ backgroundImage: `url(${s.photo.src})`, backgroundPosition: s.focus }}
          />
          <div className="absolute inset-0 -z-20 bg-linear-160 from-navy-600 via-navy-800 to-navy-900 mix-blend-color" />
          <div className={`absolute inset-0 -z-10 ${SHADE[s.align]}`} />
          <div className={`flex flex-col ${s.align === 'center' ? 'items-center' : 'items-start'}`}>{s.content}</div>
          {/* Credits inside the last section. */}
          {i === SECTIONS.length - 1 && (
            <footer className="absolute inset-x-0 bottom-0 px-6 py-5 text-center text-xs text-muted-foreground">
              Photos from Unsplash by{' '}
              {SECTIONS.map((p, j) => (
                <span key={p.id}>
                  <a
                    href={`https://unsplash.com/photos/${p.photo.page}`}
                    target="_blank"
                    rel="noreferrer"
                    className="underline-offset-2 hover:underline"
                  >
                    {p.photo.by}
                  </a>
                  {j < SECTIONS.length - 1 ? ', ' : '.'}
                </span>
              ))}
            </footer>
          )}
        </section>
      ))}
    </main>
  )
}
