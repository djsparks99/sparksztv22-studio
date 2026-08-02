import { useState } from "react";
import { Share2, Check } from "lucide-react";
import { toast } from "sonner";

export default function ShareButton({ username, streamTitle }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({
          title: streamTitle || `Watch @${username} on Sparkz.TV`,
          url: url,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success("Stream link copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      toast.error("Could not share link.");
    }
  };

  return (
    <button
      data-testid="share-btn"
      onClick={handleShare}
      className="btn-ghost inline-flex items-center gap-2"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Share2 className="h-3.5 w-3.5" />}
      <span className="font-mono text-xs uppercase tracking-wider">
        {copied ? "COPIED" : "SHARE"}
      </span>
    </button>
  );
}
