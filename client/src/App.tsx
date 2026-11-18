import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { Layout } from '@/components/Layout'
import { HomePage } from '@/pages/HomePage'
import { RoomPage } from '@/pages/RoomPage'
import { SetupPage } from '@/pages/SetupPage'

// Routes from docs/wireframes.md. The report page is added in stage 2.2.
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<HomePage />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path="interviews/:id/room" element={<RoomPage />} />
          <Route path="*" element={<PageNotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}

function PageNotFound() {
  return (
    <p>
      Page not found.{' '}
      <Link to="/" className="underline">
        Back to home
      </Link>
    </p>
  )
}
