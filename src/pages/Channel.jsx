import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { api, fileUrl } from "@/lib/api";
import { db } from "@/lib/firebase";
import { doc, onSnapshot } from "firebase/firestore";
import HlsPlayer from "@/components/HlsPlayer";
import ChatPanel from "@/components/ChatPanel";
import FollowButton from "@/components/FollowButton";
import SubscribeButton from "@/components/SubscribeButton";
import ShareButton from "@/components/ShareButton";
import SessionList from "@/components/SessionList";
import ScheduleDisplay from "@/components/ScheduleDisplay";
import LiveDuration from "@/components/LiveDuration";
import UserLocationTime from "@/components/UserLocationTime";
import { useAuth } from "@/lib/auth-context";
import { Eye, ArrowLeft, User, Clock, QrCode } from "lucide-react";
import { useLivepeerAutoPoll } from "@/hooks/useLivepeerAutoPoll";
import { useMetaTags } from "@/hooks/useMetaTags";
import { QRCodeSVG } from "qrcode.react";

export default function Channel() {
  const { username } = useParams();
  const { user } = useAuth();
  const [channel, setChannel] = useState(null);
  const [notFound, setNotFound] = useState(false);

  useLivepeerAutoPoll(username);

  const channelImage = channel?.photo_url
    ? fileUrl(channel.photo_url)
    : channel?.banner_url
    ? fileUrl(channel.banner_url)
    : "/og-image.png";

  const channelTitle = channel
    ? `${channel.display_name || channel.username} (@${channel.username}) — Sparkz.TV`
    : `Broadcaster ${username} — Sparkz.TV`;

  const channelDesc = channel
    ? channel.stream_title || channel.bio || `Watch ${channel.display_name || channel.username} live on Sparkz.TV`
    : `Watch underground live streams on Sparkz.TV`;

  useMetaTags({
    title: channelTitle,
    description: channelDesc,
    image: channelImage,
  });

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [username]);

  useEffect(() => {
    setNotFound(false);
    let cancelled = false;

    const load = async () => {
      if (!username || username === "undefined" || username === "null") {
        return;
      }
      try {
        const { data } = await api.get(`/channels/${username}`, {
          params: {
            uid: user?.uid || "",
            username: user?.username || ""
          },
          headers: {
            "x-user-uid": user?.uid || "",
            "x-username": user?.username || ""
          }
        });
        if (!cancelled && data) {
          setChannel((prev) => ({
            ...data,
            schedule: (Array.isArray(data.schedule) && data.schedule.length > 0) ? data.schedule : (prev?.schedule || data.schedule || []),
            photo_url: data.photo_url || prev?.photo_url || null,
          }));
        }
      } catch {
        if (!cancelled) setNotFound(true);
      }
    };
    load();

    const targetDocId = username ? username.toLowerCase() : "";
    const unsub = onSnapshot(
      doc(db, "channels", targetDocId),
      (docSnap) => {
        if (docSnap.exists() && !cancelled) {
          const fsData = docSnap.data();
          let fsSchedule = fsData.schedule;
          if (!Array.isArray(fsSchedule) && fsData.schedule_json) {
            try {
              fsSchedule = JSON.parse(fsData.schedule_json);
            } catch (e) {}
          }
          setChannel((prev) => {
            if (!prev) {
              return {
                ...fsData,
                schedule: Array.isArray(fsSchedule) ? fsSchedule : [],
              };
            }

            const merged = { ...prev };
            
            for (const key of Object.keys(fsData)) {
              if (fsData[key] !== null && fsData[key] !== undefined) {
                merged[key] = fsData[key];
              }
            }

            if (!merged.photo_url && prev.photo_url) {
              merged.photo_url = prev.photo_url;
            }

            const finalSchedule = (Array.isArray(fsSchedule) && fsSchedule.length > 0)
              ? fsSchedule
              : (prev.schedule || []);
            
            merged.schedule = finalSchedule;
            return merged;
          });
        }
      },
      (err) => {
        console.warn("Firestore channel snapshot notice:", err);
      }
    );

    return () => {
      cancelled = true;
      unsub();
    };
  }, [username, user?.uid]);

  useEffect(() => {
    if (!channel?.is_live) return;
    let cancelled = false;
    const beat = async () => {
      try {
        const { data } = await api.post(`/channels/${username}/view`);
        if (!cancelled && data && typeof data.viewer_count === "number") {
          setChannel((prev) =>
            prev ? { ...prev, viewer_count: data.viewer_count } : prev
          );
        }
      } catch {}
    };
    beat();
    const t = setInterval(beat, 15000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [channel?.is_live, username]);

  if (notFound) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <div className="font-display text-6xl font-black tracking-tighter text-zinc-700">404</div>
        <div className="mt-2 font-mono text-sm uppercase tracking-widest text-zinc-500">
          NO SUCH FREQUENCY
        </div>
        <Link to="/" className="btn-primary mt-8 inline-flex">
          BACK TO GRID
        </Link>
      </div>
    );
  }

  if (!channel) {
    return (
      <div className="mx-auto max-w-[1440px] px-6 py-8">
        <div className="aspect-video animate-pulse bg-[#111]" />
      </div>
    );
  }

  const ownChannel = user?.username === channel.username;

  return (
    <div className="mx-auto max-w-[1440px] px-6 pt-6 pb-24 sm:pb-28 lg:pb-32" data-testid={`channel-page-${username}`}>
      <Link
        to="/"
        data-testid="back-to-browse"
        className="mb-4 inline-flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-zinc-500 hover:text-white"
      >
        <ArrowLeft className="h-3 w-3" /> BACK TO SIGNALS
      </Link>

      <div className="grid gap-6 lg:grid-cols-12">
        <div className="lg:col-span-8 flex flex-col gap-6">
          <HlsPlayer playbackId={channel.playback_id} isLive={channel.is_live} />

          <div className="border border-[#27272a] bg-[#0a0a0a] p-6">
            <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {channel.is_live && (
                    <span className="live-badge">
                      <span className="dot live-dot" /> LIVE
                    </span>
                  )}
                  {channel.is_live && channel.stream_started_at && (
                    <span
                      className="inline-flex items-center gap-1.5 border border-[#27272a] px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-[#e5ff00]"
                      data-testid="live-duration-badge"
                    >
                      <Clock className="h-3 w-3" />
                      <LiveDuration startedAt={channel.stream_started_at} />
                    </span>
                  )}
                  <span className="chip">{channel.category}</span>
                </div>
                <h1 className="mt-4 font-display text-2xl font-black leading-tight tracking-tighter sm:text-3xl">
                  {channel.stream_title || "Untitled stream"}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <UserLocationTime />
                {channel.is_live && (
                  <div className="flex items-center gap-2 border border-[#27272a] px-3 py-2">
                    <Eye className="h-4 w-4 text-[#e5ff00]" />
                    <span className="font-mono text-sm font-bold" data-testid="viewer-count">
                      {channel.viewer_count || 0}
                    </span>
                  </div>
                )}
                <ShareButton
                  username={channel.username}
                  streamTitle={channel.stream_title}
                />
                <FollowButton
                  username={channel.username}
                  isFollowing={channel.is_following}
                  followerCount={channel.follower_count}
                  ownChannel={ownChannel}
                  onChange={(res) =>
                    setChannel((prev) => ({
                      ...prev,
                      is_following: res.following,
                      follower_count: res.follower_count,
                    }))
                  }
                />
                <SubscribeButton
                  username={channel.username}
                  isSubscribed={channel.is_subscribed}
                  subscriberCount={channel.subscriber_count}
                  ownChannel={ownChannel}
                  onChange={(res) =>
                    setChannel((prev) => ({
                      ...prev,
                      is_subscribed: res.subscribed,
                      subscriber_count: res.subscriber_count,
                    }))
                  }
                />
              </div>
            </div>
          </div>

          {/* MOBILE CHAT PLACEMENT: Appears directly under video/meta card on mobile/tablet */}
          <div className="block lg:hidden w-full">
            <ChatPanel username={channel.username} />
          </div>

          {/* Schedule */}
          <div>
            <ScheduleDisplay schedule={channel.schedule} username={channel.username} />
          </div>

          {/* Past sets */}
          <div>
            <SessionList username={channel.username} />
          </div>
        </div>

        <aside className="lg:col-span-4 space-y-4">
          {/* DESKTOP CHAT PLACEMENT: Appears in the sidebar on large screens */}
          <div className="hidden lg:block">
            <ChatPanel username={channel.username} />
          </div>

          <div className="border border-[#27272a] bg-[#0a0a0a] p-6">
            <div className="label-caps">// BROADCASTER</div>
            <div className="mt-4 flex items-center gap-4">
              {channel.photo_url ? (
                <img
                  src={fileUrl(channel.photo_url)}
                  alt=""
                  className="h-16 w-16 border border-[#27272a] object-cover grayscale"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center border border-[#27272a]">
                  <User className="h-6 w-6 text-zinc-500" />
                </div>
              )}
              <div className="min-w-0">
                <div className="truncate font-display text-xl font-black">{channel.display_name}</div>
                <div className="font-mono text-xs text-zinc-500">@{channel.username}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  {channel.follower_count || 0} followers
                </div>
              </div>
            </div>
          </div>

          {/* Channel QR Code Card */}
          <div className="border border-[#27272a] bg-[#0a0a0a] p-6" data-testid="channel-qr-card">
            <div className="flex items-center gap-2">
              <QrCode className="h-4 w-4 text-[#e5ff00]" />
              <div className="label-caps mb-0">// CHANNEL QR CODE</div>
            </div>

            <p className="mt-2 font-mono text-[11px] leading-relaxed text-zinc-400">
              Scan or share to tune into <code className="text-[#e5ff00]">@{channel.username}</code>.
            </p>

            <div className="mt-4 flex flex-col items-center justify-center border border-dashed border-[#27272a] bg-black p-4">
              <div className="rounded bg-white p-2.5 shadow-lg">
                <QRCodeSVG
                  value={`${window.location.origin}/channel/${channel.username}`}
                  size={130}
                  bgColor="#ffffff"
                  fgColor="#000000"
                  level="M"
                />
              </div>
              <span className="mt-2 font-mono text-[9px] text-zinc-500 uppercase tracking-widest truncate max-w-[200px]">
                {window.location.origin}/channel/{channel.username}
              </span>
            </div>
          </div>

          <div className="border border-[#27272a] bg-[#0a0a0a] p-6">
            <div className="label-caps">// STREAM INFO</div>
            <dl className="mt-4 space-y-3 font-mono text-xs">
              <Row label="STATUS">{channel.is_live ? "LIVE" : "OFF AIR"}</Row>
              <Row label="CATEGORY">{channel.category}</Row>
              <Row label="VIEWERS">
                <span className="inline-flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5 text-[#e5ff00]" />
                  <span>{channel.viewer_count || 0}</span>
                </span>
              </Row>
              <Row label="PLAYBACK ID" mono>
                {channel.playback_id}
              </Row>
            </dl>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children, mono }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#27272a] pb-2 last:border-0 last:pb-0">
      <span className="text-zinc-500">{label}</span>
      <span className={`text-right ${mono ? "break-all font-mono text-[10px]" : "font-bold uppercase"}`}>
        {children}
      </span>
    </div>
  );
}