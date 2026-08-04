import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth-context";
import { db } from "@/lib/firebase";
import { api, fileUrl } from "@/lib/api";
import { 
  collection, 
  addDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  query, 
  orderBy, 
  limit, 
  setDoc 
} from "firebase/firestore";
import { 
  MessageSquare, 
  Video, 
  VideoOff, 
  Mic, 
  MicOff, 
  Music, 
  Link as LinkIcon, 
  UploadCloud, 
  Trash2, 
  Pin, 
  Play, 
  Pause, 
  Volume2, 
  X, 
  Radio, 
  Sparkles,
  Lock,
  Loader2,
  Check
} from "lucide-react";
import { toast } from "sonner";

// Check if a user is the host/admin
const isHost = (user) => {
  if (!user) return false;
  return user.email === "markysparks99@gmail.com" || user.is_admin || user.isAdmin || user.role === "admin";
};

export default function Lounge() {
  const { user } = useAuth();
  
  // Real-time states
  const [messages, setMessages] = useState([]);
  const [mixes, setMixes] = useState([]);
  const [featured, setFeatured] = useState([]);
  
  // Local interaction states
  const [chatInput, setChatInput] = useState("");
  const [isWebcamOn, setIsWebcamOn] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [localStream, setLocalStream] = useState(null);
  const videoRef = useRef(null);
  
  // Mix upload states
  const [mixTitle, setMixTitle] = useState("");
  const [mixUrl, setMixUrl] = useState("");
  const [mixDesc, setMixDesc] = useState("");
  const [mixType, setMixType] = useState("link"); // "link" | "audio"
  const [audioFile, setAudioFile] = useState(null);
  const [isUploadingMix, setIsUploadingMix] = useState(false);
  const [mixUploadProgress, setMixUploadProgress] = useState(0);

  // Host pinning states
  const [hostTitle, setHostTitle] = useState("");
  const [hostUrl, setHostUrl] = useState("");
  const [hostDesc, setHostDesc] = useState("");
  const [hostType, setHostType] = useState("link"); // "link" | "audio"
  const [hostAudioFile, setHostAudioFile] = useState(null);
  const [isUploadingHost, setIsUploadingHost] = useState(false);

  // Audio Player states
  const [activeTrack, setActiveTrack] = useState(null); // { title, url, sender_name, id }
  const [isPlaying, setIsPlaying] = useState(false);
  const [trackProgress, setTrackProgress] = useState(0);
  const [trackDuration, setTrackDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const audioElRef = useRef(null);
  const lastTrackIdRef = useRef(null);
  
  const chatContainerRef = useRef(null);

  // Scroll window to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // 1. Listen for Real-Time Lounge Chat Messages
  useEffect(() => {
    const q = query(
      collection(db, "lounge_messages"),
      orderBy("created_at", "asc"),
      limit(100)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = [];
      snapshot.forEach((docSnap) => {
        msgs.push({ id: docSnap.id, ...docSnap.data() });
      });
      setMessages(msgs);
      // Auto scroll container
      setTimeout(() => {
        if (chatContainerRef.current) {
          chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
      }, 100);
    }, (err) => {
      console.error("Lounge Chat snapshot error:", err);
    });
    return () => unsubscribe();
  }, []);

  // 2. Listen for Shared Mixes
  useEffect(() => {
    const q = query(
      collection(db, "lounge_mixes"),
      orderBy("created_at", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const mx = [];
      snapshot.forEach((docSnap) => {
        mx.push({ id: docSnap.id, ...docSnap.data() });
      });
      setMixes(mx);
    }, (err) => {
      console.error("Lounge Mixes snapshot error:", err);
    });
    return () => unsubscribe();
  }, []);

  // 3. Listen for Featured Pinboard Tracks
  useEffect(() => {
    const q = query(
      collection(db, "lounge_featured"),
      orderBy("created_at", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const feat = [];
      snapshot.forEach((docSnap) => {
        feat.push({ id: docSnap.id, ...docSnap.data() });
      });
      setFeatured(feat);
    }, (err) => {
      console.error("Lounge Featured snapshot error:", err);
    });
    return () => unsubscribe();
  }, []);

  // 4. Handle Webcam Activation
  useEffect(() => {
    if (isWebcamOn) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: isMicOn })
        .then((stream) => {
          setLocalStream(stream);
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
          }
        })
        .catch((err) => {
          console.error("Error accessing webcam:", err);
          toast.error("Could not access camera. Please check permissions.");
          setIsWebcamOn(false);
        });
    } else {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        setLocalStream(null);
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }

    return () => {
      if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isWebcamOn]);

  // Handle local microphone toggle
  const toggleMic = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isMicOn;
        setIsMicOn(!isMicOn);
      }
    } else {
      setIsMicOn(!isMicOn);
    }
  };

  // 5. Submit chat message
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.error("You must be logged in to participate in the chat.");
      return;
    }
    if (!chatInput.trim()) return;

    try {
      await addDoc(collection(db, "lounge_messages"), {
        text: chatInput.trim(),
        sender_uid: user.uid,
        sender_username: user.username,
        sender_display_name: user.display_name,
        sender_photo_url: user.photo_url || null,
        created_at: new Date().toISOString()
      });
      setChatInput("");
    } catch (err) {
      console.error("Failed to send message:", err);
      toast.error("Message failed to send.");
    }
  };

  // Delete message (Moderation)
  const handleDeleteMessage = async (msgId) => {
    if (!isHost(user)) return;
    try {
      await deleteDoc(doc(db, "lounge_messages", msgId));
      toast.success("Message moderated.");
    } catch (err) {
      toast.error("Could not delete message.");
    }
  };

  // 6. Handle User Mix File / Link Submission
  const handleUploadMix = async (e) => {
    e.preventDefault();
    if (!user) {
      toast.error("Please login to share your mixes.");
      return;
    }
    if (!mixTitle.trim()) {
      toast.error("Please enter a title for your mix.");
      return;
    }

    let finalUrl = mixUrl.trim();

    if (mixType === "audio") {
      if (!audioFile) {
        toast.error("Please select an audio file to upload.");
        return;
      }
      setIsUploadingMix(true);
      setMixUploadProgress(20);
      try {
        const formData = new FormData();
        formData.append("file", audioFile);
        formData.append("filename", audioFile.name);

        setMixUploadProgress(40);
        const res = await api.post("/upload", formData);
        setMixUploadProgress(80);
        
        if (res.data?.url) {
          finalUrl = res.data.url;
        } else {
          throw new Error("Upload response did not return a valid URL.");
        }
      } catch (err) {
        console.error("Audio upload error:", err);
        toast.error("Audio file upload failed.");
        setIsUploadingMix(false);
        return;
      }
    }

    if (!finalUrl) {
      toast.error("Please provide a mix audio file or external link.");
      setIsUploadingMix(false);
      return;
    }

    try {
      await addDoc(collection(db, "lounge_mixes"), {
        title: mixTitle.trim(),
        url: finalUrl,
        type: mixType,
        description: mixDesc.trim(),
        uid: user.uid,
        username: user.username,
        display_name: user.display_name,
        photo_url: user.photo_url || null,
        created_at: new Date().toISOString()
      });

      toast.success("Mix shared in the lounge!");
      setMixTitle("");
      setMixUrl("");
      setMixDesc("");
      setAudioFile(null);
      setMixUploadProgress(0);
      setIsUploadingMix(false);
    } catch (err) {
      console.error("Failed to post mix:", err);
      toast.error("Could not post mix.");
      setIsUploadingMix(false);
    }
  };

  // Delete shared mix
  const handleDeleteMix = async (mixId, mixUid) => {
    if (!user) return;
    const canDelete = isHost(user) || user.uid === mixUid;
    if (!canDelete) return;

    try {
      await deleteDoc(doc(db, "lounge_mixes", mixId));
      toast.success("Mix removed.");
    } catch (err) {
      toast.error("Could not delete mix.");
    }
  };

  // 7. Handle Host Featured Pin/Upload
  const handleHostFeaturedSubmit = async (e) => {
    e.preventDefault();
    if (!isHost(user)) {
      toast.error("Only the host can pin featured tracks.");
      return;
    }
    if (!hostTitle.trim()) {
      toast.error("Please enter a title.");
      return;
    }

    let finalUrl = hostUrl.trim();

    if (hostType === "audio") {
      if (!hostAudioFile) {
        toast.error("Please select an MP3 file to pin.");
        return;
      }
      setIsUploadingHost(true);
      try {
        const formData = new FormData();
        formData.append("file", hostAudioFile);
        formData.append("filename", hostAudioFile.name);

        const res = await api.post("/upload", formData);
        if (res.data?.url) {
          finalUrl = res.data.url;
        } else {
          throw new Error("Pin upload failed.");
        }
      } catch (err) {
        console.error("Host file upload error:", err);
        toast.error("Failed to upload featured track.");
        setIsUploadingHost(false);
        return;
      }
    }

    if (!finalUrl) {
      toast.error("Provide a URL or upload an audio file.");
      setIsUploadingHost(false);
      return;
    }

    try {
      const id = "featured_" + Date.now();
      await setDoc(doc(db, "lounge_featured", id), {
        id,
        title: hostTitle.trim(),
        url: finalUrl,
        type: hostType,
        description: hostDesc.trim(),
        pinned: true,
        created_at: new Date().toISOString()
      });

      toast.success("Featured track pinned!");
      setHostTitle("");
      setHostUrl("");
      setHostDesc("");
      setHostAudioFile(null);
      setIsUploadingHost(false);
    } catch (err) {
      console.error("Pinning error:", err);
      toast.error("Failed to pin featured track.");
      setIsUploadingHost(false);
    }
  };

  // Unpin / delete featured track
  const handleUnpinTrack = async (trackId) => {
    if (!isHost(user)) return;
    try {
      await deleteDoc(doc(db, "lounge_featured", trackId));
      toast.success("Unpinned track.");
      if (activeTrack?.id === trackId) {
        setActiveTrack(null);
        setIsPlaying(false);
      }
    } catch (err) {
      toast.error("Could not unpin track.");
    }
  };

  // 8. Audio Player control functions
  const playTrack = (track) => {
    setActiveTrack(track);
    setIsPlaying(true);
    setTrackProgress(0);
    toast.info(`Now playing: ${track.title}`);
  };

  const togglePlayPause = () => {
    if (!activeTrack) return;
    setIsPlaying(!isPlaying);
  };

  useEffect(() => {
    if (!audioElRef.current) return;

    const audio = audioElRef.current;
    const trackChanged = lastTrackIdRef.current !== activeTrack?.id;
    lastTrackIdRef.current = activeTrack?.id;

    if (trackChanged) {
      audio.pause();
    } else {
      if (isPlaying) {
        audio.play().catch(e => {
          console.warn("Audio autoplay blocked or failed:", e);
          setIsPlaying(false);
        });
      } else {
        audio.pause();
      }
    }
  }, [isPlaying, activeTrack]);

  const handleCanPlay = () => {
    if (audioElRef.current && isPlaying) {
      audioElRef.current.play().catch(e => {
        console.warn("Audio play failed on canplay:", e);
        if (e.name === "NotAllowedError") {
          setIsPlaying(false);
        }
      });
    }
  };

  const handleTimeUpdate = () => {
    if (audioElRef.current) {
      setTrackProgress(audioElRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioElRef.current) {
      setTrackDuration(audioElRef.current.duration);
    }
  };

  const handleAudioSeek = (e) => {
    const time = parseFloat(e.target.value);
    setTrackProgress(time);
    if (audioElRef.current) {
      audioElRef.current.currentTime = time;
    }
  };

  const formatTime = (time) => {
    if (isNaN(time)) return "00:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen bg-[#030303] text-zinc-100 pb-32">
      {/* Immersive Top Lounge Banner */}
      <div className="relative border-b border-[#222] bg-gradient-to-r from-black via-zinc-950 to-black px-4 py-8 sm:px-8">
        <div className="mx-auto max-w-7xl flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 font-mono text-[11px] text-[#e5ff00] tracking-widest uppercase">
              <Radio className="h-3 w-3 animate-pulse" />
              Hangout Frequency Active
            </div>
            <h1 className="text-3xl font-display font-black tracking-tight mt-1">
              THE <span className="text-[#e5ff00]">LOUNGE</span>
            </h1>
            <p className="text-xs text-zinc-400 mt-1 max-w-lg">
              The ultimate broadcast afterparty. Put your webcams on, share underground mixes, listen to pins with the host, and chill with the community.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex -space-x-2">
              <div className="h-7 w-7 rounded-full border border-black bg-zinc-800 flex items-center justify-center font-mono text-[10px] text-zinc-400">DJ</div>
              <div className="h-7 w-7 rounded-full border border-black bg-zinc-900 flex items-center justify-center font-mono text-[10px] text-[#e5ff00]">★</div>
              <div className="h-7 w-7 rounded-full border border-black bg-[#e5ff00] flex items-center justify-center font-mono text-[10px] text-black font-bold">L</div>
            </div>
            <span className="font-mono text-xs uppercase text-zinc-300 tracking-wider">
              {messages.length > 0 ? `${Math.min(messages.length * 2 + 3, 42)} online` : "Connecting to Frequency..."}
            </span>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          
          {/* LEFT/CENTER MAIN LOUNGE (3 COLS) */}
          <div className="lg:col-span-3 space-y-6">
            
            {/* WEBCAM GRID SECTION */}
            <div className="border border-[#222] bg-[#09090b] p-4">
              <div className="flex items-center justify-between border-b border-[#1b1b1f] pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Video className="h-4 w-4 text-[#e5ff00]" />
                  <h2 className="font-mono text-xs uppercase tracking-widest font-black">
                    Live Video Hangout Feed
                  </h2>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsWebcamOn(!isWebcamOn)}
                    className={`flex items-center gap-1.5 px-3 py-1 font-mono text-[11px] uppercase border transition-all ${
                      isWebcamOn 
                        ? "bg-[#e5ff00]/10 border-[#e5ff00] text-[#e5ff00]" 
                        : "bg-black border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white"
                    }`}
                  >
                    {isWebcamOn ? (
                      <>
                        <VideoOff className="h-3 w-3" />
                        Go Off Camera
                      </>
                    ) : (
                      <>
                        <Video className="h-3 w-3" />
                        Join On Camera
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={toggleMic}
                    disabled={!isWebcamOn}
                    className={`px-2.5 py-1 border transition-all ${
                      !isWebcamOn 
                        ? "border-zinc-900 bg-zinc-950 text-zinc-700 cursor-not-allowed" 
                        : isMicOn 
                          ? "bg-zinc-900 border-zinc-700 text-zinc-300 hover:border-zinc-500" 
                          : "bg-red-950/20 border-red-900 text-red-500"
                    }`}
                    title={isMicOn ? "Mute Microphone" : "Unmute Microphone"}
                  >
                    {isMicOn ? <Mic className="h-3 w-3" /> : <MicOff className="h-3 w-3" />}
                  </button>
                </div>
              </div>

              {/* Grid of video streams */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                {/* User local webcam card */}
                <div className={`relative aspect-video bg-zinc-950 border overflow-hidden flex flex-col justify-between p-2.5 transition-all ${
                  isWebcamOn ? "border-[#e5ff00]" : "border-zinc-800"
                }`}>
                  {isWebcamOn ? (
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                    />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center">
                      <div className="h-8 w-8 rounded-full border border-dashed border-zinc-700 flex items-center justify-center mb-2">
                        <Video className="h-4 w-4 text-zinc-500" />
                      </div>
                      <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider">Camera Offline</span>
                    </div>
                  )}

                  {/* Top overlay */}
                  <div className="relative z-10 flex items-center justify-between">
                    <span className="bg-black/80 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-zinc-400 border border-zinc-800">
                      You
                    </span>
                    {isWebcamOn && (
                      <div className="flex h-1.5 w-1.5 rounded-full bg-[#e5ff00] animate-ping" />
                    )}
                  </div>

                  {/* Bottom overlay */}
                  <div className="relative z-10 flex items-center justify-between mt-auto bg-black/60 p-1 backdrop-blur-sm border border-zinc-900">
                    <span className="font-mono text-[10px] font-bold text-[#e5ff00] truncate max-w-[80px]">
                      @{user?.username || "Guest"}
                    </span>
                    <div className="flex items-center gap-1">
                      {isMicOn ? (
                        <div className="flex gap-0.5 items-end h-2 w-3">
                          <div className={`w-0.5 bg-[#e5ff00] ${isWebcamOn ? "animate-bounce" : "h-1"}`} style={{ height: "60%", animationDelay: "0.1s" }} />
                          <div className={`w-0.5 bg-[#e5ff00] ${isWebcamOn ? "animate-bounce" : "h-2"}`} style={{ height: "100%", animationDelay: "0.3s" }} />
                          <div className={`w-0.5 bg-[#e5ff00] ${isWebcamOn ? "animate-bounce" : "h-1.5"}`} style={{ height: "40%", animationDelay: "0.5s" }} />
                        </div>
                      ) : (
                        <MicOff className="h-2.5 w-2.5 text-red-500" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* TWOPANE REALTIME SECTION: CHAT & UPLOADER */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* REAL-TIME LOUNGE CHAT */}
              <div className="border border-[#222] bg-[#09090b] flex flex-col h-[400px]">
                <div className="border-b border-[#1b1b1f] p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-[#e5ff00]" />
                    <span className="font-mono text-xs uppercase tracking-widest font-black">Lounge Feed Chat</span>
                  </div>
                  <span className="bg-[#1b1b1f] px-2 py-0.5 font-mono text-[10px] text-zinc-400 uppercase">
                    Live Sync
                  </span>
                </div>

                {/* Messages Box */}
                <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
                  {messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-4">
                      <p className="font-mono text-[11px] text-zinc-500 uppercase tracking-wider">
                        Frequency quiet. Say hello!
                      </p>
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className="group flex items-start gap-2 text-xs border-b border-[#111] pb-2 last:border-b-0">
                        {m.sender_photo_url ? (
                          <img
                            src={fileUrl(m.sender_photo_url)}
                            alt=""
                            className="h-6 w-6 object-cover bg-zinc-900 border border-zinc-800"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <div className="h-6 w-6 bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-[10px] text-zinc-400">
                            {m.sender_username?.substring(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#e5ff00] truncate">
                              {m.sender_display_name}
                              <span className="font-normal text-zinc-500 text-[10px] ml-1">@{m.sender_username}</span>
                            </span>
                            
                            <div className="flex items-center gap-1.5">
                              {isHost(user) && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteMessage(m.id)}
                                  className="text-zinc-600 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Delete Message"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                              <span className="text-[9px] text-zinc-600 font-mono">
                                {m.created_at ? new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ""}
                              </span>
                            </div>
                          </div>
                          <p className="text-zinc-300 mt-0.5 break-all leading-relaxed whitespace-pre-wrap">{m.text}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Form input */}
                <form onSubmit={handleSendMessage} className="border-t border-[#1b1b1f] p-3 flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={user ? "Type a lounge message..." : "Log in to post a message..."}
                    disabled={!user}
                    className="flex-1 border border-zinc-800 bg-black px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-500 focus:border-[#e5ff00] focus:outline-none disabled:cursor-not-allowed"
                  />
                  <button
                    type="submit"
                    disabled={!user || !chatInput.trim()}
                    className="bg-[#e5ff00] text-black px-4 py-1.5 font-mono text-xs font-black uppercase tracking-widest hover:bg-[#cbf000] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    SEND
                  </button>
                </form>
              </div>

              {/* MIX & LINK UPLOADER */}
              <div className="border border-[#222] bg-[#09090b] p-4 flex flex-col h-[400px]">
                <div className="border-b border-[#1b1b1f] pb-3 mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Music className="h-4 w-4 text-[#e5ff00]" />
                    <span className="font-mono text-xs uppercase tracking-widest font-black">
                      Share Your Music / Mix
                    </span>
                  </div>
                  <span className="font-mono text-[9px] text-zinc-500 uppercase">
                    Artist Board
                  </span>
                </div>

                {!user ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border border-dashed border-zinc-800 bg-black/40">
                    <Lock className="h-6 w-6 text-zinc-600 mb-2" />
                    <h3 className="font-mono text-[11px] uppercase font-bold text-zinc-400">Authentication Required</h3>
                    <p className="text-xs text-zinc-500 mt-1 max-w-[200px]">
                      Please register or login to upload mix audio files or link tracks!
                    </p>
                  </div>
                ) : (
                  <form onSubmit={handleUploadMix} className="flex-1 flex flex-col justify-between space-y-3">
                    <div className="space-y-2.5 overflow-y-auto pr-1">
                      {/* Mix type Selector */}
                      <div className="flex border border-zinc-800">
                        <button
                          type="button"
                          onClick={() => { setMixType("link"); setAudioFile(null); }}
                          className={`flex-1 py-1 font-mono text-[10px] uppercase text-center transition-all ${
                            mixType === "link" ? "bg-zinc-800 text-white font-bold" : "bg-black text-zinc-500"
                          }`}
                        >
                          <span className="flex items-center justify-center gap-1">
                            <LinkIcon className="h-2.5 w-2.5" />
                            External Link
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => { setMixType("audio"); setMixUrl(""); }}
                          className={`flex-1 py-1 font-mono text-[10px] uppercase text-center transition-all ${
                            mixType === "audio" ? "bg-zinc-800 text-[#e5ff00] font-bold" : "bg-black text-zinc-500"
                          }`}
                        >
                          <span className="flex items-center justify-center gap-1">
                            <UploadCloud className="h-2.5 w-2.5" />
                            Direct MP3 Upload
                          </span>
                        </button>
                      </div>

                      {/* Title input */}
                      <div>
                        <input
                          type="text"
                          value={mixTitle}
                          onChange={(e) => setMixTitle(e.target.value)}
                          placeholder="Mix or Track Title"
                          className="w-full border border-zinc-800 bg-black px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-500 focus:border-[#e5ff00] focus:outline-none"
                          required
                        />
                      </div>

                      {/* URL input vs File upload */}
                      {mixType === "link" ? (
                        <div>
                          <input
                            type="url"
                            value={mixUrl}
                            onChange={(e) => setMixUrl(e.target.value)}
                            placeholder="SoundCloud, Youtube, Spotify, etc."
                            className="w-full border border-zinc-800 bg-black px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-500 focus:border-[#e5ff00] focus:outline-none"
                            required={mixType === "link"}
                          />
                        </div>
                      ) : (
                        <div className="border border-dashed border-zinc-800 bg-black p-3 text-center transition-all hover:border-[#e5ff00]/40">
                          <input
                            type="file"
                            accept="audio/mp3, audio/*"
                            onChange={(e) => setAudioFile(e.target.files[0])}
                            className="hidden"
                            id="lounge-mix-file"
                          />
                          <label htmlFor="lounge-mix-file" className="cursor-pointer block">
                            {audioFile ? (
                              <div className="flex flex-col items-center">
                                <Check className="h-5 w-5 text-[#e5ff00] mb-1" />
                                <span className="font-mono text-xs text-zinc-300 font-bold truncate max-w-[200px]">
                                  {audioFile.name}
                                </span>
                                <span className="text-[10px] text-zinc-500 mt-0.5">
                                  Click to change file
                                </span>
                              </div>
                            ) : (
                              <div className="flex flex-col items-center py-2">
                                <UploadCloud className="h-5 w-5 text-zinc-500 mb-1" />
                                <span className="font-mono text-[10px] text-zinc-400 uppercase tracking-wider">
                                  Drag or Click to Upload Audio
                                </span>
                                <span className="text-[9px] text-zinc-600 mt-1">
                                  MP3, WAV, AAC, etc.
                                </span>
                              </div>
                            )}
                          </label>
                        </div>
                      )}

                      {/* Description */}
                      <div>
                        <textarea
                          value={mixDesc}
                          onChange={(e) => setMixDesc(e.target.value)}
                          placeholder="Add details, genre, notes... (optional)"
                          rows={2}
                          className="w-full border border-zinc-800 bg-black px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-500 focus:border-[#e5ff00] focus:outline-none resize-none"
                        />
                      </div>
                    </div>

                    {isUploadingMix && (
                      <div className="w-full bg-zinc-950 p-2 border border-zinc-900 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 className="h-3 w-3 animate-spin text-[#e5ff00]" />
                          <span className="font-mono text-[10px] text-[#e5ff00] uppercase tracking-wider">
                            Uploading to Storage ({mixUploadProgress}%)
                          </span>
                        </div>
                      </div>
                    )}

                    <button
                      type="submit"
                      disabled={isUploadingMix}
                      className="w-full bg-[#e5ff00] text-black py-2 font-mono text-xs font-black uppercase tracking-widest hover:bg-[#cbf000] transition-colors flex items-center justify-center gap-2"
                    >
                      {isUploadingMix ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          UPLOADING...
                        </>
                      ) : (
                        "SHARE IN LOUNGE"
                      )}
                    </button>
                  </form>
                )}
              </div>
            </div>

            {/* SHARED MUSIC STREAM / MUSIC PLAYER LIST */}
            <div className="border border-[#222] bg-[#09090b] p-4">
              <div className="flex items-center gap-2 border-b border-[#1b1b1f] pb-3 mb-4">
                <Music className="h-4 w-4 text-[#e5ff00]" />
                <h2 className="font-mono text-xs uppercase tracking-widest font-black">
                  Community Mix & Track Vault
                </h2>
              </div>

              {mixes.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 font-mono text-xs uppercase">
                  No mixes shared yet. Be the first to drop some sound!
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {mixes.map((item) => (
                    <div 
                      key={item.id} 
                      className={`border border-zinc-800 p-3 bg-black flex flex-col justify-between relative group hover:border-[#e5ff00]/40 transition-colors ${
                        activeTrack?.id === item.id ? "border-[#e5ff00]" : ""
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <span className="bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono text-[8px] uppercase px-1.5 py-0.5 tracking-wider">
                              {item.type === "audio" ? "Direct MP3" : "External Track"}
                            </span>
                            <h3 className="font-display font-black text-sm tracking-tight text-white mt-1.5 truncate max-w-[220px]">
                              {item.title}
                            </h3>
                          </div>

                          <div className="flex items-center gap-1">
                            {/* Play button */}
                            {(item.type === "audio" || item.url.endsWith(".mp3") || item.url.includes("firebasestorage") || item.url.includes("/api/files/")) && (
                              <button
                                type="button"
                                onClick={() => playTrack({
                                  id: item.id,
                                  title: item.title,
                                  url: item.url,
                                  sender_name: item.display_name
                                })}
                                className="h-7 w-7 rounded-full bg-[#e5ff00] text-black flex items-center justify-center hover:bg-[#cbf000] transition-colors"
                                title="Play Track"
                              >
                                <Play className="h-3 w-3 fill-black ml-0.5" />
                              </button>
                            )}

                            {/* Delete button if owner or admin */}
                            {user && (user.uid === item.uid || isHost(user)) && (
                              <button
                                type="button"
                                onClick={() => handleDeleteMix(item.id, item.uid)}
                                className="h-7 w-7 border border-zinc-800 text-zinc-500 hover:text-red-500 flex items-center justify-center hover:border-red-900 transition-colors"
                                title="Delete shared track"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {item.description && (
                          <p className="text-zinc-400 text-xs mt-1 italic font-mono line-clamp-2">
                            "{item.description}"
                          </p>
                        )}
                      </div>

                      <div className="mt-4 pt-2.5 border-t border-zinc-950 flex items-center justify-between text-[10px] text-zinc-500">
                        <span className="font-mono truncate max-w-[140px]">
                          Shared by: <span className="text-zinc-300 font-bold">@{item.username}</span>
                        </span>
                        
                        {item.type === "link" && (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#e5ff00] hover:underline font-mono flex items-center gap-1 uppercase text-[9px] tracking-wider"
                          >
                            <LinkIcon className="h-2 w-2" />
                            Open Link
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* EXCLUSIVE HOST SIDEBAR (1 COL) */}
          <div className="space-y-6">
            
            {/* FEATURED / HOST SECTION */}
            <div className="border border-[#222] bg-[#09090b] p-4">
              <div className="flex items-center gap-2 border-b border-[#1b1b1f] pb-3 mb-4">
                <Pin className="h-4 w-4 text-[#e5ff00]" />
                <h2 className="font-mono text-xs uppercase tracking-widest font-black">
                  Host Featured Pins
                </h2>
              </div>

              {/* Pinboard description */}
              <p className="text-[11px] text-zinc-400 font-mono mb-4 leading-relaxed">
                Featured sets, locked tracks, and priority mixes hand-picked by the host. Click to play and vibe.
              </p>

              {/* Pin board items */}
              {featured.length === 0 ? (
                <div className="text-center py-6 text-zinc-600 font-mono text-[10px] uppercase border border-zinc-900 bg-black/40">
                  No featured tracks currently pinned by the host.
                </div>
              ) : (
                <div className="space-y-3">
                  {featured.map((track) => (
                    <div 
                      key={track.id} 
                      className={`p-3 border transition-colors relative flex items-center justify-between gap-3 ${
                        activeTrack?.id === track.id 
                          ? "bg-[#e5ff00]/5 border-[#e5ff00]" 
                          : "bg-black border-zinc-800 hover:border-zinc-700"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <Pin className="h-2.5 w-2.5 text-[#e5ff00] fill-[#e5ff00]" />
                          <span className="font-mono text-[8px] uppercase text-[#e5ff00] tracking-widest font-bold">
                            Featured Set
                          </span>
                        </div>
                        
                        <h4 className="font-display font-bold text-xs mt-1 tracking-tight text-white truncate">
                          {track.title}
                        </h4>
                        
                        {track.description && (
                          <p className="text-[10px] text-zinc-500 font-mono truncate mt-0.5">
                            {track.description}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => playTrack({
                            id: track.id,
                            title: track.title,
                            url: track.url,
                            sender_name: "HOST"
                          })}
                          className="h-7 w-7 rounded-full bg-[#e5ff00] text-black flex items-center justify-center hover:bg-[#cbf000] transition-colors"
                          title="Play Track"
                        >
                          <Play className="h-3 w-3 fill-black ml-0.5" />
                        </button>

                        {isHost(user) && (
                          <button
                            type="button"
                            onClick={() => handleUnpinTrack(track.id)}
                            className="h-7 w-7 border border-zinc-800 text-zinc-500 hover:text-red-500 hover:border-red-900 transition-colors flex items-center justify-center"
                            title="Unpin track"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* HOST ONLY PINNER CONTROL (VISIBLE ONLY TO ADMIN) */}
            {isHost(user) ? (
              <div className="border border-[#e5ff00]/40 bg-zinc-950 p-4 relative overflow-hidden">
                <div className="absolute top-0 right-0 bg-[#e5ff00] text-black font-mono text-[8px] font-bold px-2 py-0.5 uppercase tracking-widest">
                  Host Panel
                </div>
                
                <div className="flex items-center gap-2 border-b border-zinc-800 pb-3 mb-4">
                  <Sparkles className="h-4 w-4 text-[#e5ff00]" />
                  <h3 className="font-mono text-xs uppercase tracking-widest font-black text-[#e5ff00]">
                    Host Stream Pinner
                  </h3>
                </div>

                <form onSubmit={handleHostFeaturedSubmit} className="space-y-3">
                  <div className="flex border border-zinc-800 bg-black">
                    <button
                      type="button"
                      onClick={() => { setHostType("link"); setHostAudioFile(null); }}
                      className={`flex-1 py-1 font-mono text-[9px] uppercase transition-all ${
                        hostType === "link" ? "bg-zinc-800 text-white" : "text-zinc-500"
                      }`}
                    >
                      Direct Link
                    </button>
                    <button
                      type="button"
                      onClick={() => { setHostType("audio"); setHostUrl(""); }}
                      className={`flex-1 py-1 font-mono text-[9px] uppercase transition-all ${
                        hostType === "audio" ? "bg-zinc-800 text-[#e5ff00]" : "text-zinc-500"
                      }`}
                    >
                      Upload MP3
                    </button>
                  </div>

                  <div>
                    <input
                      type="text"
                      value={hostTitle}
                      onChange={(e) => setHostTitle(e.target.value)}
                      placeholder="Featured Track/Mix Name"
                      className="w-full border border-zinc-800 bg-black px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-500 focus:border-[#e5ff00] focus:outline-none"
                      required
                    />
                  </div>

                  {hostType === "link" ? (
                    <div>
                      <input
                        type="url"
                        value={hostUrl}
                        onChange={(e) => setHostUrl(e.target.value)}
                        placeholder="Direct Audio link or stream URL"
                        className="w-full border border-zinc-800 bg-black px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-500 focus:border-[#e5ff00] focus:outline-none"
                        required={hostType === "link"}
                      />
                    </div>
                  ) : (
                    <div className="border border-dashed border-zinc-800 bg-black p-3 text-center">
                      <input
                        type="file"
                        accept="audio/mp3, audio/*"
                        onChange={(e) => setHostAudioFile(e.target.files[0])}
                        className="hidden"
                        id="host-pin-file"
                      />
                      <label htmlFor="host-pin-file" className="cursor-pointer block">
                        {hostAudioFile ? (
                          <span className="font-mono text-xs text-[#e5ff00] font-bold truncate max-w-[150px] block mx-auto">
                            {hostAudioFile.name}
                          </span>
                        ) : (
                          <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-wider block">
                            Choose MP3 to Pin
                          </span>
                        )}
                      </label>
                    </div>
                  )}

                  <div>
                    <input
                      type="text"
                      value={hostDesc}
                      onChange={(e) => setHostDesc(e.target.value)}
                      placeholder="Short description/promo tag"
                      className="w-full border border-zinc-800 bg-black px-3 py-1.5 font-mono text-xs text-white placeholder-zinc-500 focus:border-[#e5ff00] focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isUploadingHost}
                    className="w-full bg-[#e5ff00] text-black py-1.5 font-mono text-xs font-black uppercase tracking-widest hover:bg-[#cbf000] disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
                  >
                    {isUploadingHost ? (
                      <>
                        <Loader2 className="h-3 animate-spin" />
                        PINNING...
                      </>
                    ) : (
                      <>
                        <Pin className="h-3 w-3" />
                        PIN TO SIDEBAR
                      </>
                    )}
                  </button>
                </form>
              </div>
            ) : (
              <div className="border border-zinc-900 bg-zinc-950/40 p-4 text-center">
                <Lock className="h-5 w-5 text-zinc-700 mx-auto mb-2" />
                <h4 className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest font-black">
                  Host Sidebar Secured
                </h4>
                <p className="text-[10px] text-zinc-600 font-mono mt-1 leading-relaxed">
                  Only the Lounge Host/Admin accounts are authorized to write or modify pinned tracks.
                </p>
              </div>
            )}

          </div>

        </div>
      </div>

      {/* FLOATING AUDIO PLAYER (PERSISTENT AT BOTTOM OF PAGE ONCE ACTIVE) */}
      {activeTrack && (
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-[#e5ff00]/40 bg-black/95 backdrop-blur-md p-3 px-4 sm:px-6">
          <audio
            ref={audioElRef}
            src={fileUrl(activeTrack.url)}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onCanPlay={handleCanPlay}
            onEnded={() => setIsPlaying(false)}
          />
          
          <div className="mx-auto max-w-7xl flex flex-col md:flex-row items-center justify-between gap-3">
            {/* Track Metadata info */}
            <div className="flex items-center gap-3 w-full md:w-auto">
              <div className="h-10 w-10 bg-[#e5ff00]/10 border border-[#e5ff00]/30 flex items-center justify-center rounded-sm">
                <Music className="h-5 w-5 text-[#e5ff00]" />
              </div>
              <div className="min-w-0">
                <h4 className="font-display font-black text-xs text-white uppercase tracking-tight truncate max-w-[200px] sm:max-w-[300px]">
                  {activeTrack.title}
                </h4>
                <p className="font-mono text-[9px] text-zinc-400 mt-0.5">
                  VIBING IN LOUNGE • <span className="text-zinc-500">Shared by: {activeTrack.sender_name}</span>
                </p>
              </div>
            </div>

            {/* Track Play Controls */}
            <div className="flex items-center gap-3 w-full md:w-2/5 justify-center">
              <button
                type="button"
                onClick={togglePlayPause}
                className="h-9 w-9 rounded-full bg-[#e5ff00] text-black flex items-center justify-center hover:bg-[#cbf000] hover:scale-105 transition-all"
                title={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="h-4 w-4 fill-black" /> : <Play className="h-4 w-4 fill-black ml-0.5" />}
              </button>

              <div className="flex-1 flex items-center gap-2">
                <span className="font-mono text-[9px] text-zinc-500">{formatTime(trackProgress)}</span>
                <input
                  type="range"
                  min="0"
                  max={trackDuration || 0}
                  value={trackProgress}
                  onChange={handleAudioSeek}
                  className="flex-1 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#e5ff00]"
                />
                <span className="font-mono text-[9px] text-zinc-500">{formatTime(trackDuration)}</span>
              </div>
            </div>

            {/* Volume controls & Close */}
            <div className="flex items-center gap-4 w-full md:w-auto justify-end">
              <div className="flex items-center gap-2">
                <Volume2 className="h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => {
                    const vol = parseFloat(e.target.value);
                    setVolume(vol);
                    if (audioElRef.current) {
                      audioElRef.current.volume = vol;
                    }
                  }}
                  className="w-16 sm:w-20 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-[#e5ff00]"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setActiveTrack(null);
                  setIsPlaying(false);
                }}
                className="text-zinc-500 hover:text-white border border-zinc-800 hover:border-zinc-700 p-1 bg-black"
                title="Close Player"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
