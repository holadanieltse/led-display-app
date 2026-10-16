import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  Building2,
  Crown,
  BarChart3,
  MonitorSmartphone,
  Database,
  Layers,
  MapPinned,
  Menu,
  ChevronDown,
  Search,
  LogOut,
  Users,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAuthStore } from '../stores/authStore'
import type { UserRole } from '../types/auth'
import { hasMinRole } from '../types'

type NavItem = {
  to: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  group?: string
  minRole?: UserRole
}

const NAV_ITEMS: NavItem[] = [
  { to: '/organizations',       label: 'Organization Management',       icon: Building2,        group: 'TICKER MANAGEMENT' },
  { to: '/users',               label: 'User Management',               icon: Users,            group: 'TICKER MANAGEMENT', minRole: 'ORG_OWNER' },
  { to: '/premium-content',     label: 'Premium Content Management',    icon: Crown,            group: 'TICKER MANAGEMENT' },
  { to: '/reports/ticker',      label: 'Ticker Subscription Report',    icon: BarChart3,        group: 'TICKER MANAGEMENT' },
  { to: '/reports/digital',     label: 'Digital Subscription Report',   icon: BarChart3 },
  { to: '/data-center',         label: 'Data Center',                   icon: Database,         minRole: 'SUPER_ADMIN' },
  { to: '/bulk-actions',        label: 'Bulk Actions',                  icon: Layers,           minRole: 'ORG_OWNER' },
  { to: '/maps/finance',        label: 'Finance Map',                   icon: MapPinned },
  { to: '/maps/sports',         label: 'Sports Map',                    icon: MapPinned },
  { to: '/maps/rss',            label: 'RSS Map',                       icon: MapPinned },
]

export default function Layout() {
  // On desktop: sidebar can be collapsed/expanded. On mobile: it's a drawer.
  const [mobileOpen, setMobileOpen] = useState(false)   // mobile drawer open state
  const [desktopCollapsed, setDesktopCollapsed] = useState(false) // desktop collapse state
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  // Close mobile drawer on route change (NavLink click)
  const handleNavClick = () => setMobileOpen(false)

  // Close menus on ESC
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileOpen(false)
        setUserMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  const displayName = user?.name || user?.email || 'User'
  const initials = displayName.charAt(0).toUpperCase()

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.minRole || (user && hasMinRole(user.role, item.minRole)),
  )

  return (
    <div className="flex h-screen w-full overflow-hidden bg-sidebar text-gray-800">
      {/* ========== Mobile drawer backdrop ========== */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ========== Sidebar ========== */}
      {/* Desktop: static flex column. Mobile: fixed drawer that slides in. */}
      <aside
        className={`
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:static md:flex
          fixed inset-y-0 left-0 z-40
          ${desktopCollapsed ? 'md:w-16' : 'md:w-60'}
          w-64 flex-shrink-0 border-r border-gray-200 bg-white transition-all duration-200 flex flex-col
        `}
      >
        {/* Logo + mobile close button */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-brand-500 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              d
            </div>
            {!desktopCollapsed && (
              <div className="min-w-0">
                <div className="text-lg font-bold text-gray-900 leading-tight tracking-tight">
                  day<span className="text-brand-600">com</span>
                </div>
                <div className="text-[10px] text-gray-400 tracking-widest uppercase mt-0.5">
                  Display Manager
                </div>
              </div>
            )}
          </div>
          {/* Close button (mobile only) */}
          <button
            onClick={() => setMobileOpen(false)}
            className="md:hidden p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3">
          {visibleNavItems.map((item) => {
            const Icon = item.icon
            return (
              <div key={item.to}>
                {item.group && !desktopCollapsed && (
                  <div className="px-4 pt-4 pb-1 text-[10px] font-semibold text-gray-400 tracking-wider uppercase">
                    {item.group}
                  </div>
                )}
                <NavLink
                  to={item.to}
                  onClick={handleNavClick}
                  className={({ isActive }) =>
                    [
                      'mx-2 my-0.5 flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                      isActive
                        ? 'bg-brand-50 text-brand-700 font-medium border-l-4 border-brand-500'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 border-l-4 border-transparent',
                    ].join(' ')
                  }
                  title={item.label}
                >
                  <Icon className="w-5 h-5 flex-shrink-0" />
                  {!desktopCollapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              </div>
            )
          })}
        </nav>
      </aside>

      {/* ========== Main ========== */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 flex items-center justify-between border-b border-gray-200 bg-white px-4 md:px-6">
          {/* Mobile: open drawer. Desktop: collapse/expand sidebar. */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                // On mobile, open the drawer. On desktop, toggle collapse.
                if (window.innerWidth < 768) {
                  setMobileOpen(true)
                } else {
                  setDesktopCollapsed((v) => !v)
                }
              }}
              className="p-2 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition"
              title="Toggle sidebar"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Search — hidden on small screens */}
            <button className="hidden md:flex p-2 rounded-md text-gray-500 hover:bg-gray-100 transition">
              <Search className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 pl-2 cursor-pointer hover:bg-gray-50 rounded-md px-2 py-1.5 transition"
              >
                <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-brand-500 text-white flex items-center justify-center font-semibold text-sm md:text-base">
                  {initials}
                </div>
                <div className="hidden sm:block text-left">
                  <div className="text-sm font-medium text-gray-900 leading-tight">{displayName}</div>
                  {user?.role && (
                    <div className="text-[10px] text-gray-400 uppercase tracking-wide">{user.role}</div>
                  )}
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400 hidden sm:block" />
              </button>

              {userMenuOpen && (
                <>
                  {/* Click outside to close */}
                  <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-20">
                    <div className="px-4 py-2 border-b border-gray-100">
                      <div className="text-sm font-medium text-gray-900 truncate">{displayName}</div>
                      <div className="text-xs text-gray-400 truncate">{user?.email}</div>
                    </div>
                    <button
                      onClick={handleLogout}
                      className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-auto bg-[#eaf2f8]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
