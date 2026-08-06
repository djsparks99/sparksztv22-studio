import { useState, useRef, useEffect } from "react";
import { Share2, Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export default function ShareButton({ username, streamTitle }) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const menuRef = useRef(null);

  const url = typeof window !== "undefined" ? window.location.href : "";
  const title = streamTitle || `Watch @${username} on Sparkz.TV`;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        toast.success("Stream link copied to clipboard!");
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      toast.error("Could not copy link.");
    }
    setIsOpen(false);
  };

  const shareToSocial = (platform) => {
    const encodedUrl = encodeURIComponent(url);
    const encodedTitle = encodeURIComponent(title);

    let shareUrl = "";
    switch (platform) {
      case "facebook":
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`;
        break;
      case "twitter":
        shareUrl = `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`;
        break;
      case "vk":
        shareUrl = `https://vk.com/share.php?url=${encodedUrl}&title=${encodedTitle}`;
        break;
      case "reddit":
        shareUrl = `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedTitle}`;
        break;
      default:
        return;
    }

    window.open(shareUrl, "_blank", "width=600,height=400");
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      <button
        data-testid="share-btn"
        onClick={() => setIsOpen(!isOpen)}
        className="btn-ghost inline-flex items-center gap-2"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-green-400" /> : <Share2 className="h-3.5 w-3.5" />}
        <span className="font-mono text-xs uppercase tracking-wider">
          {copied ? "COPIED" : "SHARE"}
        </span>
      </button>

      {isOpen && (
        <div
          data-testid="share-dropdown-menu"
          className="absolute right-0 mt-2 w-48 z-50 border border-[#27272a] bg-[#0c0c0e] py-1 shadow-2xl rounded-sm font-mono text-xs"
        >
          <div className="px-3 py-1.5 text-[9px] uppercase tracking-widest text-zinc-500 border-b border-[#27272a]">
            SHARE CHANNEL
          </div>

          <button
            onClick={handleCopyLink}
            className="w-full text-left px-3 py-2 flex items-center gap-2 text-zinc-300 hover:bg-[#1a1a1e] hover:text-[#e5ff00] transition-colors"
          >
            <Copy className="h-3.5 w-3.5 text-[#e5ff00]" />
            <span>{copied ? "COPIED LINK" : "COPY URL"}</span>
          </button>

          <button
            onClick={() => shareToSocial("twitter")}
            className="w-full text-left px-3 py-2 flex items-center gap-2 text-zinc-300 hover:bg-[#1a1a1e] hover:text-[#e5ff00] transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-cyan-400" />
            <span>X (TWITTER)</span>
          </button>

          <button
            onClick={() => shareToSocial("facebook")}
            className="w-full text-left px-3 py-2 flex items-center gap-2 text-zinc-300 hover:bg-[#1a1a1e] hover:text-[#e5ff00] transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-blue-400" />
            <span>FACEBOOK</span>
          </button>

          <button
            onClick={() => shareToSocial("vk")}
            className="w-full text-left px-3 py-2 flex items-center gap-2 text-zinc-300 hover:bg-[#1a1a1e] hover:text-[#e5ff00] transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-indigo-400" />
            <span>VK</span>
          </button>

          <button
            onClick={() => shareToSocial("reddit")}
            className="w-full text-left px-3 py-2 flex items-center gap-2 text-zinc-300 hover:bg-[#1a1a1e] hover:text-[#e5ff00] transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5 text-orange-400" />
            <span>REDDIT</span>
          </button>
        </div>
      )}
    </div>
  );
}