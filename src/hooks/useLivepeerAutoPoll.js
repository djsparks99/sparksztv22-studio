import { useEffect } from "react";
import { api } from "@/lib/api";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";

export function useLivepeerAutoPoll(channelIdentifier) {
  useEffect(() => {
    let cancelled = false;

    const pollStatus = async () => {
      try {
        const payload = {
          doc_id: "nsU1v44XFnN3FloJvNePqj6CBG2",
        };
        if (channelIdentifier) {
          payload.username = channelIdentifier;
          payload.channel_id = channelIdentifier;
        }

        // Call backend server endpoint which uses Firebase Admin SDK & Livepeer API
        const { data } = await api.post("/livepeer/check-status", payload);

        if (!cancelled && data && typeof data.is_live === "boolean") {
          const isLive = Boolean(data.is_live);
          const nowIso = new Date().toISOString();

          // Also perform direct client-side update to Firestore document for dual-path real-time sync
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

    // Execute immediately on page load / view mount
    pollStatus();

    // Poll every 4 seconds in the background
    const interval = setInterval(pollStatus, 4000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [channelIdentifier]);
}
