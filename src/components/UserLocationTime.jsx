import { useState, useEffect } from "react";
import { Clock, MapPin } from "lucide-react";

export default function UserLocationTime() {
  const [timeStr, setTimeStr] = useState("");
  const [location, setLocation] = useState(null);

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    const updateTime = () => {
      const now = new Date();
      try {
        const formatted = new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
          timeZone: tz,
        }).format(now);
        setTimeStr(formatted);
      } catch {
        setTimeStr(now.toLocaleTimeString());
      }
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);

    // Use local browser timezone gracefully without triggering CORS block errors
    const parts = tz.split("/");
    const city = parts[1] ? parts[1].replace(/_/g, " ").toUpperCase() : "";
    const region = parts[0] ? parts[0].toUpperCase() : "GLOBAL";
    
    setLocation({
      country: region,
      city: city,
      timezone: tz,
      flag: "🌐",
    });

    return () => {
      clearInterval(timer);
    };
  }, []);

  return (
    <div
      data-testid="user-location-time"
      className="inline-flex items-center gap-2 border border-[#27272a] bg-[#0a0a0a] px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-zinc-300 transition-all hover:border-[#e5ff00]/50"
      title={location ? `Watching from ${location.city ? location.city + ", " : ""}${location.country}` : "Detecting viewer location..."}
    >
      <MapPin className="h-3.5 w-3.5 text-[#e5ff00]" />
      <span className="flex items-center gap-1.5 font-bold text-zinc-200">
        {location?.flag && <span>{location.flag}</span>}
        <span>
          {location?.city ? `${location.city}, ` : ""}
          {location?.country || "GLOBAL"}
        </span>
      </span>
      <span className="text-zinc-600">|</span>
      <Clock className="h-3.5 w-3.5 text-[#e5ff00]" />
      <span className="font-bold text-[#e5ff00] tabular-nums">
        {timeStr || "00:00:00 AM"}
      </span>
    </div>
  );
}