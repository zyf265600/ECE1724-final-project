import { Link, Outlet } from 'react-router'

// Shared page frame: the app name (links home) above each page.
export function Layout() {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-4xl items-center px-4">
          <Link to="/" className="text-lg font-semibold">
            DeepDive
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Outlet />
      </main>
    </div>
  )
}
