import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Eye, Radio, Trophy, Play, ArrowRight, User } from "lucide-react";
import { fileUrl } from "@/lib/api";

const FALLBACK_THUMBS = [
  "https://images.unsplash.com/photo-1541126274323-dbac58d14741?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwxfHx1bmRlcmdyb3VuZCUyMHJhdmUlMjBkaiUyMHNldHxlbnwwfHx8fDE3ODU0NDAwMzJ8MA&ixlib=rb-4.1.0&q=85",
  "https://images.unsplash.com/photo-1516873240891-4bf014598ab4?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHw0fHx1bmRlcmdyb3VuZCUyMHJhdmUlMjBkaiUyMHNldHxlbnwwfHx8fDE3ODU0NDAwMzJ8MA&ixlib=rb-4.1.0&q=85",
  "https://images.unsplash.com/photo-1496337589254-7e19d01cec44?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwzfHx1bmRlcmdyb3VuZCUyMHJhdmUlMjBkaiUyMHNldHxlbnwwfHx8fDE3ODU0NDAwMzJ8MA&ixlib=rb-4.1.0&q=85",
];

function hashPick(str, arr) {
  if (!str) return arr[0];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return arr[Math.abs(h) % arr.length];
}

const DUMMY_USERNAMES = ["pirate_fm", "acid_vault", "dub_station", "test", "demo", "undefined", "channel"];

