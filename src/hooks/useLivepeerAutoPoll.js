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

        // Preferred: Call backend check-status route which uses backend LIVEPEER_API_KEY
        try {
          const { data } = await api.post("/livepeer/check-status", {
            channel_id: channelIdentifier,
            stream_id: channelIdentifier,
            username: channelIdentifier,
          });
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
          // Fallback if backend route fails
        }

        const clientApiKey =
          typeof import.meta !== "undefined" && import.meta.env
            ? import.meta.env.VITE_LIVEPEER_API_KEY
            : null;

        if (!clientApiKey) return;

        const response = await fetch(`https://livepeer.studio/api/stream/${channelIdentifier}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${clientApiKey}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) return;
        const streamData = await response.json();
        const isLive = Boolean(streamData?.isActive);
        const nowIso = new Date().toISOString();

        if (!cancelled) {
          const primaryDocId = "nsU1v44XFnN3FloJvNePqj6CBG2";
          await setDoc(
            doc(db, "channels", primaryDocId),
            {
              is_live: isLive,
              isLive: isLive,
              last_updated: nowIso,
            },
            { merge: true }
          ).catch(() => {});

          if (channelIdentifier && channelIdentifier !== primaryDocId) {
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
