import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AppLayout from './components/layout/AppLayout.jsx'
import Overview from './pages/Overview.jsx'
import Repositories from './pages/Repositories.jsx'
import AgentGraph from './pages/AgentGraph.jsx'
import Findings from './pages/Findings.jsx'
import FindingDetail from './pages/FindingDetail.jsx'
import Agents from './pages/Agents.jsx'
import AgentProfile from './pages/AgentProfile.jsx'
import Policies from './pages/Policies.jsx'
import AuditLog from './pages/AuditLog.jsx'
import Integrations from './pages/Integrations.jsx'
import Settings from './pages/Settings.jsx'
import Fixes from './pages/Fixes.jsx'
import ComingSoon from './pages/ComingSoon.jsx'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 15_000, refetchOnWindowFocus: false } } })

// Routes are separate from the router so other entry points (tests, previews) can reuse them.
export function AppRoutes() {
  return (
    <QueryClientProvider client={queryClient}>
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Overview />} />
        <Route path="graph" element={<AgentGraph />} />
        <Route path="fixes" element={<Fixes />} />
        <Route path="findings" element={<Findings />} />
        <Route path="findings/:id" element={<FindingDetail />} />
        <Route path="agents" element={<Agents />} />
        <Route path="agents/:id" element={<AgentProfile />} />
        <Route path="policies" element={<Policies />} />
        <Route path="audit" element={<AuditLog />} />
        <Route path="integrations" element={<Integrations />} />
        <Route path="settings" element={<Settings />} />
        <Route path="repositories" element={<Repositories />} />
        <Route path="*" element={<ComingSoon title="Page not found" />} />
      </Route>
    </Routes>
    </QueryClientProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
