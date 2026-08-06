import { useState, useEffect } from "react";
import { Calendar, Plus, Trash2, Clock, Music, Save, Check, Image as ImageIcon, Edit3, X } from "lucide-react";
import { api, apiErrorMessage, fileUrl } from "@/lib/api";
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
  const [schedule, setSchedule] = useState(channel?.schedules || channel?.schedule || []);
  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // New/Edit item form state
  const [editingId, setEditingId] = useState(null);
  const [day, setDay] = useState("FRI");
  const [time, setTime] = useState("20:00 - 22:00 UTC");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [genre, setGenre] = useState(channel?.category || "dnb");
  const [imageUrl, setImageUrl] = useState("");
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    if (channel?.schedules) {
      setSchedule(channel.schedules);
    } else if (channel?.schedule) {
      setSchedule(channel.schedule);
    }
  }, [channel?.schedules, channel?.schedule]);

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("thumbnail", file);

    setUploadingImage(true);
    try {
      const { data } = await api.post("/channels/mine/thumbnail", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (data?.thumbnail_url) {
        setImageUrl(data.thumbnail_url);
        toast.success("Schedule banner uploaded successfully!");
      }
    } catch (err) {
      toast.error("Failed to upload banner image.");
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSaveItem = (e) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Please enter a set title or description.");
      return;
    }

    if (editingId) {
      // Update existing
      const updated = schedule.map((item) =>
        item.id === editingId
          ? { ...item, day, time: time.trim() || "20:00 UTC", title: title.trim(), description: description.trim(), genre, imageUrl }
          : item
      );
      setSchedule(updated);
      setEditingId(null);
      toast.success("Schedule slot updated. Click 'SAVE SCHEDULE' to publish.");
    } else {
      // Add new
      const newItem = {
        id: "sched_" + Date.now().toString(36) + Math.random().toString(36).substring(2, 5),
        day,
        time: time.trim() || "20:00 UTC",
        title: title.trim(),
        description: description.trim(),
        genre,
        imageUrl,
      };
      const updated = [...schedule, newItem];
      setSchedule(updated);
      toast.success("Added to schedule buffer. Click 'SAVE SCHEDULE' to publish.");
    }

    // Reset form
    setTitle("");
    setDescription("");
    setImageUrl("");
  };

  const handleEditItem = (item) => {
    setEditingId(item.id);
    setDay(item.day || "FRI");
    setTime(item.time || "20:00 UTC");
    setTitle(item.title || "");
    setDescription(item.description || "");
    setGenre(item.genre || "dnb");
    setImageUrl(item.imageUrl || "");
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setImageUrl("");
  };

  const handleRemoveItem = (id) => {
    const updated = schedule.filter((item) => item.id !== id);
    setSchedule(updated);
    if (editingId === id) handleCancelEdit();
    toast.info("Slot removed. Click 'SAVE SCHEDULE' to persist.");
  };

  const handleSave = async () => {
    setSaving(true);
    setSavedSuccess(false);
    try {
      let responseData;
      try {
        const { data } = await api.patch("/channels/mine", { schedules: schedule, schedule });
        responseData = data;
      } catch (errPrimary) {
        const { data } = await api.post("/channels/mine/schedule", { schedules: schedule, schedule });
        responseData = data;
      }

      const schedulePayload = {
        schedule,
        schedules: schedule,
        schedule_json: JSON.stringify(schedule),
        last_updated: new Date().toISOString(),
      };

      if (channel?.username) {
        try {
          await setDoc(doc(db, "channels", channel.username.toLowerCase()), schedulePayload, { merge: true });
          await setDoc(doc(db, "channels", channel.username), schedulePayload, { merge: true });
        } catch (fsErr) {}
      }

      if (channel?.channel_id) {
        try {
          await setDoc(doc(db, "channels", channel.channel_id), schedulePayload, { merge: true });
        } catch (fsErr) {}
      }

      if (onChange && responseData) onChange(responseData);
      setSavedSuccess(true);
      toast.success("Broadcast schedule updated & published!");
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (err) {
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
        Set up your upcoming broadcast time slots, add custom artwork banners, edit, or delete sets anytime.
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
              className={`flex flex-wrap items-center justify-between gap-3 border p-3 transition-colors ${
                editingId === item.id ? "border-[#e5ff00] bg-[#e5ff00]/5" : "border-[#27272a] bg-black hover:border-zinc-700"
              }`}
              data-testid={`schedule-item-${item.id}`}
            >
              <div className="flex items-center gap-3 min-w-0">
                {item.imageUrl && (
                  <img
                    src={item.imageUrl.startsWith("http") ? item.imageUrl : fileUrl(item.imageUrl)}
                    alt=""
                    className="h-10 w-10 object-cover border border-[#27272a] rounded-sm"
                  />
                )}
                <span className="border border-[#e5ff00] bg-[#e5ff00]/10 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wider text-[#e5ff00]">
                  {item.day}
                </span>
                <span className="inline-flex items-center gap-1 font-mono text-xs text-zinc-400">
                  <Clock className="h-3 w-3 text-zinc-500" />
                  {item.time}
                </span>
                <div>
                  <span className="truncate font-display text-sm font-bold text-white block">
                    {item.title}
                  </span>
                  {item.genre && (
                    <span className="chip text-[9px] uppercase tracking-wider mt-0.5 inline-block">
                      {item.genre}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleEditItem(item)}
                  className="btn-ghost p-1.5 text-zinc-400 hover:text-[#e5ff00]"
                  title="Edit schedule slot"
                  data-testid={`edit-schedule-${item.id}`}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveItem(item.id)}
                  className="btn-ghost p-1.5 text-zinc-500 hover:text-red-400"
                  title="Delete schedule slot"
                  data-testid={`remove-schedule-${item.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Slot Form */}
      <form onSubmit={handleSaveItem} className="mt-6 border-t border-[#27272a] pt-5">
        <div className="flex items-center justify-between mb-3">
          <div className="label-caps">
            {editingId ? "// EDIT BROADCAST SLOT" : "// ADD UPCOMING BROADCAST SLOT"}
          </div>
          {editingId && (
            <button
              type="button"
              onClick={handleCancelEdit}
              className="text-[10px] font-mono uppercase text-zinc-400 hover:text-white flex items-center gap-1"
            >
              <X className="h-3 w-3" /> CANCEL EDIT
            </button>
          )}
        </div>

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

        {/* Schedule Banner Picture Upload */}
        <div className="mt-3">
          <label className="label-caps text-[10px]">SCHEDULE BANNER PICTURE (OPTIONAL)</label>
          <div className="flex items-center gap-3 mt-1">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageUpload}
              className="hidden"
              id="schedule-img-upload"
            />
            <label
              htmlFor="schedule-img-upload"
              className="btn-ghost inline-flex items-center gap-2 border border-[#27272a] px-3 py-1.5 text-xs text-zinc-300 hover:border-[#e5ff00] cursor-pointer"
            >
              <ImageIcon className="h-3.5 w-3.5 text-[#e5ff00]" />
              {uploadingImage ? "UPLOADING..." : imageUrl ? "CHANGE IMAGE" : "UPLOAD IMAGE"}
            </label>
            {imageUrl && (
              <span className="font-mono text-[10px] text-emerald-400 truncate max-w-xs">
                Image Attached ✓
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <button
            type="submit"
            className="btn-ghost inline-flex items-center gap-1.5 border border-[#27272a] px-3 py-2 text-xs text-white hover:border-[#e5ff00]"
            data-testid="add-schedule-btn"
          >
            <Plus className="h-3.5 w-3.5 text-[#e5ff00]" />
            {editingId ? "UPDATE SLOT IN BUFFER" : "ADD SLOT TO BUFFER"}
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