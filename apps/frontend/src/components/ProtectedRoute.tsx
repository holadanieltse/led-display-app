// 路由守卫：未登录 → 跳转 /login；hydrate 进行中 → 显示占位避免闪烁
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'

export default function ProtectedRoute() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const isHydrated = useAuthStore((s) => s.isHydrated)
  const location = useLocation()

  // 会话恢复进行中，先挂个空层避免被误甩到 /login
  if (!isHydrated) {
    return <div className="h-screen w-full bg-sidebar" />
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}
