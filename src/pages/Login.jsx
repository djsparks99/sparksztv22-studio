import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";

export default function Login() {
  const { login, loginWithOAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/dashboard";

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (res.ok) {
      toast.success("Welcome back to the network.");
      navigate(from);
    } else {
      toast.error(res.error || "Login failed");
    }
  };

  const handleOAuth = async (provider) => {
    setLoading(true);
    const res = await loginWithOAuth(provider);
    setLoading(false);
    if (res.ok) {
      toast.success("Authenticated successfully!");
      navigate(from);
    } else {
      toast.error(res.error || `${provider} authentication failed`);
    }
  };

  return (
    <AuthShell title="LOG IN" subtitle="Re-enter the frequency">
      {/* OAuth Social Buttons */}
      <div className="mb-6 space-y-2.5" data-testid="oauth-providers-container">
        <button
          type="button"
          data-testid="login-google-btn"
          onClick={() => handleOAuth("google")}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 border border-[#27272a] bg-[#050505] py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-white transition hover:border-[#e5ff00] hover:text-[#e5ff00]"
        >
          <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
            <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
          </svg>
          CONTINUE WITH GOOGLE
        </button>

        <button
          type="button"
          data-testid="login-github-btn"
          onClick={() => handleOAuth("github")}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 border border-[#27272a] bg-[#050505] py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-white transition hover:border-[#e5ff00] hover:text-[#e5ff00]"
        >
          <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          CONTINUE WITH GITHUB
        </button>

        <button
          type="button"
          data-testid="login-yahoo-btn"
          onClick={() => handleOAuth("yahoo")}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 border border-[#27272a] bg-[#050505] py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-white transition hover:border-[#e5ff00] hover:text-[#e5ff00]"
        >
          <span className="font-serif font-black text-purple-400">Y!</span>
          CONTINUE WITH YAHOO
        </button>
      </div>

      <div className="relative mb-6 text-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#27272a]"></div>
        </div>
        <span className="relative bg-[#0a0a0a] px-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          OR EMAIL & PASSWORD
        </span>
      </div>

      <form onSubmit={submit} className="space-y-6" data-testid="login-form">
        <div>
          <label className="label-caps" htmlFor="email">EMAIL</label>
          <input
            id="email"
            data-testid="login-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-terminal"
            placeholder="dj@pirate.radio"
          />
        </div>
        <div>
          <label className="label-caps" htmlFor="password">PASSWORD</label>
          <input
            id="password"
            data-testid="login-password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-terminal"
            placeholder="••••••••"
          />
        </div>
        <button
          type="submit"
          data-testid="login-submit"
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? "TUNING IN..." : "TUNE IN"}
        </button>
      </form>
      <div className="mt-8 border-t border-[#27272a] pt-6 text-center font-mono text-xs uppercase tracking-widest text-zinc-500">
        NO CHANNEL YET?{" "}
        <Link to="/register" data-testid="link-to-register" className="text-[#e5ff00] hover:underline">
          CLAIM ONE →
        </Link>
      </div>
    </AuthShell>
  );
}

export function AuthShell({ title, subtitle, children }) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-[1440px] items-start px-6 py-16">
      <div className="grid w-full gap-12 lg:grid-cols-12">
        <aside className="hidden lg:col-span-6 lg:block">
          <div className="grid-lines h-full min-h-[500px] border border-[#27272a] bg-[#0a0a0a] p-10">
            <div className="label-caps">// STATION 87.6 FM</div>
            <div className="mt-24 font-display text-6xl font-black leading-none tracking-tighter">
              THE<br />UNDER<br />
              <span className="text-[#e5ff00]">GROUND</span><br />TAPES.
            </div>
            <div className="mt-16 max-w-sm font-mono text-xs leading-relaxed text-zinc-400">
              Broadcasting since forever. From basement warehouses to bedroom decks — this is where
              the underground gets its signal.
            </div>
          </div>
        </aside>
        <main className="lg:col-span-6">
          <div className="mx-auto max-w-md">
            <div className="label-caps">// {subtitle}</div>
            <h1 className="mb-8 font-display text-5xl font-black tracking-tighter">{title}</h1>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
