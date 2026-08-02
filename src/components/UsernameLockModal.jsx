import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Lock, Sparkles, ShieldAlert } from "lucide-react";

export default function UsernameLockModal() {
  const { needsUsername, completeUsernameLock, pendingFirebaseUser } = useAuth();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState(pendingFirebaseUser?.displayName || "");
  const [loading, setLoading] = useState(false);

  if (!needsUsername) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    const cleanU = username.toLowerCase().trim();
    if (!cleanU || !/^[a-zA-Z0-9_]+$/.test(cleanU)) {
      toast.error("Username must be alphanumeric or underscores only");
      return;
    }
    setLoading(true);
    try {
      const res = await completeUsernameLock(cleanU, displayName || cleanU);
      if (res.ok) {
        toast.success("Permanent username locked into Firestore!");
      } else {
        toast.error(res.error || "Failed to save username");
      }
    } catch (err) {
      toast.error(err.message || "Failed to save username");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      data-testid="username-lock-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
    >
      <div className="w-full max-w-md border border-[#27272a] bg-[#0a0a0a] p-6 shadow-2xl sm:p-8">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#e5ff00]">
          <Lock className="h-4 w-4" />
          // ONE-TIME REGISTRATION
        </div>
        <h2 className="mt-2 font-display text-2xl font-black uppercase text-white sm:text-3xl">
          PERMANENT USERNAME LOCK
        </h2>
        <p className="mt-2 text-xs text-zinc-400">
          Welcome to Sparkz.TV! Choose your permanent broadcaster handle. Once saved to Firestore, this username is locked permanently and can never be reset or changed.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label-caps mb-1 block text-zinc-300" htmlFor="lock-display-name">
              DISPLAY NAME
            </label>
            <input
              id="lock-display-name"
              data-testid="username-lock-display-name-input"
              type="text"
              required
              minLength={1}
              maxLength={48}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="input-terminal w-full text-white"
              placeholder="e.g. DJ Sparkz"
            />
          </div>

          <div>
            <label className="label-caps mb-1 block text-zinc-300" htmlFor="lock-username">
              PERMANENT USERNAME (URL HANDLE)
            </label>
            <input
              id="lock-username"
              data-testid="username-lock-input"
              type="text"
              required
              minLength={3}
              maxLength={24}
              pattern="[a-zA-Z0-9_]+"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="input-terminal w-full text-[#e5ff00] lowercase"
              placeholder="e.g. sparkz_live"
            />
            <p className="mt-1 font-mono text-[10px] text-zinc-500">
              Your channel URL: /channel/{username || "your_handle"}
            </p>
          </div>

          <div className="flex items-start gap-2.5 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div>
              <span className="font-bold">Permanent Firestore Lock:</span> Once set, this handle is saved to your Firestore profile record and locked to prevent unwanted changes across sessions.
            </div>
          </div>

          <button
            type="submit"
            data-testid="username-lock-submit-btn"
            disabled={loading}
            className="btn-primary w-full flex items-center justify-center gap-2 text-sm"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? "SAVING TO FIRESTORE..." : "LOCK IN PERMANENT USERNAME →"}
          </button>
        </form>
      </div>
    </div>
  );
}
