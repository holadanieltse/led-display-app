import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Eye, EyeOff, LogIn } from 'lucide-react'
import { api } from '../services/api'
import { useAuthStore } from '../stores/authStore'
import type { LoginResponse } from '../types/auth'

const schema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
})
type FormData = z.infer<typeof schema>

export default function LoginPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const setAuth = useAuthStore((s) => s.setAuth)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [showPwd, setShowPwd] = useState(false)
  const [serverError, setServerError] = useState('')

  // 已登录用户直接跳走
  useEffect(() => {
    if (isAuthenticated) {
      const from = (location.state as { from?: string })?.from ?? '/organizations'
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, navigate, location.state])

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) })

  const onSubmit = async (data: FormData) => {
    setServerError('')
    try {
      const res = await api.post<LoginResponse>('/auth/login', data)
      setAuth(res.data.data.token, res.data.data.user)
      const from = (location.state as { from?: string })?.from ?? '/organizations'
      navigate(from, { replace: true })
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const e = err as { response?: { data?: { error?: { message?: string } } } }
        setServerError(e.response?.data?.error?.message ?? 'Login failed, please try again')
      } else {
        setServerError('Network error. Please make sure the backend service is running')
      }
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#0f172a] via-[#064e3b] to-[#0f172a] px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-brand-500 mb-4 shadow-lg shadow-brand-500/30 font-bold text-white text-3xl">
            d
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            day<span className="text-brand-400">com</span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">LED Display Management System</p>
        </div>

        {/* Form Card */}
        <div className="bg-white rounded-xl shadow-2xl p-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-6">Sign In</h2>

          {serverError && (
            <div className="mb-4 px-4 py-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                {...register('email')}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
              />
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email.message}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPwd ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register('password')}
                  className="w-full px-4 py-2.5 pr-11 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPwd ? <EyeOff className="w-4.5 h-4.5" /> : <Eye className="w-4.5 h-4.5" />}
                </button>
              </div>
              {errors.password && <p className="mt-1 text-xs text-red-500">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full inline-flex items-center justify-center gap-2 bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2.5 rounded-lg text-sm font-medium transition shadow-sm"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  Sign In
                </>
              )}
            </button>
          </form>

          {/* Demo accounts hint */}
          <div className="mt-6 pt-5 border-t border-gray-100">
            <p className="text-xs text-gray-400 font-medium mb-2">Demo accounts:</p>
            <div className="space-y-1 text-xs text-gray-500">
              <button
                type="button"
                onClick={() => {
                  setValue('email', 'superadmin@demo.com')
                  setValue('password', 'demo123')
                }}
                className="block hover:text-brand-600 transition"
              >
                superadmin@demo.com / demo123 (Super Admin)
              </button>
              <button
                type="button"
                onClick={() => {
                  setValue('email', 'admin@demo.com')
                  setValue('password', 'demo123')
                }}
                className="block hover:text-brand-600 transition"
              >
                admin@demo.com / demo123 (Org Owner)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
