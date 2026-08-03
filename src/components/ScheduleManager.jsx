import { useState, useEffect } from "react";
import { Calendar, Plus, Trash2, Clock, Music, Save, Check } from "lucide-react";
import { api, apiErrorMessage } from "@/lib/api";
import { db } from "@/lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { toast } from "sonner";

const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN", "EVERYDAY", "WEEKENDS"];

const CATEGORIES = [
  "music",
  "drum and bass",
  "dnb",
  "house",
  "tech",
  "dubstep",
  "reggae",
  "acid",
  "jungle",
  "old skool",
];

export default function ScheduleManager({ channel, onChange }) {
  const [schedule, setSchedule] = useState(channel?.schedule || []);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // New item form state
  const [day, setDay] = useState("FRI");
  const [time, setTime] = useState("20:00 - 22:00 UTC");
  const [title, setTitle] = useState("");
  const [genre, setGenre] = useState(channel?.category || "dnb");

  useEffect(() => {
    if (channel?.schedule) {
      setSchedule(channel.schedule);
    }
  }, [channel?.schedule]);

  const handleAddItem = (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a set title or description.");
      return;
    }
    const newItem = {
      id: "sched_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
      day,
      time: time.trim() || "20:00 UTC",
      title: title.trim(),
      genre,
    };
    const updated = [...schedule, newItem];
    setSchedule(updated);
    setTitle("");
    toast.success("Added to schedule buffer. Click 'SAVE SCHEDULE' to publish.");
  };

  const handleRemoveItem = (id) => {
    const updated = schedule.filter((item) => item.id !== id);
    setSchedule(updated);
    toast.info("Slot removed. Click 'SAVE SCHEDULE' to persist.");
  };

  const handleSave = async () => {
    setSaving(true);
    setSavedSuccess(false);
    try {
      // 1. Update backend memory & Livepeer state
      let responseData;
      try {
        const { data } = await api.patch("/channels/mine", { schedule });
        responseData = data;
      } catch (errPrimary) {
        console.warn("Primary PATCH /channels/mine failed, trying dedicated schedule route:", errPrimary);
        const { data } = await api.post("/channels/mine/schedule", { schedule });
        responseData = data;
      }

      // 2. Persist directly to Firestore for real-time subscribers
      const schedulePayload = {
        schedule,
        schedule_json: JSON.stringify(schedule),
        last_updated: new Date().toISOString(),
      };

      if (channel?.username) {
        try {
          await setDoc(doc(db, "channels", channel.username.toLowerCase()), schedulePayload, { merge: true });
          await setDoc(doc(db, "channels", channel.username), schedulePayload, { merge: true });
        } catch (fsErr) {
          console.warn("Firestore schedule sync notice:", fsErr);
        }
      }

      if (channel?.channel_id) {
        try {
          await setDoc(doc(db, "channels", channel.channel_id), schedulePayload, { merge: true });
        } catch (fsErr) {
          console.warn("Firestore schedule channel_id sync notice:", fsErr);
        }
      }

      if (onChange && responseData) onChange(responseData);
      setSavedSuccess(true);
      toast.success("Broadcast schedule updated & published!");
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to save schedule:", err);
      toast.error(apiErrorMessage(err) || "Could not save schedule. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border border-[#27272a] bg-[#0a0a0a] p-6" data-testid="streamer-schedule-manager">
      <div className="flex items-center justify-between border-b border-[#27272a] pb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-[#e5ff00]" />
          <div className="label-caps mb-0">// STREAMER SCHEDULE MANAGER</div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          {schedule.length} {schedule.length === 1 ? "SET" : "SETS"} PROGRAMMED
        </span>
      </div>

      <p className="mt-3 font-mono text-[11px] leading-relaxed text-zinc-400">
        Set up your upcoming broadcast times slots. Scheduled sets will appear prominently on your
        public channel page so followers can tune in.
      </p>

      {/* Existing Schedule Items */}
      <div className="mt-5 space-y-2.5">
        {schedule.length === 0 ? (
          <div className="border border-dashed border-[#27272a] p-6 text-center">
            <Clock className="mx-auto h-5 w-5 text-zinc-600" />
            <p className="mt-2 font-mono text-xs uppercase tracking-widest text-zinc-500">
              No sets scheduled yet. Add your upcoming broadcast slots below.
            </p>
          </div>
        ) : (
          schedule.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 border border-[#27272a] bg-black p-3 transition-colors hover:border-zinc-700"
              data-testid={`schedule-item-${item.id}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="border border-[#e5ff00] bg-[#e5ff00]/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#e5ff00]">
                  {item.day}
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400">
                  <Clock className="h-3 w-3 text-zinc-500" />
                  {item.time}
                </span>
                <span className="truncate font-display text-sm font-bold text-white">
                  {item.title}
                </span>
                {item.genre && (
                  <span className="chip text-[9px] uppercase tracking-wider">
                    {item.genre}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleRemoveItem(item.id)}
                className="btn-ghost p-1.5 text-zinc-500 hover:text-red-400"
                aria-label="Remove set slot"
                data-testid={`remove-schedule-${item.id}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {/* Add New Slot Form */}
      <form onSubmit={handleAddItem} className="mt-6 border-t border-[#27272a] pt-5">
        <div className="label-caps mb-3">// ADD UPCOMING BROADCAST SLOT</div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="label-caps text-[10px]">DAY</label>
            <select
              value={day}
              onChange={(e) => setDay(e.target.value)}
              className="input-terminal text-xs"
              data-testid="schedule-day-select"
            >
              {DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-caps text-[10px]">TIME / TIMEZONE</label>
            <input
              type="text"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              placeholder="e.g. 20:00 - 22:00 UTC"
              className="input-terminal text-xs"
              data-testid="schedule-time-input"
            />
          </div>

          <div>
            <label className="label-caps text-[10px]">GENRE / TAG</label>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="input-terminal text-xs"
              data-testid="schedule-genre-select"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label-caps text-[10px]">SET / SHOW TITLE</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Deep DnB Rollers"
              className="input-terminal text-xs"
              data-testid="schedule-title-input"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="submit"
            className="btn-ghost inline-flex items-center gap-1.5 border border-[#27272a] px-3 py-2 text-xs text-white hover:border-[#e5ff00]"
            data-testid="add-schedule-btn"
          >
            <Plus className="h-3.5 w-3.5 text-[#e5ff00]" />
            ADD SLOT
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary inline-flex items-center justify-center gap-2"
            data-testid="save-schedule-btn"
          >
            {saving ? (
              "SAVING..."
            ) : savedSuccess ? (
              <>
                <Check className="h-3.5 w-3.5" /> PUBLISHED!
              </>
            ) : (
              <>
                <Save className="h-3.5 w-3.5" /> SAVE SCHEDULE
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
