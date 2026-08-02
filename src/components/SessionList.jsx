import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import HlsPlayer from "@/components/HlsPlayer";
import { Film, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";

function formatDuration(sec) {
  if (!sec) return "—";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${r}s`;
  return `${r}s`;
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function SessionList({ username, mine = false }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/channels/${username}/sessions`, { params: { limit: 20 } });
      setSessions(Array.isArray(data) ? data : []);
    } catch {
      setSessions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [username]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api.post("/channels/mine/sessions/refresh");
      await load();
      toast.success("Refreshed recordings.");
    } catch {
      toast.error("Could not refresh recordings.");
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="border border-[#27272a] bg-[#0a0a0a]" data-testid="session-list">
      <header className="flex items-center justify-between border-b border-[#27272a] px-4 py-3">
        <div className="flex items-center gap-2">
          <Film className="h-3.5 w-3.5 text-[#e5ff00]" />
          <div className="label-caps mb-0">// PAST SETS</div>
        </div>
        {mine && (
          <button
            data-testid="sessions-refresh"
            onClick={refresh}
            disabled={refreshing}
            className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-zinc-400 hover:text-white"
          >
            <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
            REFRESH
          </button>
        )}
      </header>

      {selected && (
        <div className="border-b border-[#27272a] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-mono text-[11px] uppercase tracking-widest text-zinc-400">
              PLAYING → {formatDate(selected.created_at)} · {formatDuration(selected.duration_sec)}
            </div>
            <button
              onClick={() => setSelected(null)}
              data-testid="close-vod"
              className="font-mono text-[10px] uppercase tracking-widest text-zinc-500 hover:text-white"
            >
              CLOSE
            </button>
          </div>
          <HlsPlayer playbackId={selected.playback_id} isLive={true} muted={false} autoPlay />
        </div>
      )}

      <div className="max-h-[420px] overflow-y-auto">
        {loading ? (
          <div className="p-4 font-mono text-xs uppercase tracking-widest text-zinc-600">
            LOADING…
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-8 text-center">
            <div className="font-mono text-xs uppercase tracking-widest text-zinc-600">
              // NO RECORDED SETS YET
            </div>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-700">
              Broadcast something and it&apos;ll show up here.
            </p>
          </div>
        ) : (
          sessions.map((s, idx) => (
            <button
              key={s.session_id || s.id || `session-${idx}`}
              onClick={() => setSelected(s)}
              data-testid={`session-${s.session_id || idx}`}
              className="flex w-full items-center gap-3 border-b border-[#27272a] px-4 py-3 text-left transition-colors last:border-0 hover:bg-[#0f0f0f]"
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-[#27272a] bg-black">
                <Film className="h-4 w-4 text-zinc-500" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-xs uppercase tracking-widest text-white">
                  SET · {formatDate(s.created_at)}
                </div>
                <div className="mt-0.5 flex items-center gap-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(s.duration_sec)}
                  </span>
                  <span>{s.recording_status || "ready"}</span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
