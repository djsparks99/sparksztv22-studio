import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  addDoc,
} from "firebase/firestore";
import { Radio, Send, Zap, ChevronUp, ChevronDown, MessageSquare } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_SHOUTS = [
  { id: "def1", sender_username: "PIRATE_HQ", text: "SPARKZ.TV FREQUENCY // ALL TRANSMITTERS ONLINE", created_at: new Date().toISOString() },
  { id: "def2", sender_username: "SIGNAL_CHECK", text: "DROP A SHOUTOUT TO BROADCAST LIVE ON THE TICKER!", created_at: new Date().toISOString() },
  { id: "def3", sender_username: "cyber_ghost", text: "Locked into the underground frequency. Turn it up! 🔊", created_at: new Date().toISOString() },
  { id: "def4", sender_username: "bassline_head", text: "Shoutouts to all DJs keeping the signal loud tonight 📻", created_at: new Date().toISOString() },
];

export default function FrequencyShoutboxTicker() {
  const { user } = useAuth();
  const [shouts, setShouts] = useState([]);
  const [text, setText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isInputOpen, setIsInputOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Set CSS variable for sidebar top offset based on ticker visibility
  useEffect(() => {
    if (isMinimized) {
      document.documentElement.style.setProperty("--ticker-height", "0px");
    } else {
      document.documentElement.style.setProperty("--ticker-height", "37px");
    }
    return () => {
      document.documentElement.style.setProperty("--ticker-height", "0px");
    };
  }, [isMinimized]);

  // Subscribe to live shoutbox feed from Firestore
  useEffect(() => {
    let unsubscribe;
    try {
      const q = query(
        collection(db, "shoutbox"),
        orderBy("created_at", "desc"),
        limit(25)
      );
      unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const list = snapshot.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));
          setShouts(list);
        },
        (error) => {
          console.error("Firestore shoutbox ticker listener error:", error);
        }
      );
    } catch (err) {
      console.error("Failed to set up shoutbox listener:", err);
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Combine real shouts with defaults if list is small
  const displayShouts = shouts.length > 0 ? shouts : DEFAULT_SHOUTS;
  // Duplicate array so marquee scroll is seamless across wide screens
  const marqueeItems = [...displayShouts, ...displayShouts, ...displayShouts, ...displayShouts];

  const handleSubmitShout = async (e) => {
    e.preventDefault();
    const cleanText = text.trim();
    if (!cleanText) return;

    if (!user) {
      toast.error("PLEASE LOG IN TO DROP A FREQUENCY SHOUT");
      return;
    }

    setIsSubmitting(true);
    try {
      await addDoc(collection(db, "shoutbox"), {
        text: cleanText.slice(0, 140),
        sender_username: user.username || "broadcaster",
        sender_display_name: user.display_name || user.username || "Broadcaster",
        created_at: new Date().toISOString(),
      });

      setText("");
      setIsInputOpen(false);
      toast.success("SIGNAL SENT: SHOUT BROADCASTED LIVE");
    } catch (err) {
      console.error("Error posting shout:", err);
      toast.error("FAILED TO TRANSMIT SHOUT. TRY AGAIN.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isMinimized) {
    return (
      <div className="fixed bottom-4 right-4 z-40" data-testid="shoutbox-minimized-pill">
        <button
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 border border-[#e5ff00] bg-black px-3 py-1.5 font-mono text-xs uppercase tracking-wider text-[#e5ff00] shadow-lg hover:bg-[#e5ff00] hover:text-black transition-colors"
          title="Open Pirate Radio Ticker"
        >
          <Radio className="h-3.5 w-3.5 animate-pulse" />
          <span>SHOUTBOX TICKER</span>
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className="sticky top-16 z-35 border-b border-[#27272a] bg-[#030303] text-white select-none transition-all"
      data-testid="pirate-radio-ticker-bar"
    >
      <div className="flex h-[37px] items-center justify-between">
        {/* Left Badge: Frequency Status */}
        <div className="flex h-full shrink-0 items-center gap-2 border-r border-[#27272a] bg-[#09090b] px-3">
          <div className="relative flex h-2 w-2 items-center justify-center">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e5ff00] opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#e5ff00]" />
          </div>
          <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[#e5ff00]">
            SHOUTBOX
          </span>
        </div>

        {/* Center: Scrolling Marquee Feed */}
        <div className="group relative flex h-full flex-1 items-center overflow-hidden" data-testid="ticker-marquee-wrapper">
          <div className="marquee-track flex items-center group-hover:[animation-play-state:paused]">
            {marqueeItems.map((item, idx) => (
              <div
                key={`${item.id}-${idx}`}
                className="mx-6 flex shrink-0 items-center gap-2 font-mono text-xs"
              >
                <Zap className="h-3 w-3 text-[#e5ff00] opacity-80" />
                <span className="font-bold text-[#e5ff00]">
                  @{item.sender_username}:
                </span>
                <span className="text-zinc-200">"{item.text}"</span>
                <span className="ml-2 text-zinc-600">///</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right Actions: Interactive Shoutbox Drop Button & Minimize */}
        <div className="flex h-full shrink-0 items-center gap-2 border-l border-[#27272a] bg-[#09090b] px-3">
          {user ? (
            <button
              onClick={() => setIsInputOpen(!isInputOpen)}
              data-testid="toggle-shoutbox-input-btn"
              className={`flex items-center gap-1.5 border px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider transition-colors ${
                isInputOpen
                  ? "border-[#e5ff00] bg-[#e5ff00] text-black font-bold"
                  : "border-[#27272a] bg-black text-zinc-200 hover:border-[#e5ff00] hover:text-[#e5ff00]"
              }`}
            >
              <MessageSquare className="h-3 w-3" />
              <span>{isInputOpen ? "CLOSE" : "DROP SHOUT"}</span>
            </button>
          ) : (
            <Link
              to="/login"
              data-testid="shoutbox-login-link"
              className="flex items-center gap-1 border border-[#27272a] bg-black px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-zinc-300 hover:border-[#e5ff00] hover:text-[#e5ff00] transition-colors"
            >
              <Radio className="h-3 w-3 text-[#e5ff00]" />
              <span>LOGIN TO SHOUT</span>
            </Link>
          )}

          <button
            onClick={() => setIsMinimized(true)}
            data-testid="minimize-ticker-btn"
            className="flex h-6 w-6 items-center justify-center border border-[#27272a] bg-black text-zinc-400 hover:border-zinc-500 hover:text-white transition-colors"
            title="Minimize Ticker"
          >
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Expandable Minimalist Input Panel */}
      {isInputOpen && user && (
        <div
          className="border-t border-[#27272a] bg-[#0a0a0c] p-3 transition-all"
          data-testid="shoutbox-input-panel"
        >
          <form onSubmit={handleSubmitShout} className="flex flex-col sm:flex-row items-center gap-2">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 shrink-0">
              <span className="text-[#e5ff00] font-bold">@{user.username}:</span>
            </div>
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={140}
              placeholder="Type signal check, shoutout, or track nod (max 140 chars)..."
              disabled={isSubmitting}
              autoFocus
              data-testid="shoutbox-text-input"
              className="flex-1 w-full border border-[#27272a] bg-black px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-500 focus:border-[#e5ff00] focus:outline-none"
            />
            <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
              <span className="font-mono text-[10px] text-zinc-500">
                {140 - text.length}
              </span>
              <button
                type="submit"
                disabled={isSubmitting || !text.trim()}
                data-testid="shoutbox-submit-btn"
                className="flex items-center gap-1.5 border border-[#e5ff00] bg-[#e5ff00] px-4 py-1.5 font-mono text-xs font-bold text-black hover:bg-black hover:text-[#e5ff00] disabled:opacity-40 transition-colors"
              >
                <Send className="h-3 w-3" />
                <span>{isSubmitting ? "TRANSMITTING..." : "BROADCAST"}</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
