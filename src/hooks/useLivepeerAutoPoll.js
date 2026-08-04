import { useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { api } from "@/lib/api";

export function useLivepeerAutoPoll(channelIdentifier) {
  useEffect(() => {
    let cancelled = false;

    const pollStatus = async () => {
      try {
        if (!channelIdentifier) return;

        // Preferred: Call backend check-status routes which perform Amazon IVS AWS SDK checks
        try {
          let response = await api.post("/ivs/check-status", {
            channel_id: channelIdentifier,
            stream_id: channelIdentifier,
            username: channelIdentifier,
          }).catch(() => null);

          // Fallback to legacy route path if the new clean IVS path is not available or errors
          if (!response || !response.data) {
            response = await api.post("/livepeer/check-status", {
              channel_id: channelIdentifier,
              stream_id: channelIdentifier,
              username: channelIdentifier,
            });
          }

          const data = response?.data;
          if (data && typeof data.is_live === "boolean") {
            const isLive = data.is_live;
            const nowIso = new Date().toISOString();
            if (!cancelled) {
              const primaryDocId = "nsU1v44XFnN3FloJvNePqj6cBG2";
              await setDoc(
                doc(db, "channels", primaryDocId),
                {
                  is_live: isLive,
                  isLive: isLive,
                  last_updated: nowIso,
                },
                { merge: true }
              ).catch(() => {});

              if (channelIdentifier && channelIdentifier !== primaryDocId && channelIdentifier !== "djsparkz") {
                await setDoc(
                  doc(db, "channels", channelIdentifier),
                  {
                    is_live: isLive,
                    isLive: isLive,
                    last_updated: nowIso,
                  },
                  { merge: true }
                ).catch(() => {});
              }
            }
            return;
          }
        } catch {
          // Silent catch to avoid throwing on background check failures
        }
      } catch (e) {
        // Silent error handling for background polling
      }
    };

    pollStatus();
    const interval = setInterval(pollStatus, 10000); // Polling every 10 seconds

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [channelIdentifier]);
}
