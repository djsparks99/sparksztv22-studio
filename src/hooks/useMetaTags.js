import { useEffect } from "react";

export function setMetaTags({
  title = "Sparkz.TV — Underground Live Streaming",
  description = "Discover the finest underground music streams. Join the Signal.",
  image = "/og-image.png",
  url = typeof window !== "undefined" ? window.location.href : "https://sparkz.tv",
  type = "website",
} = {}) {
  if (typeof document === "undefined") return;

  // Title
  document.title = title;

  // Absolute image URL resolution for social crawlers
  let fullImageUrl = image;
  if (image && typeof window !== "undefined" && !image.startsWith("http") && !image.startsWith("data:")) {
    const origin = window.location.origin;
    fullImageUrl = `${origin}${image.startsWith("/") ? "" : "/"}${image}`;
  }

  const metaMap = {
    "og:title": title,
    "og:description": description,
    "og:image": fullImageUrl,
    "og:url": url,
    "og:type": type,
    "twitter:card": "summary_large_image",
    "twitter:title": title,
    "twitter:description": description,
    "twitter:image": fullImageUrl,
  };

  Object.entries(metaMap).forEach(([key, content]) => {
    if (!content) return;

    // Search for existing tag by property or name
    let tag = document.querySelector(`meta[property="${key}"]`) || document.querySelector(`meta[name="${key}"]`);

    if (!tag) {
      tag = document.createElement("meta");
      if (key.startsWith("og:")) {
        tag.setAttribute("property", key);
      } else {
        tag.setAttribute("name", key);
      }
      document.head.appendChild(tag);
    }

    tag.setAttribute("content", content);
  });
}

export function useMetaTags(options = {}) {
  const { title, description, image, url, type } = options;

  useEffect(() => {
    setMetaTags({ title, description, image, url, type });

    return () => {
      // Reset back to front page defaults on unmount
      setMetaTags();
    };
  }, [title, description, image, url, type]);
}
