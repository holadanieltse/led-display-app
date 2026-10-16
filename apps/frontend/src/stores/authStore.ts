// Zustand store：管理 token 和当前用户
import { create } from 'zustand'
import type { AuthUser } from '../types/auth'

const TOKEN_KEY = 'led_token'

type AuthState = {
  token: string | null
  user: AuthUser | null
  isAuthenticated: boolean
  isHydrated: boolean
  setAuth: (token: string, user: AuthUser) => void
  logout: () => void
  hydrate: () => Promise<void>
  // 派生：便捷判断角色
  isSuperAdmin: () => boolean
  canManageOrg: () => boolean // SUPER_ADMIN 或 ORG_OWNER
  canManageDisplays: () => boolean // SUPER_ADMIN / ORG_OWNER / ORG_ADMIN
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  user: null,
  isAuthenticated: false,
  isHydrated: false,

  setAuth: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token)
    set({ token, user, isAuthenticated: true, isHydrated: true })
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY)
    set({ token: null, user: null, isAuthenticated: false })
  },

  // 从 localStorage 恢复会话：有 token 就拉 /api/auth/me 回填 user
  // 动态 import api 避免与 services/api.ts 形成循环依赖
  hydrate: async () => {
    if (get().isHydrated) return
    const token = localStorage.getItem(TOKEN_KEY)
    if (!token) {
      set({ isHydrated: true })
      return
    }
    set({ token, isAuthenticated: true })
    try {
      const { api } = await import('../services/api')
      const res = await api.get<{ success: true; data: { user: AuthUser } }>('/auth/me')
      set({ user: res.data.data.user, isHydrated: true })
    } catch {
      // token 无效 → 清除会话
      localStorage.removeItem(TOKEN_KEY)
      set({ token: null, user: null, isAuthenticated: false, isHydrated: true })
    }
  },

  // 派生方法
  isSuperAdmin: () => get().user?.role === 'SUPER_ADMIN',
  canManageOrg: () => {
    const r = get().user?.role
    return r === 'SUPER_ADMIN' || r === 'ORG_OWNER'
  },
  canManageDisplays: () => {
    const r = get().user?.role
    return r === 'SUPER_ADMIN' || r === 'ORG_OWNER' || r === 'ORG_ADMIN'
  },
}))

export { TOKEN_KEY }
