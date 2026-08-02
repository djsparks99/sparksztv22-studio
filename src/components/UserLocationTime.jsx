import { useState, useEffect } from "react";
import { Clock, MapPin } from "lucide-react";

export default function UserLocationTime() {
  const [timeStr, setTimeStr] = useState("");
  const [location, setLocation] = useState(null);

  useEffect(() => {
    // Determine browser fallback timezone
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";

    // Live clock ticker
    const updateTime = () => {
      const now = new Date();
      try {
        const targetTz = location?.timezone || tz;
        const formatted = new Intl.DateTimeFormat("en-US", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: true,
          timeZone: targetTz,
        }).format(now);
        setTimeStr(formatted);
      } catch {
        setTimeStr(now.toLocaleTimeString());
      }
    };

    updateTime();
    const timer = setInterval(updateTime, 1000);

    // Fetch user location based on IP address
    let isCancelled = false;
    const detectLocation = async () => {
      try {
        const res = await fetch("https://freeipapi.com/api/json");
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled && data && data.countryName) {
            setLocation({
              country: data.countryName.toUpperCase(),
              countryCode: data.countryCode,
              city: data.cityName ? data.cityName.toUpperCase() : "",
              timezone: data.timeZone || tz,
              flag: getFlagEmoji(data.countryCode),
            });
            return;
          }
        }
      } catch {
        // Fallback gracefully on fetch error
      }

      // Secondary IP API fallback
      try {
        const res2 = await fetch("https://ipapi.co/json/");
        if (res2.ok) {
          const data2 = await res2.json();
          if (!isCancelled && data2 && data2.country_name) {
            setLocation({
              country: data2.country_name.toUpperCase(),
              countryCode: data2.country_code,
              city: data2.city ? data2.city.toUpperCase() : "",
              timezone: data2.timezone || tz,
              flag: getFlagEmoji(data2.country_code),
            });
            return;
          }
        }
      } catch {
        // Fallback
      }

      // Browser timezone fallback if IP API is blocked/unavailable
      if (!isCancelled) {
        const parts = tz.split("/");
        const city = parts[1] ? parts[1].replace(/_/g, " ").toUpperCase() : "";
        const region = parts[0] ? parts[0].toUpperCase() : "GLOBAL";
        setLocation({
          country: region,
          city: city,
          timezone: tz,
          flag: "🌐",
        });
      }
    };

    detectLocation();

    return () => {
      isCancelled = true;
      clearInterval(timer);
    };
  }, [location?.timezone]);

  // Convert 2-letter ISO country code to flag emoji
  function getFlagEmoji(countryCode) {
    if (!countryCode || countryCode.length !== 2) return "🌐";
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  }

  return (
    <div
      data-testid="user-location-time"
      className="inline-flex items-center gap-2 border border-[#27272a] bg-[#0a0a0a] px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-zinc-300 transition-all hover:border-[#e5ff00]/50"
      title={
        location
          ? `Watching from ${location.city ? location.city + ", " : ""}${location.country}`
          : "Detecting viewer location..."
      }
    >
      <MapPin className="h-3.5 w-3.5 text-[#e5ff00]" />
      <span className="flex items-center gap-1.5 font-bold text-zinc-200">
        {location?.flag && <span>{location.flag}</span>}
        <span>
          {location?.city ? `${location.city}, ` : ""}
          {location?.country || "DETECTING..."}
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
