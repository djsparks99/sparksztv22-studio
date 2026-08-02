import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Heart } from "lucide-react";
import { toast } from "sonner";

export default function FollowButton({ username, isFollowing, followerCount, onChange, ownChannel }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);

  if (ownChannel) return null;

  if (!user) {
    return (
      <Link
        to="/login"
        data-testid="follow-login-cta"
        className="btn-ghost inline-flex items-center gap-2"
      >
        <Heart className="h-3.5 w-3.5" />
        FOLLOW · {followerCount || 0}
      </Link>
    );
  }

  const toggle = async () => {
    setLoading(true);
    try {
      if (isFollowing) {
        const { data } = await api.delete(`/channels/${username}/follow`);
        onChange?.(data);
        window.dispatchEvent(new CustomEvent("follow-changed", { detail: { username, isFollowing: false } }));
        toast.success(`Unfollowed @${username}`);
      } else {
        const { data } = await api.post(`/channels/${username}/follow`);
        onChange?.(data);
        window.dispatchEvent(new CustomEvent("follow-changed", { detail: { username, isFollowing: true } }));
        toast.success(`Following @${username} — we'll ping you when they go live.`);
      }
    } catch {
      toast.error("Follow action failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      data-testid="follow-btn"
      onClick={toggle}
      disabled={loading}
      className={isFollowing ? "btn-ghost" : "btn-primary"}
    >
      <span className="inline-flex items-center gap-2">
        <Heart className={`h-3.5 w-3.5 ${isFollowing ? "fill-current" : ""}`} />
        {isFollowing ? "FOLLOWING" : "FOLLOW"} · {followerCount || 0}
      </span>
    </button>
  );
}
