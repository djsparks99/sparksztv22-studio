import { Calendar, Clock, Radio, Music } from "lucide-react";

export default function ScheduleDisplay({ schedule, username }) {
  if (!schedule || !Array.isArray(schedule) || schedule.length === 0) {
    return (
      <div className="border border-[#27272a] bg-[#0a0a0a] p-6" data-testid="channel-schedule-display">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[#e5ff00]" />
          <div className="label-caps mb-0">// BROADCAST SCHEDULE</div>
        </div>
        <div className="mt-4 border border-dashed border-[#27272a] p-5 text-center">
          <p className="font-mono text-xs uppercase tracking-widest text-zinc-500">
            No upcoming sets scheduled at this time. Follow @{username} to get notified when they go live.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-[#27272a] bg-[#0a0a0a] p-6" data-testid="channel-schedule-display">
      <div className="flex items-center justify-between border-b border-[#27272a] pb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[#e5ff00]" />
          <div className="label-caps mb-0">// UPCOMING BROADCAST SCHEDULE</div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          {schedule.length} {schedule.length === 1 ? "SET" : "SETS"} PROGRAMMED
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-1 md:grid-cols-2">
        {schedule.map((item, idx) => (
          <div
            key={item.id || idx}
            className="flex items-start gap-3 border border-[#27272a] bg-black p-4 transition-all hover:border-[#e5ff00]/50"
            data-testid={`public-schedule-item-${item.id || idx}`}
          >
            <div className="flex flex-col items-center justify-center border border-[#e5ff00] bg-[#e5ff00]/10 px-2.5 py-1.5 text-center min-w-[54px]">
              <span className="font-mono text-xs font-black text-[#e5ff00]">{item.day}</span>
              <Radio className="mt-1 h-3 w-3 text-[#e5ff00]" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 font-mono text-[11px] text-zinc-400">
                  <Clock className="h-3 w-3 text-zinc-500" />
                  {item.time}
                </span>
                {item.genre && (
                  <span className="chip text-[9px] uppercase tracking-wider">
                    {item.genre}
                  </span>
                )}
              </div>
              <h3 className="mt-1 truncate font-display text-sm font-bold text-white">
                {item.title}
              </h3>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
