import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, Sparkles, Volume2, VolumeX, Radio, Flame, ShieldAlert, Award } from "lucide-react";
import { BACKEND, getAbsoluteOrigin } from "@/lib/api";

function wsUrl(username) {
  const httpUrl = BACKEND || getAbsoluteOrigin() || window.location.origin;
  const wsBase = httpUrl.replace(/^http/i, "ws");
  return `${wsBase}/api/ws/chat/${encodeURIComponent(username)}?token=guest&guest_name=OBS_Overlay`;
}

export default function ObsOverlay() {
  const { username } = useParams();
  const [searchParams] = useSearchParams();
  const [alerts, setAlerts] = useState([]);
  const [currentAlert, setCurrentAlert] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const wsRef = useRef(null);
  const audioContextRef = useRef(null);

  // Play retro synth sound effects on alert
  const playAlertSound = (type) => {
    if (!soundEnabled) return;
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      // Classic retro stream alert sound (musical synthesizer chime)
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      gainNode.connect(ctx.destination);

      if (type === "follow") {
        // Upward cyber-chime
        osc1.type = "sine";
        osc2.type = "triangle";
        osc1.frequency.setValueAtTime(523.25, now); // C5
        osc1.frequency.exponentialRampToValueAtTime(880, now + 0.15); // A5
        osc1.frequency.exponentialRampToValueAtTime(1046.5, now + 0.3); // C6

        osc2.frequency.setValueAtTime(261.63, now); // C4
        osc2.frequency.exponentialRampToValueAtTime(440, now + 0.15); // A4
        osc2.frequency.exponentialRampToValueAtTime(523.25, now + 0.3); // C5

        gainNode.gain.setValueAtTime(0.15, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.4);
        osc2.stop(now + 0.4);
      } else if (type === "hug") {
        // Soft magical swell
        osc1.type = "triangle";
        osc1.frequency.setValueAtTime(329.63, now); // E4
        osc1.frequency.exponentialRampToValueAtTime(392, now + 0.2); // G4
        osc1.frequency.exponentialRampToValueAtTime(523.25, now + 0.4); // C5

        gainNode.gain.setValueAtTime(0.01, now);
        gainNode.gain.linearRampToValueAtTime(0.12, now + 0.15);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.6);

        osc1.start(now);
        osc1.stop(now + 0.6);
      } else {
        // Shoutout / General sci-fi alert
        osc1.type = "sawtooth";
        osc1.frequency.setValueAtTime(440, now); // A4
        osc1.frequency.linearRampToValueAtTime(220, now + 0.15);
        osc1.frequency.exponentialRampToValueAtTime(659.25, now + 0.35); // E5

        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);

        osc1.start(now);
        osc1.stop(now + 0.5);
      }
    } catch (e) {
      console.warn("Audio Context alert sound blocked by browser autoplay rules.", e);
    }
  };

  // Connect to channel's chat websocket
  useEffect(() => {
    if (!username) return;

    let active = true;
    const connect = () => {
      const url = wsUrl(username);
      console.log(`[OBS OVERLAY] Connecting to WebSocket for channel: ${username}`);
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onmessage = (ev) => {
        if (!active) return;
        try {
          const data = JSON.parse(ev.data);
          if (data.type === "message" && data.is_system_command) {
            console.log("[OBS OVERLAY] Alert Received:", data);
            
            // Push alert to queue
            setAlerts((prev) => [
              ...prev,
              {
                id: data.id || Math.random().toString(),
                type: data.command_action || "alert",
                target: data.command_target || "all",
                text: data.text,
                sender: data.sender_display_name || "System",
                sender_username: data.sender_username,
              },
            ]);
          }
        } catch (e) {
          console.error("[OBS OVERLAY] Error parsing frame:", e);
        }
      };

      ws.onclose = () => {
        if (!active) return;
        console.log("[OBS OVERLAY] WebSocket closed. Retrying in 4s...");
        setTimeout(connect, 4000);
      };

      ws.onerror = () => {
        if (!active) return;
        ws.close();
      };
    };

    connect();

    return () => {
      active = false;
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [username]);

  // Process the alert queue
  useEffect(() => {
    if (currentAlert || alerts.length === 0) return;

    const next = alerts[0];
    setAlerts((prev) => prev.slice(1));
    setCurrentAlert(next);
    playAlertSound(next.type);

    // Keep alert on screen for 6.5 seconds
    const timer = setTimeout(() => {
      setCurrentAlert(null);
    }, 6500);

    return () => clearTimeout(timer);
  }, [alerts, currentAlert]);

  // Enable audio context on first overlay click
  const enableAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioContextRef.current.state === "suspended") {
      audioContextRef.current.resume();
    }
    setSoundEnabled((prev) => !prev);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-transparent pointer-events-none select-none">
      {/* Sound Toggle (Only visible if the streamer clicks the overlay directly to test/initialize audio) */}
      <div className="absolute top-4 right-4 pointer-events-auto z-50">
        <button
          onClick={enableAudio}
          className="flex items-center gap-1.5 px-3 py-1.5 font-mono text-[9px] uppercase tracking-wider text-zinc-500 hover:text-white bg-black/80 border border-zinc-800 transition-colors rounded-sm"
          title="Toggle Alert Sounds (OBS Browser Source may block autoplay unless clicked or configured)"
        >
          {soundEnabled ? (
            <>
              <Volume2 className="h-3 w-3 text-[#e5ff00]" /> SOUND ON
            </>
          ) : (
            <>
              <VolumeX className="h-3 w-3" /> MUTED
            </>
          )}
        </button>
      </div>

      {/* Main Alert Container */}
      <div className="absolute inset-0 flex items-center justify-center p-8">
        <AnimatePresence mode="wait">
          {currentAlert && (
            <motion.div
              key={currentAlert.id}
              initial={{ opacity: 0, scale: 0.8, y: -50 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 30, transition: { duration: 0.3 } }}
              transition={{ type: "spring", damping: 15, stiffness: 100 }}
              className="relative w-full max-w-xl pointer-events-auto"
            >
              {/* Outer Neon Cyber Border */}
              <div className="relative overflow-hidden p-6 border-2 border-[#e5ff00] bg-black/95 shadow-[0_0_30px_rgba(229,255,0,0.3)] rounded-sm">
                
                {/* Holographic Scanlines & Corner Deco */}
                <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(229,255,0,0.05)_0%,transparent_70%)] pointer-events-none" />
                <div className="absolute top-0 left-0 w-4 h-4 border-t-4 border-l-4 border-[#e5ff00]" />
                <div className="absolute top-0 right-0 w-4 h-4 border-t-4 border-r-4 border-[#e5ff00]" />
                <div className="absolute bottom-0 left-0 w-4 h-4 border-b-4 border-l-4 border-[#e5ff00]" />
                <div className="absolute bottom-0 right-0 w-4 h-4 border-b-4 border-r-4 border-[#e5ff00]" />

                {/* Animated Scanline Effect */}
                <div className="absolute top-0 left-0 w-full h-[2px] bg-[#e5ff00]/40 opacity-40 animate-bounce pointer-events-none" style={{ animationDuration: '4s' }} />

                <div className="flex items-center gap-5">
                  {/* Glowing Animated Icon */}
                  <div className="relative flex-shrink-0 flex items-center justify-center h-16 w-16 border-2 border-[#e5ff00] bg-[#e5ff00]/10 rounded-sm overflow-hidden">
                    <motion.div
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                    >
                      {currentAlert.type === "follow" && (
                        <Heart className="h-8 w-8 text-[#e5ff00] fill-[#e5ff00]" />
                      )}
                      {currentAlert.type === "hug" && (
                        <Flame className="h-8 w-8 text-[#e5ff00] fill-[#e5ff00]" />
                      )}
                      {currentAlert.type === "so" && (
                        <Radio className="h-8 w-8 text-[#e5ff00]" />
                      )}
                      {currentAlert.type === "rules" && (
                        <ShieldAlert className="h-8 w-8 text-[#e5ff00]" />
                      )}
                      {currentAlert.type === "watts" && (
                        <Award className="h-8 w-8 text-[#e5ff00]" />
                      )}
                      {!["follow", "hug", "so", "rules", "watts"].includes(currentAlert.type) && (
                        <Sparkles className="h-8 w-8 text-[#e5ff00]" />
                      )}
                    </motion.div>
                  </div>

                  {/* Alert Text Details */}
                  <div className="min-w-0 flex-1 font-mono">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] uppercase font-bold text-zinc-400 tracking-widest">
                        SPARKZ.TV ALERT SYSTEM
                      </span>
                      <span className="text-[10px] text-zinc-600 font-black">// ONLINE</span>
                    </div>

                    <h2 className="text-xl font-black text-white uppercase tracking-wider mb-2">
                      {currentAlert.type === "follow" && "NEW SIGNAL GAINED"}
                      {currentAlert.type === "hug" && "HOLOGRAPHIC HUG"}
                      {currentAlert.type === "so" && "COMMUNITY SHOUT OUT"}
                      {currentAlert.type === "rules" && "SYSTEM BROADCAST"}
                      {currentAlert.type === "watts" && "WATTS CHECK"}
                      {!["follow", "hug", "so", "rules", "watts"].includes(currentAlert.type) && "ALERT DETECTED"}
                    </h2>

                    <div className="text-sm font-medium leading-relaxed text-zinc-100">
                      {currentAlert.text}
                    </div>
                  </div>
                </div>

                {/* Progress bar timer */}
                <div className="absolute bottom-0 left-0 h-1 bg-[#e5ff00] animate-[shrink_6.5s_linear_forwards]" style={{ width: '100%' }} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        @keyframes shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </div>
  );
}
