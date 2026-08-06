import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Eye, Radio, Trophy, Play, User } from "lucide-react";
import { fileUrl } from "@/lib/api";
import HlsPlayer from "@/components/HlsPlayer";
import { useAuth } from "@/lib/auth-context";

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
  const { user } = useAuth();
  
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

  const sortedChannels = [...validChannels].sort((a, b) => {
    const aViews = Number(a.viewer_count || a.viewerCount || a.views || 0);
    const bViews = Number(b.viewer_count || b.viewerCount || b.views || 0);
    if (bViews !== aViews) {
      return bViews - aViews;
    }
    const aLive = Boolean(a.is_live || a.isLive);
    const bLive = Boolean(b.is_live || b.isLive);
    if (aLive !== bLive) {
      return bLive ? 1 : -1;
    }
    const aSparkz = (a.username || "").toLowerCase() === "djsparkz";
    const bSparkz = (b.username || "").toLowerCase() === "djsparkz";
    if (aSparkz !== bSparkz) {
      return bSparkz ? 1 : -1;
    }
    return 0;
  });

  const liveChannels = validChannels.filter((c) => Boolean(c.is_live || c.isLive));

  const fallbackStreamer = validChannels.find(
    (c) => (c.username || "").toLowerCase() === "djsparkz"
  ) || validChannels[0] || {
    username: "djsparkz",
    display_name: "djsparkz",
    photo_url: null,
    thumbnail_url: null,
    stream_title: "Static Signal — Offline",
    bio: "Underground resident DJ.",
    viewer_count: 0,
    is_live: false,
  };

  const activeStreamer = sortedChannels[0] || fallbackStreamer;
  const isLive = Boolean(activeStreamer.is_live || activeStreamer.isLive);
  const activeSlug = activeStreamer.username || activeStreamer.channel_id || activeStreamer.id || "channel";
  const activeViews = Number(activeStreamer.viewer_count || activeStreamer.viewerCount || activeStreamer.views || 0);

  // Directly prioritize dashboard uploaded thumbnail_url or thumbnailUrl over defaults
  const thumbnailSource = activeStreamer.thumbnail_url || activeStreamer.thumbnailUrl || activeStreamer.preview_image || activeStreamer.previewImage;
  const activeThumb = thumbnailSource
    ? (thumbnailSource.startsWith("http") ? thumbnailSource : fileUrl(thumbnailSource))
    : hashPick(activeSlug, FALLBACK_THUMBS);

  const isMe = user && (
    (user.uid && user.uid === activeStreamer.user_uid) ||
    (user.username && user.username.toLowerCase() === activeSlug.toLowerCase())
  );

  const avatarUrl = activeStreamer.photo_url || 
                    activeStreamer.photoUrl || 
                    (activeStreamer.user && (activeStreamer.user.photo_url || activeStreamer.user.photoUrl)) ||
                    (isMe && (user?.photo_url || user?.photoUrl)) ||
                    `https://api.dicebear.com/7.x/bottts/svg?seed=${activeSlug}`;

  const totalLiveViewers = liveChannels.reduce(
    (sum, c) => sum + Number(c.viewer_count || c.viewerCount || c.views || 0),
    0
  );

  return (
    <section className="relative border-b border-[#27272a] bg-[#050505] text-white" data-testid="top-streamers-hero">
      <div className="grid-lines absolute inset-0 opacity-30" />
      
      <div className="relative mx-auto max-w-[1440px] px-4 py-8 sm:px-6 lg:py-12">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between" id="hero-header-section">
          <div>
            <h1 className="mt-0.5 font-display text-2xl font-black uppercase tracking-tight text-white sm:text-3xl lg:text-4xl">
              SIGNAL DIRECTORY // <span className="text-[#e5ff00]">UNDERGROUND TRANSMISSIONS</span>
            </h1>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 border border-[#27272a] bg-[#09090b] px-3 py-1 font-mono text-[11px] text-zinc-300">
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full rounded-full bg-[#e5ff00] opacity-75 ${totalLiveViewers > 0 ? "animate-ping" : ""}`} />
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

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center mt-6 border-t border-[#1f1f23] pt-8" id="two-column-layout-section">
          <div className="flex flex-col justify-center lg:col-span-5 py-6 pr-4" id="left-column-hero-text">
            <div className="mb-4 inline-flex self-start items-center gap-2 border border-[#27272a] bg-[#09090b] px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-zinc-400">
              <span className={`relative flex h-2 w-2 ${isLive ? "animate-pulse" : ""}`}>
                <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 ${isLive ? "bg-red-500 animate-ping" : "bg-zinc-500"}`} />
                <span className={`relative inline-flex h-2 w-2 rounded-full ${isLive ? "bg-red-500" : "bg-zinc-500"}`} />
              </span>
              <span>{isLive ? "TRANSMISSION ONLINE" : "SIGNAL STANDBY"}</span>
            </div>
            <h2 className="font-display text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-black uppercase tracking-tighter text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.15)] leading-[0.95] select-none">
              <span className="text-[#e5ff00]">YOUR</span> STREAM,<br />
              <span className="text-[#e5ff00]">YOUR</span> MIX,<br />
              <span className="text-[#e5ff00]">YOUR</span> RULES.
            </h2>
            <p className="mt-6 font-mono text-xs sm:text-sm text-zinc-400 max-w-md uppercase tracking-widest leading-relaxed">
              // DECENTRALIZED BROADCAST PROTOCOL. NO CENSORSHIP. HOST YOUR SESSIONS AND SHARE YOUR SOUNDS WITH THE UNDERGROUND NETWORK.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="btn-primary inline-flex items-center gap-2 px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-wider">
                <Radio className="h-4 w-4" /> CLAIM A CHANNEL
              </Link>
              <Link to="/directory" className="border border-[#27272a] bg-[#09090b] hover:bg-zinc-900 transition-colors inline-flex items-center gap-2 px-5 py-2.5 font-mono text-xs font-bold uppercase tracking-wider text-white">
                EXPLORE DJs
              </Link>
            </div>
          </div>

          {/* Right Column: Featured Player & Preview Thumbnail Overlay */}
          <div className="lg:col-span-7" id="featured-streamer-player">
            <div className="group flex flex-col overflow-hidden border border-[#27272a] bg-[#0a0a0a] transition-all hover:border-[#e5ff00] w-full shadow-2xl relative">
              
              {/* Player / 16:9 Landscape Banner Container */}
              <div className="relative aspect-[16/9] max-h-[360px] w-full overflow-hidden bg-black sm:max-h-[400px]">
                
                {/* Active Live Player Stream */}
                <div className="w-full h-full relative" data-testid="live-player-container">
                  <HlsPlayer
                    playbackId={activeStreamer.playback_id || activeStreamer.playbackId}
                    isLive={isLive}
                    muted={true}
                    autoPlay={true}
                    controls={false}
                  />
                </div>

                {/* Preview Thumbnail Overlay (Vanishes instantly when they go live) */}
                {!isLive && (
                  <div className="absolute inset-0 z-20 bg-black flex items-center justify-center">
                    <img
                      src={activeThumb}
                      alt={activeStreamer.display_name || activeSlug}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center p-4 text-center">
                      <span className="border border-[#e5ff00]/40 bg-black/80 px-3 py-1 font-mono text-xs uppercase tracking-widest text-[#e5ff00] mb-2">
                        SIGNAL OFFLINE — PREVIEW BANNER
                      </span>
                      <p className="font-mono text-xs text-zinc-300">
                        Broadcaster is currently standby. Tune in when live transmission begins.
                      </p>
                    </div>
                  </div>
                )}

                <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent pointer-events-none z-25" />

                {/* Top Badges */}
                <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2 z-30">
                  <span className="flex items-center gap-1 bg-[#e5ff00] px-2.5 py-0.5 font-mono text-[11px] font-black uppercase text-black">
                    <Trophy className="h-3 w-3" /> FEATURED
                  </span>
                  {isLive ? (
                    <span className="live-badge !px-2 !py-0.5 !text-[11px]">
                      <span className="dot live-dot animate-pulse" /> LIVE NOW
                    </span>
                  ) : (
                    <span className="chip !px-2 !py-0.5 !text-[11px] !bg-zinc-900 !text-zinc-400 !border-zinc-800">OFFLINE</span>
                  )}
                </div>

                {/* Viewer count badge */}
                {isLive && (
                  <div className="absolute right-3 top-3 flex items-center gap-1 border border-[#27272a] bg-black/85 px-2.5 py-0.5 font-mono text-[11px] font-bold text-white backdrop-blur-md z-30">
                    <Eye className="h-3 w-3 text-[#e5ff00]" />
                    <span className="text-[#e5ff00]">{activeViews}</span> VIEWERS
                  </div>
                )}
              </div>

              {/* Channel Meta Details */}
              <div className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src={fileUrl(avatarUrl)}
                      alt={activeStreamer.display_name || activeSlug}
                      className="h-11 w-11 shrink-0 border-2 border-[#e5ff00] object-cover bg-black"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.target.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${activeSlug}`;
                      }}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 truncate">
                        <h2 className="font-display text-xl font-black text-white truncate">
                          {activeStreamer.display_name || activeStreamer.username}
                        </h2>
                        <span className="font-mono text-xs text-zinc-500 shrink-0">@{activeSlug}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 font-mono text-xs text-zinc-300">
                        {isLive 
                          ? (activeStreamer.stream_title || "Live underground broadcast") 
                          : "Static Signal — Standby mode."}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Link
                      to={`/channel/${activeSlug}`}
                      data-testid={`top-hero-watch-${activeSlug}`}
                      className="btn-primary flex items-center gap-1.5 px-4 py-2 text-xs font-bold"
                    >
                      <Radio className="h-3.5 w-3.5" /> {isLive ? "TUNE IN LIVE" : "VIEW CHANNEL"}
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