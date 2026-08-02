import { useEffect, useRef, useState } from "react";
import { api, fileUrl } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
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

  useLivepeerAutoPoll(channel?.username);

  const load = async () => {
    const { data } = await api.get("/channels/mine");
    setChannel(data);
    setTitle(data.stream_title || "");
    setCategory(data.category || "music");
  };

  useEffect(() => {
    load();
    api
      .get("/livepeer/webhook/status")
      .then(({ data }) => setAutoDetect(!!data.configured))
      .catch(() => setAutoDetect(true));
  }, []);

  // Poll for auto-detected go-live from Livepeer while dashboard is open
  useEffect(() => {
    const t = setInterval(() => {
      api
        .get("/channels/mine")
        .then(({ data }) => {
          setChannel((prev) => {
            if (!prev) return data;
            if (prev.is_live !== data.is_live) {
              toast.success(data.is_live ? "AUTO-DETECT: signal picked up — you're LIVE." : "AUTO-DETECT: signal dropped.");
            }
            return data;
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
      });
      setChannel(data);
      toast.success("Channel updated.");
    } catch (e) {
      toast.error("Failed to update channel.");
    }
  };

  const createStream = async () => {
    setCreatingStream(true);
    try {
      const response = await fetch("https://livepeer.studio/api/stream", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_LIVEPEER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: `${channel.username}-stream` }),
      });

      if (!response.ok) throw new Error("Livepeer API failed");
      const streamData = await response.json();

      const updatedChannelData = {
        ...channel,
        stream_key: streamData.streamKey,
        rtmp_url: "rtmp://rtmp.livepeer.com/live",
        playback_url: `https://livepeer.com/playback/${streamData.playbackId}/index.m3u8`,
        playback_id: streamData.playbackId,
      };

      setChannel(updatedChannelData);
      toast.success("Livepeer stream generated successfully!");
    } catch (error) {
      console.error(error);
      toast.error("Livepeer stream creation failed.");
    } finally {
      setCreatingStream(false);
    }
  };

  const copy = (text, label) => {
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
    <div className="mx-auto max-w-[1440px] px-6 py-8" data-testid="dashboard-page">
      <header className="mb-8 flex flex-col items-start justify-between gap-4 border-b border-[#27272a] pb-6 sm:flex-row sm:items-end">
        <div>
          <div className="label-caps">// STUDIO</div>
          <h1 className="font-display text-4xl font-black tracking-tighter sm:text-5xl">
            {user?.display_name?.toUpperCase()}
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
              <div className="label-caps mb-0">// BROADCAST CREDENTIALS (LIVEPEER)</div>
              <div className="flex items-center gap-3">
                <button
                  data-testid="create-stream-btn"
                  onClick={createStream}
                  disabled={creatingStream}
                  className="btn-ghost inline-flex items-center gap-1.5 text-xs text-[#e5ff00]"
                >
                  <RefreshCw className={`h-3 w-3 ${creatingStream ? "animate-spin" : ""}`} />
                  {creatingStream ? "GENERATING..." : "NEW LIVEPEER KEY"}
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
              <CredentialRow label="RTMP SERVER" value={channel.rtmp_url} onCopy={copy} testid="rtmp-url" />
              <CredentialRow
                label="STREAM KEY"
                value={channel.stream_key}
                secret={!reveal}
                onCopy={copy}
                onToggle={() => setReveal((v) => !v)}
                reveal={reveal}
                testid="stream-key"
              />
              <CredentialRow
                label="PLAYBACK URL"
                value={channel.playback_url}
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

function CredentialRow({ label, value, secret, onCopy, onToggle, reveal, testid }) {
  const display = secret ? "•".repeat(Math.min(value?.length || 12, 24)) : value;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="label-caps mb-0">{label}</span>
        {onToggle && (
          <button
            data-testid={`${testid}-toggle`}
            onClick={onToggle}
            className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 hover:text-[#e5ff00]"
          >
            {reveal ? "HIDE" : "REVEAL"}
          </button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <code
          data-testid={testid}
          className="flex-1 overflow-x-auto whitespace-nowrap border border-[#27272a] bg-black px-3 py-2 font-mono text-[11px] text-zinc-200"
        >
          {display}
        </code>
        <button
          data-testid={`${testid}-copy`}
          onClick={() => onCopy(value, label)}
          className="btn-ghost"
          aria-label={`Copy ${label}`}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function ThumbnailUploader({ channel, onChange }) {
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
      const { data } = await api.post("/channels/mine/thumbnail", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      onChange?.({ ...channel, thumbnail_url: data.thumbnail_url });
      toast.success("Preview thumbnail updated.");
    } catch {
      toast.error("Upload failed.");
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