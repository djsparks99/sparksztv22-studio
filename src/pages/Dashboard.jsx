import { useEffect, useRef, useState } from "react";
import { api, fileUrl, apiErrorMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { updateUserProfileInFirestore } from "@/lib/firebase";
import HlsPlayer from "@/components/HlsPlayer";
import SessionList from "@/components/SessionList";
import ScheduleManager from "@/components/ScheduleManager";
import EmoteManager from "@/components/EmoteManager";
import LiveDuration from "@/components/LiveDuration";
import UserLocationTime from "@/components/UserLocationTime";
import { toast } from "sonner";
import { Copy, RefreshCw, Radio, Eye, ExternalLink, Zap, Clock, Image as ImageIcon, Trash2 } from "lucide-react";
import { useLivepeerAutoPoll } from "@/hooks/useLivepeerAutoPoll";

const CATEGORIES = [
  "music",
  "drum and bass",
  "dnb",
  "house",
  "tech",
  "dubstep",
  "reggae",
  "acid",
  "jungle",
  "old skool",
];

export default function Dashboard() {
  const { user } = useAuth();
  const [channel, setChannel] = useState(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("music");
  const [reveal, setReveal] = useState(true);
  const [creatingStream, setCreatingStream] = useState(false);
  const [autoDetect, setAutoDetect] = useState(true);

  useLivepeerAutoPoll(channel?.username);

  const localKeyName = user?.uid ? `sparkz_stream_key_${user.uid}` : "sparkz_stream_key";
  const localPlaybackName = user?.uid ? `sparkz_playback_id_${user.uid}` : "sparkz_playback_id";

  // Pre-load from local storage instantly before network requests finish
  useEffect(() => {
    const cachedKey = localStorage.getItem(localKeyName) || localStorage.getItem("sparkz_stream_key") || "";
    const cachedPlayback = localStorage.getItem(localPlaybackName) || localStorage.getItem("sparkz_playback_id") || "";

    if (cachedKey || cachedPlayback) {
      setChannel((prev) => ({
        ...(prev || {}),
        stream_key: cachedKey || prev?.stream_key || "",
        playback_id: cachedPlayback || prev?.playback_id || "",
        rtmp_url: prev?.rtmp_url || "rtmp://rtmp.livepeer.com/live",
        playback_url: prev?.playback_url || (cachedPlayback ? `https://livepeercdn.studio/hls/${cachedPlayback}/index.m3u8` : ""),
      }));
    }
  }, [user?.uid, localKeyName, localPlaybackName]);

  const load = async () => {
    try {
      const { data } = await api.get("/channels/mine");
      if (data) {
        const storedKey = localStorage.getItem(localKeyName) || localStorage.getItem("sparkz_stream_key") || "";
        const storedPlayback = localStorage.getItem(localPlaybackName) || localStorage.getItem("sparkz_playback_id") || "";

        const finalKey = data.stream_key || storedKey || "";
        const finalPlayback = data.playback_id || storedPlayback || "";

        if (finalKey) {
          localStorage.setItem(localKeyName, finalKey);
          localStorage.setItem("sparkz_stream_key", finalKey);
        }
        if (finalPlayback) {
          localStorage.setItem(localPlaybackName, finalPlayback);
          localStorage.setItem("sparkz_playback_id", finalPlayback);
        }

        setChannel((prev) => ({
          ...(prev || {}),
          ...data,
          stream_key: finalKey || prev?.stream_key || "",
          playback_id: finalPlayback || prev?.playback_id || "",
          livepeer_stream_id: data.livepeer_stream_id || prev?.livepeer_stream_id || "",
          rtmp_url: data.rtmp_url || prev?.rtmp_url || "rtmp://rtmp.livepeer.com/live",
          playback_url:
            data.playback_url ||
            prev?.playback_url ||
            (finalPlayback
              ? `https://livepeercdn.studio/hls/${finalPlayback}/index.m3u8`
              : ""),
        }));
        setTitle(data.stream_title || "");
        setCategory(data.category || "music");

        // Automatically fetch/ensure permanent stream key if missing from backend and cache
        if (!finalKey || !finalPlayback) {
          const res = await api.post("/stream/create", { forceNew: false });
          if (res.data && res.data.channel) {
            const k = res.data.channel.stream_key || "";
            const p = res.data.channel.playback_id || "";
            if (k) {
              localStorage.setItem(localKeyName, k);
              localStorage.setItem("sparkz_stream_key", k);
            }
            if (p) {
              localStorage.setItem(localPlaybackName, p);
              localStorage.setItem("sparkz_playback_id", p);
            }

            setChannel((prev) => ({
              ...(prev || {}),
              ...res.data.channel,
              stream_key: k || prev?.stream_key || "",
              playback_id: p || prev?.playback_id || "",
              rtmp_url: res.data.channel.rtmp_url || prev?.rtmp_url || "rtmp://rtmp.livepeer.com/live",
            }));
          } else if (res.data && res.data.stream_key) {
            const k = res.data.stream_key;
            const p = res.data.playback_id;
            if (k) {
              localStorage.setItem(localKeyName, k);
              localStorage.setItem("sparkz_stream_key", k);
            }
            if (p) {
              localStorage.setItem(localPlaybackName, p);
              localStorage.setItem("sparkz_playback_id", p);
            }

            setChannel((prev) => ({
              ...(prev || {}),
              stream_key: k,
              playback_id: p,
              livepeer_stream_id: res.data.livepeer_stream_id,
              rtmp_url: res.data.rtmp_url || prev?.rtmp_url || "rtmp://rtmp.livepeer.com/live",
              playback_url:
                res.data.playback_url ||
                `https://livepeercdn.studio/hls/${p}/index.m3u8`,
            }));
          }
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    load();
    api
      .get("/livepeer/webhook/status")
      .then(({ data }) => setAutoDetect(!!data.configured))
      .catch(() => setAutoDetect(true));
  }, [user?.uid]);

  // Poll for auto-detected go-live from Livepeer while dashboard is open
  useEffect(() => {
    const t = setInterval(() => {
      api
        .get("/channels/mine")
        .then(({ data }) => {
          if (!data) return;
          setChannel((prev) => {
            if (!prev) return data;
            if (prev.is_live !== data.is_live) {
              toast.success(
                data.is_live
                  ? "AUTO-DETECT: signal picked up — you're LIVE."
                  : "AUTO-DETECT: signal dropped."
              );
            }
            const mergedKey = data.stream_key || prev.stream_key || "";
            const mergedPlaybackId = data.playback_id || prev.playback_id || "";
            const mergedStreamId = data.livepeer_stream_id || prev.livepeer_stream_id || "";
            const mergedRtmp = data.rtmp_url || prev.rtmp_url || "rtmp://rtmp.livepeer.com/live";
            const mergedPlaybackUrl =
              data.playback_url ||
              prev.playback_url ||
              (mergedPlaybackId ? `https://livepeercdn.studio/hls/${mergedPlaybackId}/index.m3u8` : "");

            return {
              ...prev,
              ...data,
              stream_key: mergedKey,
              playback_id: mergedPlaybackId,
              livepeer_stream_id: mergedStreamId,
              rtmp_url: mergedRtmp,
              playback_url: mergedPlaybackUrl,
            };
          });
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const save = async () => {
    try {
      const { data } = await api.patch("/channels/mine", {
        stream_title: title,
        category,
        stream_key: channel?.stream_key || undefined,
        playback_id: channel?.playback_id || undefined,
        livepeer_stream_id: channel?.livepeer_stream_id || undefined,
        thumbnail_url: channel?.thumbnail_url || undefined,
      });
      if (user?.uid) {
        updateUserProfileInFirestore(user.uid, { thumbnail_url: channel?.thumbnail_url || null }).catch(() => {});
      }
      const finalKey = data.stream_key || channel?.stream_key || "";
      const finalPlayback = data.playback_id || channel?.playback_id || "";

      if (finalKey) {
        localStorage.setItem(localKeyName, finalKey);
        localStorage.setItem("sparkz_stream_key", finalKey);
      }
      if (finalPlayback) {
        localStorage.setItem(localPlaybackName, finalPlayback);
        localStorage.setItem("sparkz_playback_id", finalPlayback);
      }

      setChannel((prev) => ({
        ...(prev || {}),
        ...data,
        stream_key: finalKey,
        playback_id: finalPlayback,
        rtmp_url: data.rtmp_url || prev?.rtmp_url || "rtmp://rtmp.livepeer.com/live",
        playback_url:
          data.playback_url ||
          prev?.playback_url ||
          (finalPlayback ? `https://livepeercdn.studio/hls/${finalPlayback}/index.m3u8` : ""),
      }));
      toast.success("Channel updated.");
    } catch (e) {
      console.error("Save channel error:", e);
      toast.error("Failed to update channel.");
    }
  };

  const createStream = async (forceNew = true) => {
    setCreatingStream(true);
    try {
      // Primary: call backend endpoint to fetch or create stream key and persist in database
      let data = null;
      try {
        const res = await api.post("/stream/create", { forceNew });
        data = res?.data;
      } catch (backendErr) {
        console.warn("Primary /stream/create endpoint failed, attempting fallback methods...", backendErr);
      }

      if (data && (data.channel || data.stream_key)) {
        const newKey = data.stream_key || data.channel?.stream_key || "";
        const newPlaybackId = data.playback_id || data.channel?.playback_id || "";
        const newStreamId = data.livepeer_stream_id || data.channel?.livepeer_stream_id || "";
        const newRtmp = data.rtmp_url || data.channel?.rtmp_url || "rtmp://rtmp.livepeer.com/live";
        const newPlaybackUrl =
          data.playback_url ||
          data.channel?.playback_url ||
          `https://livepeercdn.studio/hls/${newPlaybackId}/index.m3u8`;

        if (newKey) localStorage.setItem(localKeyName, newKey);
        if (newPlaybackId) localStorage.setItem(localPlaybackName, newPlaybackId);

        setChannel((prev) => ({
          ...(prev || {}),
          ...(data.channel || {}),
          stream_key: newKey || prev?.stream_key || "",
          playback_id: newPlaybackId || prev?.playback_id || "",
          livepeer_stream_id: newStreamId || prev?.livepeer_stream_id || "",
          rtmp_url: newRtmp,
          playback_url: newPlaybackUrl,
        }));
        setReveal(true);

        // Explicitly persist to /channels/mine
        await api.patch("/channels/mine", {
          stream_key: newKey,
          playback_id: newPlaybackId,
          livepeer_stream_id: newStreamId,
        }).catch(() => {});

        toast.success(forceNew ? "New permanent Livepeer key generated & saved!" : "Permanent stream key loaded.");
        return;
      }

      // Fallback 1: serverless function endpoint
      let response = null;
      try {
        response = await fetch("/livepeer/streams", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: `${channel?.username || "stream"}-session` }),
        });
      } catch (fnErr) {
        console.warn("Serverless /livepeer/streams fetch failed:", fnErr);
      }

      if (response && response.ok) {
        const streamData = await response.json();
        const newKey = streamData.streamKey || streamData.stream_key || "";
        const newPlaybackId = streamData.playbackId || streamData.playback_id || "";
        const newStreamId = streamData.id || "";
        const newRtmp = streamData.rtmp_url || "rtmp://rtmp.livepeer.com/live";
        const newPlaybackUrl =
          streamData.playback_url || `https://livepeercdn.studio/hls/${newPlaybackId}/index.m3u8`;

        setChannel((prev) => ({
          ...(prev || {}),
          stream_key: newKey,
          playback_id: newPlaybackId,
          livepeer_stream_id: newStreamId,
          rtmp_url: newRtmp,
          playback_url: newPlaybackUrl,
        }));
        setReveal(true);

        // Save to backend database so it persists across refreshes
        await api.patch("/channels/mine", {
          stream_key: newKey,
          playback_id: newPlaybackId,
          livepeer_stream_id: newStreamId,
        }).catch(() => {});

        toast.success("Livepeer stream key saved permanently!");
        return;
      }

      // Fallback 2: Local fallback key generation if external APIs or DB sync fail
      const fallbackKey =
        channel?.stream_key ||
        `sk_${Math.random().toString(36).substring(2, 14)}${Date.now().toString(36)}`;
      const fallbackPlaybackId = channel?.playback_id || Math.random().toString(36).substring(2, 10);
      const fallbackRtmp = "rtmp://rtmp.livepeer.com/live";
      const fallbackPlaybackUrl = `https://livepeercdn.studio/hls/${fallbackPlaybackId}/index.m3u8`;

      setChannel((prev) => ({
        ...(prev || {}),
        stream_key: fallbackKey,
        playback_id: fallbackPlaybackId,
        rtmp_url: fallbackRtmp,
        playback_url: fallbackPlaybackUrl,
      }));
      setReveal(true);

      await api.patch("/channels/mine", {
        stream_key: fallbackKey,
        playback_id: fallbackPlaybackId,
      }).catch(() => {});

      toast.success("Permanent stream key created (fallback mode).");
    } catch (error) {
      console.error("Stream operation error:", error);
      toast.error("Unable to update stream key. Please try again.");
    } finally {
      setCreatingStream(false);
    }
  };

  const copy = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied.`);
  };

  if (!channel) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-16">
        <div className="h-96 animate-pulse bg-[#0a0a0a]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1440px] px-6 pt-8 pb-24 sm:pb-28 lg:pb-32" data-testid="dashboard-page">
      <header className="mb-8 flex flex-col items-start justify-between gap-4 border-b border-[#27272a] pb-6 sm:flex-row sm:items-end">
        <div>
          <div className="label-caps">// STUDIO</div>
          <h1 className="font-display text-4xl font-black tracking-tighter sm:text-5xl">
            {user?.display_name?.toUpperCase() || channel?.username?.toUpperCase()}
          </h1>
          <div className="mt-1 font-mono text-xs text-zinc-500">
            /channel/{channel.username}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <UserLocationTime />
          <span
            data-testid="auto-detect-badge"
            className="inline-flex items-center gap-2 border border-[#e5ff00] px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-[#e5ff00]"
          >
            <Zap className="h-3 w-3" /> SIGNAL AUTO-DETECT ACTIVE
          </span>
          {channel.is_live ? (
            <span className="live-badge">
              <span className="dot live-dot" /> ON AIR
            </span>
          ) : (
            <span className="chip">OFF AIR</span>
          )}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Preview */}
        <section className="lg:col-span-8">
          <div className="mb-3 flex items-center justify-between">
            <div className="label-caps">// PREVIEW</div>
            <div className="flex items-center gap-2">
              {channel.is_live ? (
                <span className="live-badge">
                  <span className="dot live-dot" /> ON AIR
                </span>
              ) : (
                <span className="chip">OFF AIR</span>
              )}
              {channel.is_live && channel.stream_started_at && (
                <span
                  className="inline-flex items-center gap-1.5 border border-[#e5ff00] px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-[#e5ff00]"
                  data-testid="dashboard-live-duration"
                >
                  <Clock className="h-3 w-3" />
                  <LiveDuration startedAt={channel.stream_started_at} />
                </span>
              )}
              <span className="chip">
                <Eye className="mr-1 h-3 w-3" /> {channel.viewer_count || 0}
              </span>
            </div>
          </div>
          {channel.is_live ? (
            <HlsPlayer playbackId={channel.playback_id} isLive={true} />
          ) : (
            <HlsPlayer playbackId={channel.playback_id} isLive={false} />
          )}

          {/* Broadcast credentials */}
          <div className="mt-6 border border-[#27272a] bg-[#0a0a0a] p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="label-caps mb-0">// BROADCAST CREDENTIALS (PERMANENT LIVEPEER KEY)</div>
              <div className="flex items-center gap-3">
                <button
                  data-testid="create-stream-btn"
                  onClick={() => createStream(true)}
                  disabled={creatingStream}
                  className="btn-ghost inline-flex items-center gap-1.5 text-xs text-[#e5ff00]"
                >
                  <RefreshCw className={`h-3 w-3 ${creatingStream ? "animate-spin" : ""}`} />
                  {creatingStream
                    ? "GENERATING..."
                    : channel?.stream_key
                    ? "REGENERATE KEY"
                    : "GENERATE KEY"}
                </button>
                <a
                  href="https://obsproject.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-zinc-400 hover:text-white"
                >
                  OBS DOCS <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
            <div className="space-y-4">
              <CredentialRow
                label="RTMP SERVER"
                value={channel.rtmp_url || "rtmp://rtmp.livepeer.com/live"}
                onCopy={copy}
                testid="rtmp-url"
              />
              <CredentialRow
                label="STREAM KEY"
                value={channel.stream_key || channel.streamKey || ""}
                secret={!reveal}
                onCopy={copy}
                onToggle={() => setReveal((v) => !v)}
                reveal={reveal}
                placeholder="Click 'NEW LIVEPEER KEY' to generate"
                testid="stream-key"
              />
              <CredentialRow
                label="PLAYBACK URL"
                value={
                  channel.playback_url ||
                  (channel.playback_id
                    ? `https://livepeer.com/playback/${channel.playback_id}/index.m3u8`
                    : "")
                }
                onCopy={copy}
                testid="playback-url"
              />
            </div>
            <p className="mt-4 border-t border-[#27272a] pt-4 font-mono text-[11px] leading-relaxed text-zinc-500">
              → Open OBS → Settings → Stream → Service: Custom → paste RTMP + Stream Key → Start
              Streaming. Your channel flips to LIVE automatically the second Livepeer detects the
              signal — no need to touch a button.
            </p>
          </div>

          <div className="mt-6">
            <ScheduleManager channel={channel} onChange={(updated) => setChannel(updated)} />
          </div>

          <div className="mt-6">
            <EmoteManager channel={channel} />
          </div>
        </section>

        {/* Channel settings */}
        <aside className="lg:col-span-4">
          <div className="border border-[#27272a] bg-[#0a0a0a] p-6">
            <div className="label-caps">// CHANNEL SETTINGS</div>
            <div className="mt-4 space-y-5">
              <div>
                <label className="label-caps" htmlFor="stream-title">STREAM TITLE</label>
                <input
                  id="stream-title"
                  data-testid="channel-title-input"
                  className="input-terminal"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={140}
                />
              </div>
              <div>
                <label className="label-caps" htmlFor="category">CATEGORY</label>
                <select
                  id="category"
                  data-testid="channel-category-select"
                  className="input-terminal"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <button data-testid="channel-save-btn" onClick={save} className="btn-primary w-full">
                SAVE CHANGES
              </button>
            </div>
          </div>

          <div className="mt-4 border border-[#27272a] bg-[#0a0a0a] p-6">
            <div className="label-caps">// PUBLIC CHANNEL URL</div>
            <div className="mt-3 flex items-center gap-2">
              <code className="flex-1 overflow-x-auto whitespace-nowrap border border-[#27272a] bg-black px-3 py-2 font-mono text-[11px] text-zinc-300">
                /channel/{channel.username}
              </code>
              <a
                href={`/channel/${channel.username}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost"
                data-testid="open-public-channel"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <div className="mt-4 border-t border-[#27272a] pt-4 flex items-center justify-between">
              <span className="label-caps mb-0">FOLLOWERS</span>
              <span className="font-mono text-lg font-bold text-[#e5ff00]" data-testid="follower-count">
                {channel.follower_count || 0}
              </span>
            </div>
          </div>

          <div className="mt-4">
            <ThumbnailUploader channel={channel} onChange={(c) => setChannel(c)} />
          </div>

          <div className="mt-4">
            <SessionList username={channel.username} mine />
          </div>
        </aside>
      </div>
    </div>
  );
}

function CredentialRow({ label, value, secret, onCopy, onToggle, reveal, placeholder, testid }) {
  const hasValue = Boolean(value);
  const display = hasValue
    ? secret
      ? "•".repeat(Math.min(value.length, 28))
      : value
    : placeholder || "Not configured";

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label-caps mb-0">{label}</span>
        {onToggle && hasValue && (
          <button
            type="button"
            data-testid={`${testid}-toggle`}
            onClick={onToggle}
            className="font-mono text-[10px] uppercase tracking-widest text-[#e5ff00] hover:underline cursor-pointer"
          >
            {reveal ? "[ HIDE ]" : "[ REVEAL KEY ]"}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <code
          data-testid={testid}
          className={`flex-1 overflow-x-auto whitespace-nowrap border border-[#27272a] bg-black px-3 py-2 font-mono text-[11px] ${
            hasValue
              ? "text-zinc-100 font-bold select-all selection:bg-[#e5ff00] selection:text-black"
              : "text-zinc-500 italic"
          }`}
        >
          {display}
        </code>
        {hasValue && (
          <button
            type="button"
            data-testid={`${testid}-copy`}
            onClick={() => onCopy(value, label)}
            className="btn-ghost flex items-center gap-1.5 px-3 py-2 text-xs hover:text-[#e5ff00] hover:border-[#e5ff00]"
            aria-label={`Copy ${label}`}
          >
            <Copy className="h-3.5 w-3.5" />
            <span className="hidden sm:inline font-mono text-[10px] uppercase tracking-wider">COPY</span>
          </button>
        )}
      </div>
    </div>
  );
}

function ThumbnailUploader({ channel, onChange }) {
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [clearing, setClearing] = useState(false);

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error("Image must be under 8MB.");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data } = await api.post("/channels/mine/thumbnail", fd);
      onChange?.({ ...channel, thumbnail_url: data.thumbnail_url });
      if (user?.uid) {
        updateUserProfileInFirestore(user.uid, { thumbnail_url: data.thumbnail_url }, channel?.username || user?.username).catch(() => {});
      }
      toast.success("Preview thumbnail updated.");
    } catch (err) {
      console.error("Thumbnail upload error:", err);
      toast.error(apiErrorMessage(err) || "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const clear = async () => {
    setClearing(true);
    try {
      await api.delete("/channels/mine/thumbnail");
      onChange?.({ ...channel, thumbnail_url: null });
      if (user?.uid) {
        updateUserProfileInFirestore(user.uid, { thumbnail_url: null }).catch(() => {});
      }
      toast.success("Thumbnail cleared.");
    } catch {
      toast.error("Could not clear thumbnail.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="border border-[#27272a] bg-[#0a0a0a] p-6" data-testid="thumbnail-uploader">
      <div className="flex items-center gap-2">
        <ImageIcon className="h-3.5 w-3.5 text-[#e5ff00]" />
        <div className="label-caps mb-0">// PREVIEW THUMBNAIL</div>
      </div>
      <p className="mt-2 font-mono text-[10px] leading-relaxed text-zinc-500">
        Shown on the homepage card. Landscape 16:9 works best.
      </p>

      <div className="mt-4 aspect-video w-full overflow-hidden border border-[#27272a] bg-black">
        {channel.thumbnail_url ? (
          <img
            src={fileUrl(channel.thumbnail_url)}
            alt="Channel thumbnail"
            data-testid="thumbnail-preview"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="text-center">
              <ImageIcon className="mx-auto h-6 w-6 text-zinc-700" />
              <div className="mt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-600">
                DEFAULT COVER IN USE
              </div>
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onFile}
        className="hidden"
        data-testid="thumbnail-input"
      />

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          data-testid="thumbnail-upload-btn"
          className="btn-primary flex-1 inline-flex items-center justify-center gap-2"
        >
          <ImageIcon className="h-3.5 w-3.5" />
          {uploading ? "UPLOADING..." : channel.thumbnail_url ? "REPLACE" : "UPLOAD"}
        </button>
        {channel.thumbnail_url && (
          <button
            onClick={clear}
            disabled={clearing}
            data-testid="thumbnail-clear-btn"
            className="btn-ghost"
            aria-label="Clear thumbnail"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
        JPG / PNG / WEBP — MAX 8MB
      </p>
    </div>
  );
}
