"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Activity, Eye, EyeOff, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError("")
    // In dev mode, bypass auth
    await new Promise(r => setTimeout(r, 800))
    if (!email || !password) { setError("Please enter email and password."); setLoading(false); return }
    router.push("/dashboard")
  }

  const demoLogin = () => {
    setEmail("coordinator@apollo.com")
    setPassword("demo1234")
    setTimeout(() => router.push("/dashboard"), 600)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0F4C81] via-[#1a5c93] to-[#00B4A6] p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-sm mb-3">
            <Activity className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">RecoverPath</h1>
          <p className="text-blue-200 text-sm mt-1">Clinical Monitoring Dashboard</p>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Sign in</CardTitle>
            <CardDescription>Apollo Hospitals — Remote Monitoring Unit</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Email</label>
                <Input
                  type="email"
                  placeholder="coordinator@apollo.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-gray-700">Password</label>
                <div className="relative">
                  <Input
                    type={showPw ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    autoComplete="current-password"
                    className="pr-10"
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    onClick={() => setShowPw(v => !v)}
                  >
                    {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-600">{error}</p>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Signing in…" : "Sign in"}
              </Button>
            </form>

            <div className="relative my-4">
              <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
              <div className="relative flex justify-center text-xs"><span className="bg-white px-2 text-gray-400">or</span></div>
            </div>

            <Button
              variant="outline"
              className="w-full gap-2"
              onClick={demoLogin}
            >
              <ShieldCheck className="h-4 w-4 text-[#00B4A6]" />
              Continue with Demo Account
            </Button>

            <div className="mt-4 flex flex-wrap justify-between gap-y-1 text-xs text-gray-400">
              <span>Roles: hospital_admin · care_coordinator</span>
              <a href="/demo" className="text-[#0F4C81] hover:underline">View demo →</a>
            </div>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-blue-200">
          HIPAA-compliant · Data encrypted at rest and in transit
        </p>
      </div>
    </div>
  )
}
