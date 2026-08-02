import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Bell, User } from "lucide-react";
import { api, fileUrl } from "@/lib/api";
import { toast } from "sonner";

function formatRelative(iso) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const lastIdRef = useRef(null);
  const rootRef = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get("/notifications", { params: { limit: 30 } });
      const newItems = Array.isArray(data?.items) ? data.items : [];
      // Detect newly arrived unread notifications and toast the top one
      if (items.length && newItems.length) {
        const newest = newItems[0];
        if (newest && !newest.read && newest.id !== lastIdRef.current) {
          const prevIds = new Set(items.map((i) => i.id));
          if (!prevIds.has(newest.id)) {
            toast.success(`@${newest.channel_username} IS LIVE`, {
              description: newest.stream_title || "Tap the bell to tune in.",
            });
          }
        }
      }
      if (newItems[0]) lastIdRef.current = newItems[0].id;
      setItems(newItems);
      setUnread(data?.unread_count || 0);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 12000);
    return () => clearInterval(t);
  }, []);

  // Close on outside click
  useEffect(() => {
    const onDoc = (e) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const onOpen = async () => {
    setOpen((v) => !v);
    if (!open && unread > 0) {
      try {
        const { data } = await api.post("/notifications/mark-read", {});
        setUnread(data.unread_count);
        setItems((prev) => prev.map((i) => ({ ...i, read: true })));
      } catch {
        // ignore
      }
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        data-testid="notification-bell"
        onClick={onOpen}
        className="relative flex h-10 w-10 items-center justify-center border border-[#27272a] transition-colors hover:border-white"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span
            data-testid="notification-unread-badge"
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center bg-[#e5ff00] px-1 font-mono text-[9px] font-bold text-black"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          data-testid="notification-dropdown"
          className="absolute right-0 top-12 z-50 w-[360px] border border-[#27272a] bg-[#050505] shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-[#27272a] px-4 py-3">
            <div className="label-caps mb-0">// NOTIFICATIONS</div>
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
              {items.length} recent
            </span>
          </div>
          <div className="max-h-[420px] overflow-y-auto">
            {items.length === 0 ? (
              <div className="py-12 text-center font-mono text-xs uppercase tracking-widest text-zinc-600">
                // NO NOTIFICATIONS
              </div>
            ) : (
              items.map((n) => (
                <Link
                  to={`/channel/${n.channel_username}`}
                  key={n.id}
                  data-testid={`notification-${n.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-start gap-3 border-b border-[#27272a] px-4 py-3 transition-colors last:border-0 hover:bg-[#0f0f0f]"
                >
                  {n.channel_photo_url ? (
                    <img
                      src={fileUrl(n.channel_photo_url)}
                      alt=""
                      className="h-10 w-10 flex-shrink-0 border border-[#27272a] object-cover grayscale"
                    />
                  ) : (
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-[#27272a]">
                      <User className="h-4 w-4 text-zinc-500" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="live-badge">
                        <span className="dot live-dot" /> LIVE
                      </span>
                      <span className="truncate font-mono text-[11px] uppercase tracking-widest text-white">
                        @{n.channel_username}
                      </span>
                    </div>
                    <div className="mt-1 truncate font-mono text-xs text-zinc-300">
                      {n.stream_title || `${n.channel_display_name} is broadcasting.`}
                    </div>
                    <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                      {formatRelative(n.created_at)}
                    </div>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
