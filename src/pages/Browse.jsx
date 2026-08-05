import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";
import ChannelCard from "@/components/ChannelCard";
import Marquee from "@/components/Marquee";
import TopStreamersHero from "@/components/TopStreamersHero";
import { ArrowRight, Radio, Zap, Heart } from "lucide-react";
import { useLivepeerAutoPoll } from "@/hooks/useLivepeerAutoPoll";
import { useMetaTags } from "@/hooks/useMetaTags";

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

export default function Browse() {
  const { user } = useAuth();
  const [category, setCategory] = useState(null);
  const [liveOnly, setLiveOnly] = useState(true);
  const [followingOnly, setFollowingOnly] = useState(false);
  const [followingList, setFollowingList] = useState([]);
  const [rawChannels, setRawChannels] = useState([]);
  const [loading, setLoading] = useState(true);

  useLivepeerAutoPoll();
  useMetaTags({
    title: "Sparkz.TV — Underground Live Streaming",
    description: "Discover the finest underground music streams. Join the Signal.",
    image: "/og-image.png",
  });

  useEffect(() => {
    if (!user) {
      setFollowingList([]);
      return;
    }
    const fetchFollowing = () => {
      api.get("/users/mine/following")
        .then(({ data }) => {
          if (data && Array.isArray(data.following)) {
            setFollowingList(data.following.map((u) => u.toLowerCase()));
          }
        })
        .catch(() => {});
    };
    fetchFollowing();
    window.addEventListener("follow-changed", fetchFollowing);
    return () => window.removeEventListener("follow-changed", fetchFollowing);
  }, [user]);

  useEffect(() => {
    setLoading(true);
    const q = collection(db, "channels");
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const map = new Map();
        snapshot.forEach((doc) => {
          const docId = doc.id;
          const data = doc.data();
          if (!data) return;

          const isUndefinedId = (
            docId === "undefined" ||
            docId === "null" ||
            docId.toLowerCase() === "undefined" ||
            docId.toLowerCase() === "null"
          );
          if (isUndefinedId) return;

          const channelKey = data.channel_id || data.username || docId;
          if (channelKey === "undefined" || channelKey === "null" || data.username === "undefined" || data.username === "null") {
            return;
          }

          let playbackId = data.playback_id || data.playbackId || "";
          let livepeerStreamId = data.livepeer_stream_id || "";

          // Force correct values for djsparkz
          if (data.username?.toLowerCase() === "djsparkz" || docId === "nsU1v44XFnN3FloJvNePqj6cBG2" || data.user_uid === "nsU1v44XFnN3FloJvNePqj6cBG2") {
            playbackId = data.playback_url || data.playbackUrl || data.playback_id || "https://a1b2c3d4e5f6.us-east-1.playback.live-video.net/api/video/v1/us-east-1.123456789012.channel.djsparkz-channel.m3u8";
            livepeerStreamId = data.livepeer_stream_id || "arn:aws:ivs:us-east-1:123456789012:channel/djsparkz-channel";
          }

          map.set(channelKey, {
            id: docId,
            ...data,
            playback_id: playbackId,
            playbackId: playbackId,
            livepeer_stream_id: livepeerStreamId,
          });
        });
        const list = Array.from(map.values());

        const DUMMY_USERNAMES = ["pirate_fm", "acid_vault", "dub_station"];
        const cleaned = list.filter(
          (c) =>
            !DUMMY_USERNAMES.includes((c.username || "").toLowerCase()) &&
            !c.is_dummy &&
            !c.channel_id?.startsWith("chan-pirate") &&
            !c.channel_id?.startsWith("chan-acid") &&
            !c.channel_id?.startsWith("chan-dub")
        );
        setRawChannels(cleaned);
        setLoading(false);
      },
      (err) => {
        api.get("/channels")
          .then(({ data }) => {
            let list = Array.isArray(data) ? data : [];
            const DUMMY_USERNAMES = ["pirate_fm", "acid_vault", "dub_station"];
            const cleaned = list.filter(
              (c) =>
                !DUMMY_USERNAMES.includes((c.username || "").toLowerCase()) &&
                !c.is_dummy &&
                !c.channel_id?.startsWith("chan-pirate") &&
                !c.channel_id?.startsWith("chan-acid") &&
                !c.channel_id?.startsWith("chan-dub")
            );
            setRawChannels(cleaned);
            setLoading(false);
          })
          .catch(() => setLoading(false));
      }
    );

    return () => unsubscribe();
  }, [user]);

  let filteredChannels = rawChannels;
  if (followingOnly) {
    filteredChannels = filteredChannels.filter((c) =>
      followingList.includes((c.username || "").toLowerCase())
    );
  }
  if (liveOnly) {
    filteredChannels = filteredChannels.filter((c) => Boolean(c.is_live || c.isLive) === true);
  }
  if (category) {
    filteredChannels = filteredChannels.filter((c) => c.category === category);
  }

  const safeChannels = Array.isArray(filteredChannels) ? filteredChannels : [];

  return (
    <div className="min-h-screen">
      {/* Top Streamers Hero Box */}
      <TopStreamersHero allChannels={rawChannels} />

      <Marquee items={CATEGORIES.map((c) => c.toUpperCase())} />

      {/* Filters + Grid */}
      <section id="grid" className="mx-auto max-w-[1440px] px-6 pt-12 pb-24 sm:pb-28 lg:pb-32">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="label-caps">Signal Directory</div>
            <h2 className="font-display text-3xl font-black tracking-tighter sm:text-4xl">
              {followingOnly ? "FOLLOWING" : liveOnly ? "LIVE NOW" : "ALL CHANNELS"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            {user && (
              <button
                data-testid="filter-following"
                onClick={() => setFollowingOnly((v) => !v)}
                className={`chip inline-flex items-center gap-1 ${followingOnly ? "active" : ""}`}
              >
                <Heart className={`h-3 w-3 ${followingOnly ? "fill-current" : ""}`} />
                {followingOnly ? "FOLLOWING" : "SHOW FOLLOWED"}
              </button>
            )}
            <button
              data-testid="filter-live-only"
              onClick={() => setLiveOnly((v) => !v)}
              className={`chip ${liveOnly ? "active" : ""}`}
            >
              {liveOnly ? "◉ LIVE ONLY" : "○ SHOW ALL"}
            </button>
          </div>
        </div>

        <div className="mb-8 flex flex-wrap gap-2">
          <button
            data-testid="category-all"
            onClick={() => setCategory(null)}
            className={`chip ${category === null ? "active" : ""}`}
          >
            ALL
          </button>
          {CATEGORIES.map((c) => (
            <button
              key={c}
              data-testid={`category-${c.replace(/\s+/g, "-")}`}
              onClick={() => setCategory(c)}
              className={`chip ${category === c ? "active" : ""}`}
            >
              {c}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="border border-[#27272a] bg-[#0a0a0a]">
                <div className="aspect-video animate-pulse bg-[#111]" />
                <div className="p-4">
                  <div className="h-4 w-3/4 animate-pulse bg-[#111]" />
                  <div className="mt-2 h-3 w-1/2 animate-pulse bg-[#111]" />
                </div>
              </div>
            ))}
          </div>
        ) : safeChannels.length === 0 ? (
          <div
            data-testid="empty-state"
            className="border border-dashed border-[#27272a] p-16 text-center"
          >
            <div className="font-display text-2xl font-black uppercase tracking-tighter text-zinc-500">
              // NO SIGNAL
            </div>
            <p className="mt-3 font-mono text-sm text-zinc-500">
              {followingOnly
                ? "None of the channels you follow are live right now."
                : liveOnly
                  ? "No streams currently live. Check back soon."
                  : "No channels registered yet. Be the first to broadcast."}
            </p>
            <Link to="/register" className="btn-primary mt-6 inline-flex">
              START A CHANNEL
            </Link>
          </div>
        ) : (
          <div
            data-testid="channels-grid"
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {safeChannels.map((c, idx) => {
              const cardKey = c.id || c.channel_id || c.username || `channel-card-${idx}`;
              return <ChannelCard key={cardKey} channel={c} />;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
