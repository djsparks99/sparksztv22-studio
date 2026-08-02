import { useEffect } from "react";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export function useLivepeerAutoPoll(channelIdentifier) {
  useEffect(() => {
    let cancelled = false;

    const pollStatus = async () => {
      try {
        // If we don't have a stream identifier to check, skip
        if (!channelIdentifier) return;

        // Directly query Livepeer Studio API using the correct path parameter
        const response = await fetch(`https://livepeer.studio/api/stream/${channelIdentifier}`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_LIVEPEER_API_KEY}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) return;
        const streamData = await response.json();
        
        // Livepeer returns a single stream object containing an isActive boolean field
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