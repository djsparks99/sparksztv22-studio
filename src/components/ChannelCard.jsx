import { Link } from "react-router-dom";
import { Eye, User } from "lucide-react";
import { fileUrl } from "@/lib/api";

const THUMBS = [
  "https://images.unsplash.com/photo-1541126274323-dbac58d14741?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwxfHx1bmRlcmdyb3VuZCUyMHJhdmUlMjBkaiUyMHNldHxlbnwwfHx8fDE3ODU0NDAwMzJ8MA&ixlib=rb-4.1.0&q=85",
  "https://images.unsplash.com/photo-1516873240891-4bf014598ab4?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHw0fHx1bmRlcmdyb3VuZCUyMHJhdmUlMjBkaiUyMHNldHxlbnwwfHx8fDE3ODU0NDAwMzJ8MA&ixlib=rb-4.1.0&q=85",
  "https://images.unsplash.com/photo-1496337589254-7e19d01cec44?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwzfHx1bmRlcmdyb3VuZCUyMHJhdmUlMjBkaiUyMHNldHxlbnwwfHx8fDE3ODU0NDAwMzJ8MA&ixlib=rb-4.1.0&q=85",
];

function hashPick(str, arr) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

function isDocId(str) {
  if (!str || typeof str !== "string") return false;
  const trimmed = str.trim();
  return (
    trimmed.length >= 20 &&
    /^[A-Za-z0-9_-]+$/.test(trimmed)
  );
}

function getCleanUsername(channel) {
  const username = channel?.username;
  if (username && typeof username === "string" && !isDocId(username) && username !== "undefined" && username !== "null") {
    return username.trim();
  }

  const display = channel?.display_name;
  if (display && typeof display === "string" && !isDocId(display) && display !== "undefined" && display !== "null") {
    return display.trim().toLowerCase().replace(/\s+/g, "_");
  }

  const cid = channel?.channel_id || channel?.id;
  if (cid === "nsU1v44XFnN3FloJvNePqj6cBG2" || channel?.user_uid === "nsU1v44XFnN3FloJvNePqj6cBG2") {
    return "djsparkz";
  }

  return "djsparkz";
}

export default function ChannelCard({ channel }) {
  const channelSlug = getCleanUsername(channel);
  const thumb = channel?.thumbnail_url
    ? fileUrl(channel.thumbnail_url)
    : hashPick(channelSlug, THUMBS);
  const customThumb = !!channel?.thumbnail_url;
  return (
    <Link
      to={`/channel/${channelSlug}`}
      data-testid={`channel-card-${channelSlug}`}
      className="group block border border-[#27272a] bg-[#0a0a0a] transition-colors hover:border-white"
    >
      <div className="relative aspect-video overflow-hidden border-b border-[#27272a] bg-black">
        <img
          src={thumb}
          alt=""
          className={`h-full w-full object-cover transition-all duration-300 ${customThumb ? "" : "grayscale group-hover:grayscale-0"}`}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute left-3 top-3 flex items-center gap-2">
          {channel.is_live ? (
            <span className="live-badge">
              <span className="dot live-dot" /> LIVE
            </span>
          ) : (
            <span className="chip">OFFLINE</span>
          )}
        </div>
        {channel.is_live && (
          <div className="absolute right-3 top-3 flex items-center gap-1 bg-black/80 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-white">
            <Eye className="h-3 w-3" />
            {channel.viewer_count || 0}
          </div>
        )}
      </div>
      <div className="flex items-start gap-3 p-4">
        {channel.photo_url ? (
          <img
            src={fileUrl(channel.photo_url)}
            alt=""
            className="h-10 w-10 flex-shrink-0 border border-[#27272a] object-cover grayscale group-hover:grayscale-0"
          />
        ) : (
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center border border-[#27272a] bg-black">
            <User className="h-4 w-4 text-zinc-500" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-base font-bold leading-tight">
            {channel.stream_title || "Untitled stream"}
          </div>
          <div className="mt-1 truncate font-mono text-xs text-zinc-400">
            @{channelSlug}
          </div>
          <div className="mt-2">
            <span className="chip">{channel.category}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
