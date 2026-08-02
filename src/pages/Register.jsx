import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { AuthShell } from "@/pages/Login";
import { toast } from "sonner";

export default function Register() {
  const { register, loginWithOAuth } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: "",
    password: "",
    username: "",
    display_name: "",
  });
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const res = await register(form);
    setLoading(false);
    if (res.ok) {
      toast.success("Channel provisioned & permanent username locked into Firestore.");
      navigate("/dashboard");
    } else {
      toast.error(res.error || "Registration failed");
    }
  };

  const handleOAuth = async (provider) => {
    setLoading(true);
    const res = await loginWithOAuth(provider);
    setLoading(false);
    if (res.ok) {
      toast.success("Authenticated with " + provider);
      navigate("/dashboard");
    } else {
      toast.error(res.error || `${provider} authentication failed`);
    }
  };

  return (
    <AuthShell title="CLAIM YOUR FREQUENCY" subtitle="NEW BROADCASTER">
      {/* Social Providers */}
      <div className="mb-6 space-y-2.5" data-testid="oauth-providers-container">
        <button
          type="button"
          data-testid="register-google-btn"
          onClick={() => handleOAuth("google")}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 border border-[#27272a] bg-[#050505] py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-white transition hover:border-[#e5ff00] hover:text-[#e5ff00]"
        >
          <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
            <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
          </svg>
          SIGN UP WITH GOOGLE
        </button>

        <button
          type="button"
          data-testid="register-github-btn"
          onClick={() => handleOAuth("github")}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 border border-[#27272a] bg-[#050505] py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-white transition hover:border-[#e5ff00] hover:text-[#e5ff00]"
        >
          <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
          </svg>
          SIGN UP WITH GITHUB
        </button>

        <button
          type="button"
          data-testid="register-yahoo-btn"
          onClick={() => handleOAuth("yahoo")}
          disabled={loading}
          className="flex w-full items-center justify-center gap-3 border border-[#27272a] bg-[#050505] py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-white transition hover:border-[#e5ff00] hover:text-[#e5ff00]"
        >
          <span className="font-serif font-black text-purple-400">Y!</span>
          SIGN UP WITH YAHOO
        </button>
      </div>

      <div className="relative mb-6 text-center">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[#27272a]"></div>
        </div>
        <span className="relative bg-[#0a0a0a] px-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          OR REGISTER WITH EMAIL
        </span>
      </div>

      <form onSubmit={submit} className="space-y-6" data-testid="register-form">
        <div>
          <label className="label-caps" htmlFor="display_name">DISPLAY NAME</label>
          <input
            id="display_name"
            data-testid="register-display-name"
            required
            minLength={1}
            maxLength={48}
            value={form.display_name}
            onChange={set("display_name")}
            className="input-terminal"
            placeholder="DJ Static"
          />
        </div>
        <div>
          <label className="label-caps" htmlFor="username">PERMANENT USERNAME (URL HANDLE)</label>
          <input
            id="username"
            data-testid="register-username"
            required
            minLength={3}
            maxLength={24}
            pattern="[a-zA-Z0-9_]+"
            value={form.username}
            onChange={set("username")}
            className="input-terminal lowercase"
            placeholder="dj_static"
          />
          <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
            /channel/{form.username || "your-handle"} • Permanent Firestore Record
          </p>
        </div>
        <div>
          <label className="label-caps" htmlFor="email">EMAIL</label>
          <input
            id="email"
            data-testid="register-email"
            type="email"
            required
            value={form.email}
            onChange={set("email")}
            className="input-terminal"
            placeholder="dj@pirate.radio"
          />
        </div>
        <div>
          <label className="label-caps" htmlFor="password">PASSWORD</label>
          <input
            id="password"
            data-testid="register-password"
            type="password"
            required
            minLength={6}
            value={form.password}
            onChange={set("password")}
            className="input-terminal"
            placeholder="At least 6 characters"
          />
        </div>
        <button
          type="submit"
          data-testid="register-submit"
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? "PROVISIONING CHANNEL..." : "LOCK USERNAME & GO LIVE →"}
        </button>
      </form>
      <div className="mt-8 border-t border-[#27272a] pt-6 text-center font-mono text-xs uppercase tracking-widest text-zinc-500">
        ALREADY BROADCASTING?{" "}
        <Link to="/login" data-testid="link-to-login" className="text-[#e5ff00] hover:underline">
          LOG IN →
        </Link>
      </div>
    </AuthShell>
  );
}
