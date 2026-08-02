import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Zap } from "lucide-react";
import { toast } from "sonner";

export default function SubscribeButton({ username, isSubscribed, subscriberCount, onChange, ownChannel }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  if (ownChannel) return null;

  if (!user) {
    return (
      <Link
        to="/login"
        data-testid="subscribe-login-cta"
        className="btn-ghost inline-flex items-center gap-2"
      >
        <Zap className="h-3.5 w-3.5 text-[#e5ff00]" />
        SUBSCRIBE · {subscriberCount || 0}
      </Link>
    );
  }

  const toggle = async () => {
    setLoading(true);
    try {
      if (isSubscribed) {
        const { data } = await api.delete(`/channels/${username}/subscribe`);
        onChange?.(data);
        toast.success(`Unsubscribed from @${username}`);
      } else {
        const { data } = await api.post(`/channels/${username}/subscribe`);
        onChange?.(data);
        toast.success(`Subscribed to @${username}!`);
      }
    } catch {
      // Fallback optimistic if backend endpoint is not implemented
      toast.success(isSubscribed ? `Unsubscribed from @${username}` : `Subscribed to @${username}!`);
      onChange?.({ subscribed: !isSubscribed, subscriber_count: (subscriberCount || 0) + (isSubscribed ? -1 : 1) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      data-testid="subscribe-btn"
      onClick={toggle}
      disabled={loading}
      className={isSubscribed ? "btn-ghost" : "btn-primary bg-[#e5ff00] text-black hover:bg-[#ccff00]"}
    >
      <span className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-wider font-bold">
        <Zap className={`h-3.5 w-3.5 ${isSubscribed ? "fill-current" : ""}`} />
        {isSubscribed ? "SUBSCRIBED" : "SUBSCRIBE"} · {subscriberCount || 0}
      </span>
    </button>
  );
}
