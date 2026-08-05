import { useEffect, useRef, useState } from "react";
import { api, fileUrl, apiErrorMessage, fileToBase64 } from "@/lib/api";
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
  const [reveal, setReveal] = useState(false);
  const [creatingStream, setCreatingStream] = useState(false);
  const [autoDetect, setAutoDetect] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useLivepeerAutoPoll(channel?.username);

  const load = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get("/channels/mine", {
        params: {
          uid: user.uid,
          username: user.username
        },
        headers: {
          "x-user-uid": user.uid || "",
          "x-username": user.username || ""
        }
      });
      if (data) {
        setChannel(data);
        setTitle(data.stream_title || "");
        setCategory(data.category || "music");
      } else {
        setError("No channel metadata returned from server.");
      }
    } catch (e) {
      console.error("Dashboard load channel error:", e);
      setError(apiErrorMessage(e) || "Failed to load channel data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      load();
      api
        .get("/livepeer/webhook/status")
        .then(({ data }) => setAutoDetect(!!data.configured))
        .catch(() => setAutoDetect(true));
    } else if (user === null) {
      setLoading(false);
    }
  }, [user]);

  // Poll for auto-detected go-live status while dashboard is open
  useEffect(() => {
    const t = setInterval(() => {
      api
        .get("/channels/mine", {
          params: {
            uid: user.uid,
            username: user.username
          },
          headers: {
            "x-user-uid": user.uid || "",
            "x-username": user.username || ""
          }
        })
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
            return {
              ...prev,
              ...data,
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

      const updatedChannel = {
        ...(channel || {}),
        ...data,
      };
      setChannel(updatedChannel);
      window.dispatchEvent(new CustomEvent("channel-updated", { detail: { channel: updatedChannel } }));
      toast.success("Channel updated.");
    } catch (e) {
      console.error("Save channel error:", e);
      toast.error("Failed to update channel.");
    }
  };

  const createStream = async (forceNew = true) => {
    setCreatingStream(true);
    try {
      const { data } = await api.post("/stream/create", { forceNew });
      if (data) {
        setChannel((prev) => ({
          ...(prev || {}),
          ...data,
        }));
        setReveal(true);
        toast.success("Stream credentials synchronized.");
      }
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

  // 1. If authorization is loading
  if (user === undefined) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-24 text-center">
        <div className="flex flex-col items-center justify-center gap-4 py-20">
          <RefreshCw className="h-8 w-8 animate-spin text-[#e5ff00]" />
          <p className="font-mono text-sm uppercase tracking-widest text-zinc-400">
            Checking authorization...
          </p>
        </div>
      </div>
    );
  }

  // 2. If user is logged out (not authenticated)
  if (user === null) {
    return (
      <div className="mx-auto max-w-md px-6 py-24">
        <div className="border border-[#27272a] bg-[#0a0a0a] p-8 text-center">
          <div className="label-caps text-red-500 mb-4">// ACCESS DENIED</div>
          <h2 className="font-display text-2xl font-black mb-2 tracking-tight">NOT AUTHENTICATED</h2>
          <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
            You must be logged in to access the Creator Studio / Dashboard.
          </p>
          <a href="/login" className="btn-primary inline-block w-full text-center">
            LOG IN TO SPARKZ.TV
          </a>
        </div>
      </div>
    );
  }

  // 3. If loading API data and we don't have channel state yet
  if (loading && !channel) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-16">
        <div className="h-96 animate-pulse bg-[#0a0a0a] border border-[#27272a]" />
      </div>
    );
  }

  // 4. If loading failed and we don't have channel state yet
  if (error && !channel) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <div className="border border-red-950 bg-[#0a0a0a] p-8 text-center">
          <div className="label-caps text-red-500 mb-2">// LOADING ERROR</div>
          <h2 className="font-display text-xl font-bold mb-4 tracking-tight">FAILED TO LOAD CREATOR STUDIO</h2>
          <p className="text-zinc-400 text-sm mb-6 font-mono border border-[#27272a] bg-black p-3 rounded text-left overflow-x-auto">
            {error}
          </p>
          <button onClick={load} className="btn-primary w-full flex items-center justify-center gap-2">
            <RefreshCw className="h-4 w-4" /> RETRY LOADING
          </button>
        </div>
      </div>
    );
  }

  // 5. If channel loaded but somehow still empty (safe fallback)
  if (!channel) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <div className="border border-zinc-800 bg-[#0a0a0a] p-8 text-center">
          <div className="label-caps text-zinc-500 mb-2">// INITIALIZING</div>
          <h2 className="font-display text-xl font-bold mb-4 tracking-tight">SETTING UP CREATOR STUDIO</h2>
          <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
            We are preparing your stream settings. Click below to initialize your channel.
          </p>
          <button onClick={() => createStream(false)} className="btn-primary w-full">
            INITIALIZE STREAM KEY
          </button>
        </div>
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
              <div className="label-caps mb-0">// BROADCAST CREDENTIALS (AMAZON IVS CHANNEL)</div>
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
                    : channel?.stream_key || channel?.streamKey
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
                value={channel.rtmp_url || channel.rtmpUrl || "rtmps://global-ingest.live-video.net:443/app/"}
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
                placeholder="Click 'GENERATE KEY' to generate"
                testid="stream-key"
              />
              <CredentialRow
                label="PLAYBACK URL"
                value={channel.playback_url || channel.playbackUrl || channel.playback_id || ""}
                onCopy={copy}
                testid="playback-url"
              />
              <CredentialRow
                label="OBS BROWSER OVERLAY"
                value={`${window.location.origin}/overlay/${channel.username || ""}`}
                onCopy={copy}
                testid="obs-overlay-url"
              />
            </div>
            <p className="mt-4 border-t border-[#27272a] pt-4 font-mono text-[11px] leading-relaxed text-zinc-500">
              → Open OBS → Settings → Stream → Service: Custom → paste RTMP Server + Stream Key → Start
              Streaming. Your channel flips to LIVE automatically the second Amazon IVS detects the
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
          className={`flex-1 min-w-0 overflow-x-auto whitespace-nowrap border border-[#27272a] bg-black px-3 py-2 font-mono text-[11px] ${
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
            className="btn-ghost flex-shrink-0 flex items-center gap-1.5 px-3 py-2 text-xs hover:text-[#e5ff00] hover:border-[#e5ff00]"
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
      const base64 = await fileToBase64(file);
      const { data } = await api.post("/channels/mine/thumbnail", {
        image: base64,
        thumbnail: base64,
        file: base64,
        filename: file.name
      });
      onChange?.({ ...channel, thumbnail_url: data.thumbnail_url });
      window.dispatchEvent(new CustomEvent("channel-updated", { detail: { channel: { ...channel, thumbnail_url: data.thumbnail_url } } }));
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
      window.dispatchEvent(new CustomEvent("channel-updated", { detail: { channel: { ...channel, thumbnail_url: null } } }));
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
