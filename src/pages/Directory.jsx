import { useEffect, useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import { Search, Radio, Eye, User, Calendar, Clock, Filter, X } from "lucide-react";

const CATEGORIES = [
  "ALL",
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

const DUMMY_USERNAMES = ["pirate_fm", "acid_vault", "dub_station"];

export default function Directory() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("LIVE"); // Default to LIVE only
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sync state with URL query param if changed externally
  useEffect(() => {
    const qFromUrl = searchParams.get("q");
    if (qFromUrl !== null && qFromUrl !== query) {
      setQuery(qFromUrl);
    }
  }, [searchParams]);

  // Update URL query string as user types
  const handleSearchChange = (val) => {
    setQuery(val);
    if (val) {
      setSearchParams({ q: val }, { replace: true });
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  // Fetch all channels from API
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        setLoading(true);
        const { data } = await api.get("/channels");
        if (!cancelled && Array.isArray(data)) {
          setChannels(data);
        }
      } catch (err) {
        console.error("Failed to load directory channels:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();

    // Listen to Firestore channels collection for real-time live status updates
    const unsub = onSnapshot(
      collection(db, "channels"),
      (snapshot) => {
        if (cancelled) return;
        const fsDocs = snapshot.docs.map((docSnap) => {
          const docId = docSnap.id;
          const data = docSnap.data();
          if (!data) return null;

          const isUndefinedId = (
            docId === "undefined" ||
            docId === "null" ||
            docId.toLowerCase() === "undefined" ||
            docId.toLowerCase() === "null"
          );
          if (isUndefinedId) return null;

          const channelKey = data.channel_id || data.username || docId;
          if (channelKey === "undefined" || channelKey === "null" || data.username === "undefined" || data.username === "null") {
            return null;
          }

          let playbackId = data.playback_id || data.playbackId || "";
          let livepeerStreamId = data.livepeer_stream_id || "";

          // Force correct values for djsparkz
          if (data.username?.toLowerCase() === "djsparkz" || docId === "nsU1v44XFnN3FloJvNePqj6cBG2" || data.user_uid === "nsU1v44XFnN3FloJvNePqj6cBG2") {
            playbackId = data.playback_url || data.playbackUrl || data.playback_id || "https://a1b2c3d4e5f6.us-east-1.playback.live-video.net/api/video/v1/us-east-1.123456789012.channel.djsparkz-channel.m3u8";
            livepeerStreamId = data.livepeer_stream_id || "arn:aws:ivs:us-east-1:123456789012:channel/djsparkz-channel";
          }

          return {
            channel_id: docId,
            ...data,
            playback_id: playbackId,
            playbackId: playbackId,
            livepeer_stream_id: livepeerStreamId,
          };
        }).filter(Boolean);

        setChannels((prev) => {
          if (!prev || prev.length === 0) {
            return fsDocs.map((d) => ({
              channel_id: d.channel_id,
              username: d.username,
              display_name: d.display_name || d.username,
              photo_url: d.photo_url || null,
              thumbnail_url: d.thumbnail_url || null,
              category: d.category || "music",
              stream_title: d.stream_title || "",
              is_live: Boolean(d.is_live || d.isLive),
              viewer_count: d.viewer_count || 0,
              schedule: d.schedule || (d.schedule_json ? JSON.parse(d.schedule_json) : []),
            }));
          }

          // Merge Firestore live updates with API list
          const fsMap = new Map();
          fsDocs.forEach((d) => {
            if (d.username) fsMap.set(d.username.toLowerCase(), d);
            if (d.channel_id) fsMap.set(d.channel_id.toLowerCase(), d);
          });

          return prev.map((c) => {
            const fsData = fsMap.get(c.username?.toLowerCase()) || fsMap.get(c.channel_id?.toLowerCase());
            if (fsData) {
              return {
                ...c,
                photo_url: fsData.photo_url !== undefined ? fsData.photo_url : c.photo_url,
                display_name: fsData.display_name || c.display_name,
                thumbnail_url: fsData.thumbnail_url !== undefined ? fsData.thumbnail_url : c.thumbnail_url,
                is_live: Boolean(fsData.is_live ?? fsData.isLive ?? c.is_live),
                viewer_count: fsData.viewer_count ?? c.viewer_count,
                stream_title: fsData.stream_title || c.stream_title,
                category: fsData.category || c.category,
                schedule:
                  fsData.schedule ||
                  (fsData.schedule_json
                    ? (() => {
                        try {
                          return JSON.parse(fsData.schedule_json);
                        } catch (e) {
                          return c.schedule;
                        }
                      })()
                    : c.schedule),
              };
            }
            return c;
          });
        });
      },
      (err) => console.warn("Firestore directory notice:", err)
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  // Compute all clean, unique non-dummy channels across the platform
  const totalValidChannels = useMemo(() => {
    const seenUsernames = new Set();
    const result = [];

    for (const c of channels) {
      if (!c || !c.username || c.username === "undefined" || c.username === "CHANNEL") continue;
      const uLower = (c.username || "").trim().toLowerCase();

      // 1. Incomplete / Junk record check & Dummy Stream Filter
      if (
        DUMMY_USERNAMES.includes(uLower) ||
        c.is_dummy ||
        c.channel_id?.startsWith("chan-pirate") ||
        c.channel_id?.startsWith("chan-acid") ||
        c.channel_id?.startsWith("chan-dub")
      ) {
        continue;
      }

      // Deduplicate by normalized username
      if (seenUsernames.has(uLower)) continue;

      seenUsernames.add(uLower);
      result.push(c);
    }

    return result;
  }, [channels]);

  // Filter channels based on search query, category, and status
  const filteredChannels = useMemo(() => {
    const qTrim = query.trim().toLowerCase();
    const result = [];

    for (const c of totalValidChannels) {
      // 1. Search Query Matching (username, display_name, category, stream_title, schedule)
      if (qTrim) {
        const u = c.username.toLowerCase();
        const d = (c.display_name || "").toLowerCase();
        const cat = (c.category || "").toLowerCase();
        const st = (c.stream_title || "").toLowerCase();
        const schedText = (c.schedule || [])
          .map((s) => `${s.day} ${s.time} ${s.title} ${s.genre || ""}`)
          .join(" ")
          .toLowerCase();

        const matches =
          u.includes(qTrim) ||
          d.includes(qTrim) ||
          cat.includes(qTrim) ||
          st.includes(qTrim) ||
          schedText.includes(qTrim);

        if (!matches) continue;
      }

      // 2. Category Filter
      if (selectedCategory !== "ALL") {
        if ((c.category || "").toLowerCase() !== selectedCategory.toLowerCase()) {
          continue;
        }
      }

      // 3. Live / Offline Status Filter
      if (statusFilter === "LIVE" && !c.is_live) continue;
      if (statusFilter === "OFFLINE" && c.is_live) continue;

      result.push(c);
    }

    return result;
  }, [totalValidChannels, query, selectedCategory, statusFilter]);

  return (
    <div>
      <div className="mx-auto max-w-[1440px] px-6 pt-8 pb-24 sm:pb-28 lg:pb-32" data-testid="streamer-directory-page">
      {/* Header Banner */}
      <div className="border border-[#27272a] bg-[#0a0a0a] p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-[#e5ff00]" />
              <div className="label-caps mb-0 text-sm">// STREAMER DIRECTORY & FREQUENCY SEARCH</div>
            </div>
            <h1 className="mt-2 font-display text-3xl font-black uppercase tracking-tight sm:text-4xl">
              FIND DJS & BROADCASTERS
            </h1>
            <p className="mt-1 font-mono text-xs text-zinc-400">
              Discover active underground stations, upcoming set schedules, and genre channels.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="border border-[#27272a] bg-black px-3 py-2 font-mono text-xs text-zinc-300" data-testid="frequency-count-badge">
              {totalValidChannels.length <= 1 ? (
                <>
                  <span className="text-[#e5ff00] font-bold">{filteredChannels.length}</span>{" "}
                  {filteredChannels.length === 1 ? "FREQUENCY" : "FREQUENCIES"}
                </>
              ) : (
                <>
                  <span className="text-[#e5ff00] font-bold">{filteredChannels.length}</span> / {totalValidChannels.length}{" "}
                  FREQUENCIES
                </>
              )}
            </span>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="mt-6 relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search DJs by username, display name, genre (e.g. dnb, acid, house)..."
            className="w-full border border-[#27272a] bg-black py-4.5 pl-12 pr-12 font-mono text-sm text-white placeholder-zinc-500 transition-colors focus:border-[#e5ff00] focus:outline-none"
            data-testid="directory-search-input"
          />
          {query && (
            <button
              onClick={() => handleSearchChange("")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              data-testid="clear-search-btn"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filter Controls Bar */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-[#27272a] pt-6">
          {/* Category Chips */}
          <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto py-1">
            <span className="mr-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500 flex items-center gap-1">
              <Filter className="h-3 w-3" /> GENRE:
            </span>
            {CATEGORIES.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  selectedCategory === cat
                    ? "border border-[#e5ff00] bg-[#e5ff00] font-bold text-black"
                    : "border border-[#27272a] bg-black text-zinc-400 hover:border-zinc-500 hover:text-white"
                }`}
                data-testid={`category-chip-${cat.toLowerCase()}`}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Status Filter Buttons */}
          <div className="flex items-center border border-[#27272a] bg-black p-1">
            <button
              onClick={() => setStatusFilter("ALL")}
              className={`px-3 py-1 font-mono text-[10px] uppercase tracking-wider ${
                statusFilter === "ALL"
                  ? "bg-[#27272a] text-white font-bold"
                  : "text-zinc-500 hover:text-white"
              }`}
              data-testid="status-filter-all"
            >
              ALL
            </button>
            <button
              onClick={() => setStatusFilter("LIVE")}
              className={`px-3 py-1 font-mono text-[10px] uppercase tracking-wider flex items-center gap-1.5 ${
                statusFilter === "LIVE"
                  ? "bg-[#e5ff00] text-black font-bold"
                  : "text-zinc-500 hover:text-white"
              }`}
              data-testid="status-filter-live"
            >
              <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
              LIVE NOW
            </button>
            <button
              onClick={() => setStatusFilter("OFFLINE")}
              className={`px-3 py-1 font-mono text-[10px] uppercase tracking-wider ${
                statusFilter === "OFFLINE"
                  ? "bg-[#27272a] text-white font-bold"
                  : "text-zinc-500 hover:text-white"
              }`}
              data-testid="status-filter-offline"
            >
              OFFLINE
            </button>
          </div>
        </div>
      </div>

      {/* Results Grid */}
      <div className="mt-8">
        {loading ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="h-64 animate-pulse border border-[#27272a] bg-[#0a0a0a]" />
            ))}
          </div>
        ) : filteredChannels.length === 0 ? (
          <div className="border border-dashed border-[#27272a] bg-[#0a0a0a] p-12 text-center">
            <Radio className="mx-auto h-8 w-8 text-zinc-600" />
            <h3 className="mt-4 font-display text-xl font-bold uppercase tracking-tight text-white">
              NO STREAMERS MATCH YOUR SEARCH
            </h3>
            <p className="mt-2 font-mono text-xs text-zinc-500">
              Try adjusting your query or resetting the category filter.
            </p>
            <button
              onClick={() => {
                setQuery("");
                setSelectedCategory("ALL");
                setStatusFilter("ALL");
                setSearchParams({}, { replace: true });
              }}
              className="btn-ghost mt-6 inline-flex border border-[#27272a] text-xs text-[#e5ff00]"
              data-testid="reset-filters-btn"
            >
              RESET ALL FILTERS
            </button>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredChannels.map((c, idx) => (
              <StreamerCard key={`dir-card-${c.username ? c.username.toLowerCase() : idx}`} channel={c} />
            ))}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}

const DIRECTORY_THUMBS = [
  "https://images.unsplash.com/photo-1541126274323-dbac58d14741?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwxfHx1bmRlcmdyb3VuZCUyMHJhdmUlMjBkaiUyMHNldHxlbnwwfHx8fDE3ODU0NDAwMzJ8MA&ixlib=rb-4.1.0&q=85",
  "https://images.unsplash.com/photo-1516873240891-4bf014598ab4?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHw0fHx1bmRlcmdyb3VuZCUyMHJhdmUlMjBkaiUyMHNldHxlbnwwfHx8fDE3ODU0NDAwMzJ8MA&ixlib=rb-4.1.0&q=85",
  "https://images.unsplash.com/photo-1496337589254-7e19d01cec44?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwzfHx1bmRlcmdyb3VuZCUyMHJhdmUlMjBkaiUyMHNldHxlbnwwfHx8fDE3ODU0NDAwMzJ8MA&ixlib=rb-4.1.0&q=85",
];

function directoryHashPick(str, arr) {
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

function StreamerCard({ channel }) {
  const cleanUsername = getCleanUsername(channel);
  const isLive = Boolean(channel.is_live);
  const nextSet = Array.isArray(channel.schedule) && channel.schedule.length > 0 ? channel.schedule[0] : null;
  const channelSlug = cleanUsername;

  return (
    <div
      className="group flex flex-col justify-between border border-[#27272a] bg-[#0a0a0a] p-6 transition-all hover:border-[#e5ff00]"
      data-testid={`streamer-card-${cleanUsername}`}
    >
      <div>
        {/* Top Header Row */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            {channel.photo_url ? (
              <img
                src={fileUrl(channel.photo_url)}
                alt={channel.display_name && !isDocId(channel.display_name) ? channel.display_name : cleanUsername}
                className="h-12 w-12 border border-[#27272a] object-cover grayscale contrast-125 group-hover:grayscale-0 transition-all"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center border border-[#27272a] bg-black">
                <User className="h-5 w-5 text-zinc-500" />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="truncate font-display text-lg font-black text-white group-hover:text-[#e5ff00] transition-colors">
                {channel.display_name && !isDocId(channel.display_name) && channel.display_name !== "SPARKS 108 FM" ? channel.display_name : cleanUsername}
              </h2>
              <p className="font-mono text-xs text-zinc-500">@{cleanUsername}</p>
            </div>
          </div>

          {/* Status Badge */}
          {isLive ? (
            <span className="live-badge flex-shrink-0" data-testid="live-indicator">
              <span className="dot live-dot" /> LIVE
            </span>
          ) : (
            <span className="chip flex-shrink-0 text-[10px]">OFF AIR</span>
          )}
        </div>

        {/* Landscape Preview Thumbnail */}
        <div className="mt-4 aspect-video w-full overflow-hidden border border-[#27272a] bg-black relative">
          <img
            src={channel.thumbnail_url ? fileUrl(channel.thumbnail_url) : directoryHashPick(channelSlug, DIRECTORY_THUMBS)}
            alt=""
            className={`h-full w-full object-cover transition-all duration-300 ${channel.thumbnail_url ? "" : "grayscale group-hover:grayscale-0"}`}
          />
        </div>

        {/* Stream Details / Title */}
        <div className="mt-4 border-t border-[#27272a] pt-4">
          <div className="flex items-center gap-2">
            <span className="chip uppercase text-[9px] tracking-wider text-[#e5ff00]">
              {channel.category || "music"}
            </span>
            {isLive && channel.viewer_count > 0 && (
              <span className="inline-flex items-center gap-1 font-mono text-[10px] text-zinc-400">
                <Eye className="h-3 w-3 text-[#e5ff00]" />
                {channel.viewer_count}
              </span>
            )}
          </div>

          <p className="mt-2 line-clamp-2 font-display text-sm font-semibold leading-snug text-zinc-300">
            {channel.stream_title || "Underground Radio Station"}
          </p>
        </div>

        {/* Schedule Preview Badge if available */}
        {nextSet && (
          <div className="mt-4 border border-[#27272a] bg-black/60 p-2.5">
            <div className="flex items-center gap-1.5 font-mono text-[10px] text-zinc-400">
              <Calendar className="h-3 w-3 text-[#e5ff00]" />
              <span className="text-[#e5ff00] font-bold">{nextSet.day}</span>
              <span>@ {nextSet.time}:</span>
              <span className="truncate text-white font-medium">{nextSet.title}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer Action Button */}
      <div className="mt-6 border-t border-[#27272a] pt-4">
        <Link
          to={`/channel/${cleanUsername}`}
          className={`w-full text-center inline-flex items-center justify-center gap-2 py-2.5 font-mono text-xs uppercase tracking-[0.2em] transition-all ${
            isLive
              ? "btn-primary"
              : "border border-[#27272a] bg-black text-zinc-300 hover:border-white hover:text-white"
          }`}
          data-testid={`tune-in-btn-${cleanUsername}`}
        >
          <Radio className="h-3.5 w-3.5" />
          {isLive ? "TUNE IN NOW" : "VIEW CHANNEL"}
        </Link>
      </div>
    </div>
  );
}
