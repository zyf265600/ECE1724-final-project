import { Link, Outlet, useMatch } from 'react-router'

// Shared page frame: the app name (links home) above each page.
// Home is full-width, with the header over its first photo.
export function Layout() {
  const home = useMatch('/') !== null

  return (
    <div className="min-h-svh text-foreground">
      <header className={home ? 'absolute inset-x-0 top-0 z-20' : ''}>
        <div className={`mx-auto flex h-16 items-center px-4 md:px-6 ${home ? 'md:px-[8vw]' : 'max-w-5xl'}`}>
          <Link to="/" className="inline-flex items-center gap-2.5">
            <span
              className="grid size-8 place-items-center rounded-[0.6rem] bg-linear-135 from-primary to-navy-900 text-base font-bold text-white"
              aria-hidden
            >
              D
            </span>
            <span className="text-xl font-semibold tracking-wide text-white">DeepDive</span>
          </Link>
        </div>
      </header>
      {home ? (
        <Outlet />
      ) : (
        <main className="mx-auto max-w-5xl px-4 pt-4 pb-10 md:px-6">
          <Outlet />
        </main>
      )}
    </div>
  )
}
