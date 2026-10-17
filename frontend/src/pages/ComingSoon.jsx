import { Link } from 'react-router-dom'

export default function ComingSoon({ title }) {
  return (
    <main className="content">
      <div className="empty-page">
        <h1>{title}</h1>
        <p>This page is next in the build.</p>
        <Link to="/">Back to Overview</Link>
      </div>
    </main>
  )
}
