import { useEffect, useRef, useState } from "react";
import { getToken, setToken, fileUrl, BACKEND, api, getAbsoluteOrigin } from "@/lib/api";
import { auth } from "@/lib/firebase";
import { useAuth } from "@/lib/auth-context";
import { Send, LogIn, User, Smile, Zap, Crown, Shield, Gem, Sparkles, X, Flame, Calendar, Users } from "lucide-react";
import { Link } from "react-router-dom";

function wsUrl(username, token, guestName = "") {
  const httpUrl = BACKEND || getAbsoluteOrigin() || window.location.origin;
  const wsBase = httpUrl.replace(/^http/i, "ws");
  const query = `token=${encodeURIComponent(token)}${guestName ? `&guest_name=${encodeURIComponent(guestName)}` : ""}`;
  return `${wsBase}/api/ws/chat/${encodeURIComponent(username)}?${query}`;
}

export default function ChatPanel({ username }) {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [connected, setConnected] = useState(false);
  const [systemLine, setSystemLine] = useState(null);
  
  // Twitch-style profile inspection popup state
  const [inspectUser, setInspectUser] = useState(null);
  const [inspectLoading, setInspectLoading] = useState(false);
  
  // Guest Name State (for guests chatting without an account)
  const [guestName, setGuestName] = useState(() => {
    return localStorage.getItem("sparkz_guest_name") || "";
  });
  const [isEditingGuestName, setIsEditingGuestName] = useState(false);
  const [tempGuestName, setTempGuestName] = useState(guestName);
  
  // Watts state
  const [watts, setWatts] = useState(250);
  const [accruedNotice, setAccruedNotice] = useState(null);
  const [isHighlight, setIsHighlight] = useState(false);

  // Emotes state
  const [emotes, setEmotes] = useState([]);
  const [showEmotePicker, setShowEmotePicker] = useState(false);
  const [emoteTab, setEmoteTab] = useState("all"); 
  const [emoteSearch, setEmoteSearch] = useState("");

  // Typing state
  const [typingUsers, setTypingUsers] = useState({});
  const lastTypingSentRef = useRef(0);
  const typingTimerRef = useRef(null);

  const wsRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch chatter profile for the Twitch-style popup card
  const handleInspectChatter = async (targetUsername, senderPhotoUrl = null) => {
    if (!targetUsername) return;
    setInspectLoading(true);
    setInspectUser({ username: targetUsername, display_name: targetUsername, photo_url: senderPhotoUrl });
    try {
      const { data } = await api.get(`/users/profile/${encodeURIComponent(targetUsername)}`);
      if (data) {
        setInspectUser({
          ...data,
          photo_url: data.photo_url || senderPhotoUrl
        });
      }
    } catch {
      // Fallback with basic username if fetch fails
    } finally {
      setInspectLoading(false);
    }
  };

  // Fetch initial messages & Watts balance & Emotes list
  useEffect(() => {
    let cancelled = false;

    api
      .get(`/channels/${username}/messages`, { params: { limit: 100 } })
      .then(({ data }) => {
        if (!cancelled) {
          setMessages(Array.isArray(data) ? data : Array.isArray(data?.messages) ? data.messages : []);
        }
      })
      .catch(() => {
        if (!cancelled) setMessages([]);
      });

    api
      .get(`/channels/${username}/emotes`)
      .then(({ data }) => {
        if (!cancelled && data?.emotes) {
          setEmotes(data.emotes);
        }
      })
      .catch(() => {});

    if (user) {
      api
        .get("/users/me/watts")
        .then(({ data }) => {
          if (!cancelled && typeof data?.watts === "number") {
            setWatts(data.watts);
          }
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
    };
  }, [username, user]);

  const saveGuestName = (e) => {
    e?.preventDefault();
    const clean = tempGuestName.trim().slice(0, 24);
    if (clean) {
      setGuestName(clean);
      localStorage.setItem("sparkz_guest_name", clean);
    }
    setIsEditingGuestName(false);
  };

  useEffect(() => {
    if (!connected) return;

    const interval = setInterval(async () => {
      try {
        if (user) {
          const { data } = await api.post(`/channels/${username}/watts/ping`);
          if (data && typeof data.watts === "number") {
            setWatts(data.watts);
            if (data.accrued > 0) {
              setAccruedNotice(`+${data.accrued}  WATTS ACCRUED`);
              setTimeout(() => setAccruedNotice(null), 3000);
            }
          }
        } else {
          setWatts((prev) => prev + 15);
          setAccruedNotice(`+15  WATTS ACCRUED`);
          setTimeout(() => setAccruedNotice(null), 3000);
        }
      } catch {}
    }, 10000);

    return () => clearInterval(interval);
  }, [username, user, connected]);

  useEffect(() => {
    if (!username) return;
    let active = true;
    let ws = null;
    let reconnectTimeout = null;
    let retryCount = 0;

    const connect = async () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      
      let token = getToken();
      if (!token && user && auth?.currentUser) {
        try {
          token = await auth.currentUser.getIdToken();
          if (token) setToken(token);
        } catch {}
      }
      token = token || "guest";
      if (!active) return;

      const url = wsUrl(username, token, !user ? guestName : "");
      ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!active) {
          ws.close();
          return;
        }
        setConnected(true);
        retryCount = 0;
      };

      ws.onclose = (event) => {
        if (!active) return;
        setConnected(false);
        wsRef.current = null;
        
        const backoff = Math.min(10000, 1000 * Math.pow(2, retryCount));
        retryCount++;
        
        reconnectTimeout = setTimeout(() => {
          if (active) connect();
        }, backoff);
      };

      ws.onerror = (err) => {
        if (ws) {
          try { ws.close(); } catch {}
        }
      };

      ws.onmessage = (ev) => {
        if (!active) return;
        try {
          const data = JSON.parse(ev.data);
          if (data.type === "message") {
            setMessages((prev) => [
              ...(Array.isArray(prev) ? prev : []),
              {
                id: data.id,
                text: data.text,
                sender_uid: data.sender_uid,
                sender_username: data.sender_username,
                sender_display_name: data.sender_display_name,
                sender_photo_url: data.sender_photo_url,
                created_at: data.created_at,
                is_highlighted: data.is_highlighted,
                highlight_type: data.highlight_type,
                sender_badges: data.sender_badges,
                sender_color: data.sender_color,
                is_system_command: data.is_system_command,
              },
            ]);

            if (data.sender_uid) {
              setTypingUsers((prev) => {
                if (!prev[data.sender_uid]) return prev;
                const next = { ...prev };
                if (next[data.sender_uid]?.timeout) clearTimeout(next[data.sender_uid].timeout);
                delete next[data.sender_uid];
                return next;
              });
            }

            if (typeof data.user_watts === "number" && user && data.sender_uid === user.uid) {
              setWatts(data.user_watts);
            }
          } else if (data.type === "typing") {
            if (data.is_typing) {
              setTypingUsers((prev) => {
                const next = { ...prev };
                if (next[data.uid]?.timeout) clearTimeout(next[data.uid].timeout);
                const timeout = setTimeout(() => {
                  setTypingUsers((current) => {
                    const copy = { ...current };
                    delete copy[data.uid];
                    return copy;
                  });
                }, 3500);
                next[data.uid] = {
                  username: data.username,
                  displayName: data.display_name || data.username,
                  timeout,
                };
                return next;
              });
            } else {
              setTypingUsers((prev) => {
                const next = { ...prev };
                if (next[data.uid]?.timeout) clearTimeout(next[data.uid].timeout);
                delete next[data.uid];
                return next;
              });
            }
          } else if (data.type === "system") {
            setSystemLine(data.message);
            setTimeout(() => setSystemLine(null), 6000);
          }
        } catch {}
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws) {
        try { ws.close(); } catch {}
      }
      wsRef.current = null;
    };
  }, [username, user, guestName]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, systemLine]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setText(val);

    if (wsRef.current && wsRef.current.readyState === 1) {
      const now = Date.now();
      if (val.trim().length > 0) {
        if (now - lastTypingSentRef.current > 2000) {
          wsRef.current.send(
            JSON.stringify({
              type: "typing",
              is_typing: true,
              sender_display_name: user?.display_name || null,
              sender_username: user?.username || null,
              sender_photo_url: user?.photo_url || user?.photoUrl || null,
            })
          );
          lastTypingSentRef.current = now;
        }

        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        typingTimerRef.current = setTimeout(() => {
          if (wsRef.current && wsRef.current.readyState === 1) {
            wsRef.current.send(
              JSON.stringify({
                type: "typing",
                is_typing: false,
                sender_display_name: user?.display_name || null,
                sender_username: user?.username || null,
                sender_photo_url: user?.photo_url || user?.photoUrl || null,
              })
            );
          }
          lastTypingSentRef.current = 0;
        }, 2500);
      } else {
        if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
        wsRef.current.send(
          JSON.stringify({
            type: "typing",
            is_typing: false,
            sender_display_name: user?.display_name || null,
            sender_username: user?.username || null,
            sender_photo_url: user?.photo_url || user?.photoUrl || null,
          })
        );
        lastTypingSentRef.current = 0;
      }
    }
  };

  const send = (e) => {
    e.preventDefault();
    const t = text.trim();
    if (!t || !wsRef.current || wsRef.current.readyState !== 1) return;

    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    wsRef.current.send(
      JSON.stringify({
        type: "typing",
        is_typing: false,
        sender_display_name: user?.display_name || null,
        sender_username: user?.username || null,
        sender_photo_url: user?.photo_url || user?.photoUrl || null,
      })
    );
    lastTypingSentRef.current = 0;

    wsRef.current.send(
      JSON.stringify({
        text: t,
        is_highlighted: isHighlight,
        highlight_type: "neon_glow",
        sender_display_name: user?.display_name || null,
        sender_username: user?.username || null,
        sender_photo_url: user?.photo_url || user?.photoUrl || null,
      })
    );

    if (isHighlight) {
      setWatts((prev) => Math.max(0, prev - 50));
      setIsHighlight(false);
    }

    setText("");
    setShowEmotePicker(false);
  };

  const handleEmoteSelect = (emoteCode) => {
    setText((prev) => (prev ? `${prev} ${emoteCode}` : emoteCode));
    setShowEmotePicker(false);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  const filteredEmotes = emotes.filter((e) => {
    const matchesSearch =
      !emoteSearch ||
      e.code.toLowerCase().includes(emoteSearch.toLowerCase()) ||
      e.name.toLowerCase().includes(emoteSearch.toLowerCase());

    if (emoteTab === "channel") {
      return matchesSearch && e.channel_username.toLowerCase() === username.toLowerCase();
    }
    if (emoteTab === "global") {
      return matchesSearch && e.channel_username === "global";
    }
    return matchesSearch;
  });

  return (
    <div
      data-testid="chat-panel"
      className="relative flex h-[580px] flex-col border border-[#27272a] bg-[#0a0a0a]"
    >
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[#27272a] px-4 py-3 bg-[#0d0d0e]">
        <div className="flex items-center gap-2">
          <div className="label-caps mb-0">// CROWD CHAT</div>
          <div
            data-testid="watts-counter"
            className="inline-flex items-center gap-1 border border-[#e5ff00]/40 bg-[#e5ff00]/10 px-2 py-0.5 font-mono text-[10px] uppercase font-bold text-[#e5ff00] rounded-sm"
          >
            <Zap className="h-3 w-3 fill-[#e5ff00]" />
            <span>{watts} WATTS</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {accruedNotice && (
            <span className="animate-bounce font-mono text-[10px] font-bold text-[#e5ff00]">
              {accruedNotice}
            </span>
          )}
          <span
            data-testid="chat-connection-status"
            className={`hidden inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest ${
              connected ? "text-[#e5ff00]" : "text-zinc-500"
            }`}
          >
            <span
              className={`h-1.5 w-1.5 ${connected ? "bg-[#e5ff00] live-dot" : "bg-zinc-600"}`}
            />
            {connected ? "LIVE" : "CONNECTING…"}
          </span>
        </div>
      </header>

      {/* Message List */}
      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4 scrollbar-thin">
        {(!Array.isArray(messages) || messages.length === 0) && !systemLine && (
          <div className="py-12 text-center">
            <Sparkles className="mx-auto h-6 w-6 text-zinc-700 mb-2" />
            <div className="font-mono text-xs uppercase tracking-widest text-zinc-500">
              // NO SIGNAL YET — BE THE FIRST TO SHOUT
            </div>
            <p className="mt-1 font-mono text-[10px] text-zinc-600">
              Earn +15 Watts every 10 seconds active in chat!
            </p>
          </div>
        )}

        {Array.isArray(messages) &&
          messages.map((m) => (
            <ChatMessage
              key={m.id || Math.random()}
              m={m}
              emotes={emotes}
              onInspectUser={handleInspectChatter}
            />
          ))}

        {systemLine && (
          <div className="border border-[#e5ff00]/40 bg-[#e5ff00]/5 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-[#e5ff00]">
            {systemLine}
          </div>
        )}
      </div>

      {/* Twitch-Style Chatter Profile Inspect Card Modal */}
      {inspectUser && (
        <div
          className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 animate-fade-in"
          onClick={() => setInspectUser(null)}
        >
          <div
            className="w-full max-w-xs border border-[#e5ff00]/50 bg-[#0c0c0e] p-4 shadow-[0_0_25px_rgba(229,255,0,0.15)] rounded-sm relative"
            onClick={(e) => e.stopPropagation()}
            data-testid="chatter-profile-card"
          >
            <button
              onClick={() => setInspectUser(null)}
              className="absolute top-3 right-3 text-zinc-400 hover:text-[#e5ff00]"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-3 border-b border-[#27272a] pb-3">
              {(inspectUser.photo_url || inspectUser.photoUrl || inspectUser.avatar || inspectUser.sender_photo_url) ? (
                <img
                  src={fileUrl(inspectUser.photo_url || inspectUser.photoUrl || inspectUser.avatar || inspectUser.sender_photo_url)}
                  alt=""
                  className="h-12 w-12 border border-[#e5ff00] object-cover rounded-sm"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center border border-[#27272a] bg-black rounded-sm">
                  <User className="h-6 w-6 text-[#e5ff00]" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs font-bold uppercase text-white truncate">
                  {inspectUser.display_name || inspectUser.username}
                </div>
                <div className="font-mono text-[10px] text-zinc-400 truncate">
                  @{inspectUser.username}
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-2 font-mono text-[11px]">
              {inspectUser.bio && (
                <div className="text-zinc-300 italic text-[10px] border-l-2 border-[#e5ff00] pl-2 py-0.5">
                  &ldquo;{inspectUser.bio}&rdquo;
                </div>
              )}

              <div className="flex items-center justify-between text-zinc-400 pt-1">
                <span className="flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-[#e5ff00]" /> Watts Balance:
                </span>
                <span className="font-bold text-[#e5ff00]">{inspectUser.watts ?? 100}</span>
              </div>

              <div className="flex items-center justify-between text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Users className="h-3 w-3 text-cyan-400" /> Followers:
                </span>
                <span className="font-bold text-white">{inspectUser.followers_count ?? 0}</span>
              </div>

              <div className="flex items-center justify-between text-zinc-400">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3 text-zinc-500" /> Joined:
                </span>
                <span className="text-[10px] text-zinc-300">
                  {inspectUser.created_at ? new Date(inspectUser.created_at).toLocaleDateString() : "Recent"}
                </span>
              </div>
            </div>

            <div className="mt-4 pt-3 border-t border-[#27272a] flex justify-end">
              <Link
                to={`/channel/${inspectUser.username}`}
                onClick={() => setInspectUser(null)}
                className="w-full text-center btn-primary py-1.5 text-[10px] uppercase font-bold"
              >
                VISIT CHANNEL
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Emote Picker Popover */}
      {showEmotePicker && (
        <div
          data-testid="emote-picker-popover"
          className="absolute bottom-16 right-3 left-3 z-30 border border-[#27272a] bg-[#050505] p-3 shadow-2xl rounded-sm"
        >
          <div className="flex items-center justify-between border-b border-[#27272a] pb-2">
            <div className="flex items-center gap-2">
              <Smile className="h-3.5 w-3.5 text-[#e5ff00]" />
              <span className="font-mono text-[10px] uppercase tracking-widest font-bold text-white">
                EMOTE VAULT
              </span>
            </div>
            <button
              onClick={() => setShowEmotePicker(false)}
              className="text-zinc-500 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <div className="flex gap-1 border border-[#27272a] bg-black p-0.5 font-mono text-[9px] uppercase">
              <button
                type="button"
                onClick={() => setEmoteTab("all")}
                className={`px-2 py-0.5 ${
                  emoteTab === "all" ? "bg-[#e5ff00] text-black font-bold" : "text-zinc-400"
                }`}
              >
                ALL
              </button>
              <button
                type="button"
                onClick={() => setEmoteTab("channel")}
                className={`px-2 py-0.5 ${
                  emoteTab === "channel" ? "bg-[#e5ff00] text-black font-bold" : "text-zinc-400"
                }`}
              >
                CHANNEL
              </button>
              <button
                type="button"
                onClick={() => setEmoteTab("global")}
                className={`px-2 py-0.5 ${
                  emoteTab === "global" ? "bg-[#e5ff00] text-black font-bold" : "text-zinc-400"
                }`}
              >
                GLOBAL
              </button>
            </div>
            <input
              className="input-terminal flex-1 py-1 text-[10px]"
              placeholder="Search emote..."
              value={emoteSearch}
              onChange={(e) => setEmoteSearch(e.target.value)}
            />
          </div>

          <div className="mt-3 grid max-h-40 grid-cols-5 gap-2 overflow-y-auto p-1 scrollbar-thin">
            {filteredEmotes.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => handleEmoteSelect(e.code)}
                className="flex flex-col items-center justify-center border border-[#27272a] bg-black p-1.5 hover:border-[#e5ff00] transition-colors rounded-sm group"
                title={`${e.name} (${e.code})`}
              >
                <img
                  src={e.image_url.startsWith("http") ? e.image_url : fileUrl(e.image_url)}
                  alt={e.code}
                  className="h-7 w-7 object-contain group-hover:scale-110 transition-transform"
                />
                <span className="mt-1 font-mono text-[8px] text-zinc-400 group-hover:text-[#e5ff00] truncate max-w-full">
                  {e.code}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Typing Indicator Bar */}
      {Object.keys(typingUsers).length > 0 && (
        <div
          className="px-3 py-1 bg-[#0d0d10] border-t border-[#27272a] text-[10px] font-mono flex items-center gap-1.5"
          data-testid="chat-typing-indicator"
        >
          <div className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-[#e5ff00] animate-ping" />
            <span className="h-1.5 w-1.5 rounded-full bg-[#e5ff00] animate-bounce" />
          </div>
          <span className="text-[#e5ff00] font-bold">
            {Object.values(typingUsers)
              .map((u) => u.displayName || u.username)
              .join(", ")}
          </span>
          <span className="text-zinc-400">
            {Object.keys(typingUsers).length === 1 ? "is typing..." : "are typing..."}
          </span>
        </div>
      )}

      {/* Input Bar */}
      <footer className="border-t border-[#27272a] p-3 bg-[#0a0a0a]">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] font-mono">
            <button
              type="button"
              onClick={() => setIsHighlight(!isHighlight)}
              disabled={watts < 50}
              data-testid="toggle-highlight-btn"
              className={`inline-flex items-center gap-1.5 border px-2 py-1 font-mono text-[10px] uppercase font-bold tracking-wider transition-all rounded-sm ${
                isHighlight
                  ? "border-[#e5ff00] bg-[#e5ff00] text-black shadow-[0_0_12px_rgba(229,255,0,0.6)]"
                  : watts >= 50
                  ? "border-[#e5ff00]/40 text-[#e5ff00] hover:border-[#e5ff00] bg-[#e5ff00]/10"
                  : "border-zinc-800 text-zinc-600 opacity-50 cursor-not-allowed"
              }`}
            >
              <Flame className={`h-3 w-3 ${isHighlight ? "animate-pulse" : ""}`} />
              <span>HIGH VOLTAGE SHOUT (50)</span>
            </button>

            {!user ? (
              <div className="flex items-center gap-1 text-zinc-400">
                <span className="border border-emerald-500/40 bg-emerald-500/10 px-1.5 py-0.5 font-bold text-emerald-400 text-[9px] uppercase rounded-xs">
                  UNLOCKED (GUEST)
                </span>
                {isEditingGuestName ? (
                  <form onSubmit={saveGuestName} className="flex items-center gap-1">
                    <input
                      className="bg-black border border-[#e5ff00] px-1 py-0.5 text-[10px] text-white focus:outline-none w-24"
                      value={tempGuestName}
                      onChange={(e) => setTempGuestName(e.target.value)}
                      placeholder="Guest Name"
                      autoFocus
                    />
                    <button type="submit" className="text-[#e5ff00] hover:underline font-bold text-[9px]">
                      SAVE
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => {
                      setTempGuestName(guestName);
                      setIsEditingGuestName(true);
                    }}
                    className="hover:text-[#e5ff00] text-zinc-400 underline text-[9px] uppercase"
                  >
                    Name: {guestName || "Guest"}
                  </button>
                )}
              </div>
            ) : (
              <span className="font-mono text-[9px] uppercase tracking-widest text-zinc-500">
                EARN 15 / 10S
              </span>
            )}
          </div>

          <form onSubmit={send} className="flex gap-2" data-testid="chat-form">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                data-testid="chat-input"
                className={`input-terminal w-full pr-8 ${
                  isHighlight ? "border-[#e5ff00] bg-[#e5ff00]/10 text-white font-bold" : ""
                }`}
                value={text}
                onChange={handleInputChange}
                placeholder={
                  isHighlight
                    ? "SHOUT WITH HIGH VOLTAGE GLOW..."
                    : "SHOUT INTO CHAT..."
                }
                maxLength={500}
                disabled={!connected}
              />
              <button
                type="button"
                onClick={() => setShowEmotePicker(!showEmotePicker)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-[#e5ff00]"
                title="Insert Emote"
              >
                <Smile className="h-4 w-4" />
              </button>
            </div>

            <button
              data-testid="chat-send"
              type="submit"
              className={`btn-primary ${isHighlight ? "bg-[#e5ff00] text-black hover:bg-[#c8de00]" : ""}`}
              disabled={!connected || !text.trim()}
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
}

function ChatMessage({ m, emotes, onInspectUser }) {
  const isHighVoltage = m.is_highlighted;
  const isSystemCommand = m.is_system_command || m.sender_uid === "system-bot" || m.sender_username === "sparkz_bot";

  const renderMessageContent = (text, emoteList) => {
    if (!text) return null;
    if (!emoteList || emoteList.length === 0) return text;

    const emoteMap = new Map();
    emoteList.forEach((e) => emoteMap.set(e.code, e));

    const parts = text.split(/(:[a-zA-Z0-9_]+:)/g);

    return parts.map((part, idx) => {
      if (emoteMap.has(part)) {
        const e = emoteMap.get(part);
        const url = e.image_url.startsWith("http") ? e.image_url : fileUrl(e.image_url);
        return (
          <img
            key={idx}
            src={url}
            alt={e.code}
            title={e.name || e.code}
            className="inline-block h-5 w-5 mx-0.5 object-contain align-middle rounded-sm shadow-sm hover:scale-125 transition-transform"
          />
        );
      }
      return part;
    });
  };

  if (isSystemCommand) {
    return (
      <div className="relative overflow-hidden p-3 my-2 border border-[#e5ff00] bg-black/60 shadow-[0_0_15px_rgba(229,255,0,0.15)] rounded-sm font-mono text-xs">
        <div className="flex items-center gap-2 mb-1.5">
          <div className="flex h-5 w-5 items-center justify-center border border-[#e5ff00] bg-[#e5ff00]/10 rounded-xs">
            <Sparkles className="h-3 w-3 text-[#e5ff00] animate-pulse" />
          </div>
          <span className="text-[9px] uppercase font-bold text-[#e5ff00] tracking-widest">
            SPARKZ ALERT // SYSTEM BOT
          </span>
        </div>
        <div className="text-zinc-100 font-bold leading-relaxed">
          {renderMessageContent(m.text, emotes)}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex items-start gap-2.5 p-1.5 transition-all rounded-sm ${
        isHighVoltage
          ? "border border-[#e5ff00] bg-gradient-to-r from-[#e5ff00]/15 via-[#e5ff00]/5 to-transparent shadow-[0_0_15px_rgba(229,255,0,0.2)]"
          : "hover:bg-white/5"
      }`}
    >
      {m.sender_photo_url ? (
        <img
          src={fileUrl(m.sender_photo_url)}
          alt=""
          className={`h-7 w-7 flex-shrink-0 border object-cover grayscale rounded-sm ${
            isHighVoltage ? "border-[#e5ff00]" : "border-[#27272a]"
          }`}
        />
      ) : (
        <div
          className={`flex h-7 w-7 flex-shrink-0 items-center justify-center border bg-black rounded-sm ${
            isHighVoltage ? "border-[#e5ff00]" : "border-[#27272a]"
          }`}
        >
          <User className="h-3.5 w-3.5 text-zinc-500" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <BadgeFlares badges={m.sender_badges} />

          {/* Clickable Chatter Username to inspect profile */}
          <button
            type="button"
            onClick={() => onInspectUser(m.sender_username, m.sender_photo_url)}
            className="truncate font-mono text-[11px] font-bold uppercase tracking-widest hover:underline cursor-pointer text-left"
            style={{ color: m.sender_color || "#e5ff00" }}
            title="Click to inspect chatter profile"
          >
            {m.sender_display_name}
          </button>

          <span className="truncate font-mono text-[10px] text-zinc-500">
            @{m.sender_username}
          </span>

          {isHighVoltage && (
            <span className="inline-flex items-center gap-1 border border-[#e5ff00] bg-[#e5ff00] px-1.5 py-0.2 font-mono text-[8px] uppercase font-black text-black tracking-widest rounded-xs">
              <Zap className="h-2.5 w-2.5 fill-black" /> VOLTAGE
            </span>
          )}
        </div>

        <div
          className={`mt-1 break-words font-mono text-xs leading-relaxed ${
            isHighVoltage ? "font-bold text-white text-[13px] drop-shadow-md" : "text-zinc-200"
          }`}
        >
          {renderMessageContent(m.text, emotes)}
        </div>
      </div>
    </div>
  );
}

function BadgeFlares({ badges }) {
  if (!Array.isArray(badges) || badges.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {badges.includes("guest") && (
        <span className="inline-flex items-center gap-0.5 border border-zinc-700 bg-zinc-800/80 px-1 py-0.2 font-mono text-[8px] uppercase font-bold text-zinc-300 rounded-xs">
          <User className="h-2.5 w-2.5" /> GUEST
        </span>
      )}
      {badges.includes("broadcaster") && (
        <span className="inline-flex items-center gap-0.5 border border-[#e5ff00] bg-[#e5ff00]/15 px-1 py-0.2 font-mono text-[8px] uppercase font-bold text-[#e5ff00] rounded-xs">
          <Crown className="h-2.5 w-2.5 fill-[#e5ff00]" /> HOST
        </span>
      )}
      {badges.includes("mod") && (
        <span className="inline-flex items-center gap-0.5 border border-emerald-400 bg-emerald-500/15 px-1 py-0.2 font-mono text-[8px] uppercase font-bold text-emerald-400 rounded-xs">
          <Shield className="h-2.5 w-2.5 fill-emerald-400" /> MOD
        </span>
      )}
      {badges.includes("vip") && (
        <span className="inline-flex items-center gap-0.5 border border-fuchsia-400 bg-fuchsia-500/15 px-1 py-0.2 font-mono text-[8px] uppercase font-bold text-fuchsia-400 rounded-xs">
          <Gem className="h-2.5 w-2.5 fill-fuchsia-400" /> VIP
        </span>
      )}
      {badges.includes("supporter") && (
        <span className="inline-flex items-center gap-0.5 border border-cyan-400 bg-cyan-500/15 px-1 py-0.2 font-mono text-[8px] uppercase font-bold text-cyan-400 rounded-xs">
          <Zap className="h-2.5 w-2.5 fill-cyan-400" /> SUPPORTER
        </span>
      )}
    </div>
  );
}