import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import LoginPage from './pages/LoginPage'
import OrganizationListPage from './pages/OrganizationListPage'
import UserListPage from './pages/UserListPage'
import DisplayDetailPage from './pages/DisplayDetailPage'
import PlaylistItemPage from './pages/PlaylistItemPage'
import PlaceholderPage from './pages/PlaceholderPage'
import { useAuthStore } from './stores/authStore'

function App() {
  // 启动时从 localStorage 恢复会话（token + user）
  const hydrate = useAuthStore((s) => s.hydrate)
  useEffect(() => {
    void hydrate()
  }, [hydrate])

  return (
    <BrowserRouter>
      <Routes>
        {/* 公开路由 */}
        <Route path="/login" element={<LoginPage />} />

        {/* 受保护路由 */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Layout />}>
            <Route index element={<Navigate to="/organizations" replace />} />
            <Route path="organizations" element={<OrganizationListPage />} />
            <Route path="organizations/:id" element={<PlaceholderPage title="Organization Detail" />} />
            <Route path="users" element={<UserListPage />} />
            <Route path="displays/:id" element={<DisplayDetailPage />} />
            <Route path="displays/:displayId/playlist-item" element={<PlaylistItemPage />} />
            <Route path="displays/:displayId/playlist-item/:itemId" element={<PlaylistItemPage />} />
            <Route path="premium-content" element={<PlaceholderPage title="Premium Content Management" />} />
            <Route path="reports/ticker" element={<PlaceholderPage title="Ticker Subscription Report" />} />
            <Route path="reports/digital" element={<PlaceholderPage title="Digital Subscription Report" />} />
            <Route path="data-center" element={<PlaceholderPage title="Data Center" />} />
            <Route path="bulk-actions" element={<PlaceholderPage title="Bulk Actions" />} />
            <Route path="maps/finance" element={<PlaceholderPage title="Finance Map" />} />
            <Route path="maps/sports" element={<PlaceholderPage title="Sports Map" />} />
            <Route path="maps/rss" element={<PlaceholderPage title="RSS Map" />} />
          </Route>
        </Route>

        {/* 兜底 */}
        <Route path="*" element={<Navigate to="/organizations" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