export default function TopStreamersHero({ allChannels = [] }) {
  // Filter out dummy/test channels, incomplete records, and deduplicate by username
  const seenUsernames = new Set();
  const validChannels = (allChannels || []).filter((c) => {
    if (!c) return false;
    const username = (c.username || "").trim().toLowerCase();
    const displayName = (c.display_name || "").trim().toLowerCase();
    const channelId = (c.channel_id || "").trim().toLowerCase();

    if (!username || username === "undefined" || username === "channel" || username === "null") {
      return false;
    }

    if (
      c.is_dummy ||
      c.isDummy ||
      DUMMY_USERNAMES.includes(username) ||
      DUMMY_USERNAMES.includes(displayName) ||
      channelId.startsWith("chan-pirate") ||
      channelId.startsWith("chan-acid") ||
      channelId.startsWith("chan-dub")
    ) {
      return false;
    }

    if (seenUsernames.has(username)) return false;
    seenUsernames.add(username);
    return true;
  });

  // Sort channels by live status first, then by viewer count / views descending
  const sortedStreamers = [...validChannels].sort((a, b) => {
    const aLive = Boolean(a.is_live || a.isLive);
    const bLive = Boolean(b.is_live || b.isLive);
    if (aLive && !bLive) return -1;
    if (!aLive && bLive) return 1;

    const aViews = Number(a.viewer_count || a.viewerCount || a.views || 0);
    const bViews = Number(b.viewer_count || b.viewerCount || b.views || 0);
    return bViews - aViews;
  });

  const topStreamers = sortedStreamers.slice(0, 5);
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Default selection to top streamer if list changes
  useEffect(() => {
    if (selectedIdx >= topStreamers.length) {
      setSelectedIdx(0);
    }
  }, [topStreamers.length, selectedIdx]);

  const activeStreamer = topStreamers[selectedIdx] || topStreamers[0];

  if (!activeStreamer) {
    return (
      <section className="relative border-b border-[#27272a] bg-[#030303] py-16">
        <div className="mx-auto max-w-[1440px] px-6 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#27272a] bg-[#09090b] px-4 py-1 font-mono text-xs text-zinc-400">
            <Radio className="h-3.5 w-3.5 animate-pulse text-[#e5ff00]" /> NO BROADCASTS ONLINE
          </div>
          <h1 className="mt-4 font-display text-4xl font-black uppercase text-white sm:text-6xl">
            SPARKZ.TV // <span className="text-[#e5ff00]">TOP LIVE STREAMERS</span>
          </h1>
          <p className="mx-auto mt-4 max-w-xl font-mono text-sm text-zinc-400">
            No live streams detected right now. Be the first to register a channel and broadcast live to the underground network!
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Link to="/register" className="btn-primary inline-flex items-center gap-2">
              <Radio className="h-4 w-4" /> CLAIM A CHANNEL
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const activeSlug = activeStreamer.username || activeStreamer.channel_id || activeStreamer.id || "channel";
  const activeViews = Number(activeStreamer.viewer_count || activeStreamer.viewerCount || activeStreamer.views || 0);
  const isLive = Boolean(activeStreamer.is_live || activeStreamer.isLive);
  const activeThumb = activeStreamer.thumbnail_url
    ? fileUrl(activeStreamer.thumbnail_url)
    : activeStreamer.banner_url
    ? fileUrl(activeStreamer.banner_url)
    : hashPick(activeSlug, FALLBACK_THUMBS);

  const totalLiveViewers = topStreamers
    .filter((c) => Boolean(c.is_live || c.isLive))
    .reduce((sum, c) => sum + Number(c.viewer_count || c.viewerCount || c.views || 0), 0);

  return (
    <section className="relative border-b border-[#27272a] bg-[#050505] text-white" data-testid="top-streamers-hero">
      <div className="grid-lines absolute inset-0 opacity-30" />
      
      <div className="relative mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:py-8">
        {/* Section Title Header */}
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between" id="hero-header-section">
          <div>
            <h1 className="mt-0.5 font-display text-2xl font-black uppercase tracking-tight text-white sm:text-3xl lg:text-4xl">
              LEADERBOARD <span className="text-[#e5ff00]">BROADCASTS</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 border border-[#27272a] bg-[#09090b] px-2.5 py-1 font-mono text-[11px] text-zinc-300">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#e5ff00] opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-[#e5ff00]" />
              </span>
              <span>{totalLiveViewers} TOTAL LIVE VIEWERS</span>
            </div>
            <Link
              to="/register"
              className="hidden font-mono text-[11px] font-bold uppercase tracking-widest text-[#e5ff00] hover:underline sm:inline-block"
            >
              + START STREAMING
            </Link>
          </div>
        </div>

        {/* Single Two-Column Layout */}
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center mt-6 border-t border-[#1f1f23] pt-8" id="two-column-layout-section">
          {/* Left Column (New Hero Section) */}
          <div className="flex flex-col justify-center lg:col-span-5 py-6 pr-4" id="left-column-hero-text">
            <h2 className="font-display text-4xl sm:text-5xl md:text-6xl font-black uppercase tracking-tight text-[#e5ff00] drop-shadow-[0_0_20px_rgba(229,255,0,0.35)] leading-none select-none">
              YOUR <span className="text-white">STREAM</span> <br />
              YOUR <span className="text-white">MIX</span> <br />
              YOUR <span className="text-white">RULES</span>
            </h2>
            <p className="mt-4 font-mono text-xs sm:text-sm text-zinc-500 max-w-md uppercase tracking-widest">
              // DECENTRALIZED BROADCAST PROTOCOL. NO CENSORSHIP. FULL CONTROL.
            </p>
          </div>

          {/* Right Column (Preview Stream Card) */}
          <div className="lg:col-span-7" id="featured-streamer-player">
            <div className="group flex flex-col overflow-hidden border border-[#27272a] bg-[#0a0a0a] transition-all hover:border-[#e5ff00] w-full">
              {/* Thumbnail / Video Banner */}
              <div className="relative aspect-[16/9] max-h-[360px] w-full overflow-hidden bg-black sm:max-h-[400px]">
                <img
                  src={activeThumb}
                  alt={activeStreamer.display_name || activeSlug}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-black/30 to-transparent" />

                {/* Top Badges */}
                <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2">
                  <span className="flex items-center gap-1 bg-[#e5ff00] px-2.5 py-0.5 font-mono text-[11px] font-black uppercase text-black">
                    <Trophy className="h-3 w-3" /> TOP STREAM
                  </span>
                  {isLive ? (
                    <span className="live-badge !px-2 !py-0.5 !text-[11px]">
                      <span className="dot live-dot" /> LIVE NOW
                    </span>
                  ) : (
                    <span className="chip !px-2 !py-0.5 !text-[11px]">OFFLINE</span>
                  )}
                </div>

                {/* Top Right Viewer Tag */}
                <div className="absolute right-3 top-3 flex items-center gap-1 border border-[#27272a] bg-black/85 px-2.5 py-0.5 font-mono text-[11px] font-bold text-white backdrop-blur-md">
                  <Eye className="h-3 w-3 text-[#e5ff00]" />
                  <span className="text-[#e5ff00]">{activeViews}</span> VIEWS
                </div>

                {/* Play Overlay Button */}
                <Link
                  to={`/channel/${activeSlug}`}
                  className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#e5ff00] text-black shadow-lg transition-transform group-hover:scale-110">
                    <Play className="ml-1 h-7 w-7 fill-black" />
                  </div>
                </Link>
              </div>

              {/* Channel Meta Information */}
              <div className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3.5 min-w-0">
                    {activeStreamer.photo_url ? (
                      <img
                        src={fileUrl(activeStreamer.photo_url)}
                        alt=""
                        className="h-11 w-11 shrink-0 border-2 border-[#e5ff00] object-cover"
                      />
                    ) : (
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-[#e5ff00] bg-black text-[#e5ff00]">
                        <User className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 truncate">
                        <h2 className="font-display text-xl font-black text-white truncate">
                          {activeStreamer.display_name || activeStreamer.username}
                        </h2>
                        <span className="font-mono text-xs text-zinc-400 shrink-0">@{activeSlug}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 font-mono text-xs text-zinc-300">
                        {activeStreamer.stream_title || activeStreamer.bio || "Live Signal Transmission"}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      to={`/channel/${activeSlug}`}
                      data-testid={`top-hero-watch-${activeSlug}`}
                      className="btn-primary flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold"
                    >
                      <Radio className="h-3.5 w-3.5" /> TUNE IN LIVE
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
