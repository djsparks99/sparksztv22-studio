import { useEffect, useState, useRef } from "react";
import { api, fileUrl, apiErrorMessage, fileToBase64 } from "@/lib/api";
import { Smile, Plus, Trash2, Zap, Upload, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

export default function EmoteManager({ channel }) {
  const [emotes, setEmotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState(null);
  const fileInputRef = useRef(null);

  const loadEmotes = async () => {
    if (!channel?.username) return;
    try {
      setLoading(true);
      const { data } = await api.get(`/channels/${channel.username}/emotes`);
      setEmotes(data.emotes || []);
    } catch {
      toast.error("Could not load emotes.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEmotes();
  }, [channel?.username]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!code.trim()) {
      toast.error("Please specify an emote code (e.g. :subDrop:).");
      return;
    }
    if (!file && !imageUrl.trim()) {
      toast.error("Please upload an image file or provide an image URL.");
      return;
    }

    setUploading(true);
    try {
      let payload = { code, name: name || code };
      if (file) {
        const base64 = await fileToBase64(file);
        payload.file = base64;
        payload.image = base64;
        payload.image_url = base64;
        payload.filename = file.name;
      } else {
        payload.image_url = imageUrl;
      }

      await api.post("/channels/mine/emotes", payload);

      toast.success("Emote uploaded successfully!");
      setCode("");
      setName("");
      setImageUrl("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadEmotes();
    } catch (err) {
      console.error("Emote upload error:", err);
      toast.error(apiErrorMessage(err) || "Failed to upload emote.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (emoteId) => {
    try {
      await api.delete(`/channels/mine/emotes/${emoteId}`);
      toast.success("Emote removed.");
      setEmotes((prev) => prev.filter((e) => e.id !== emoteId));
    } catch {
      toast.error("Could not delete emote.");
    }
  };

  const channelEmotes = emotes.filter(
    (e) => e.channel_username.toLowerCase() === channel?.username?.toLowerCase()
  );
  const globalEmotes = emotes.filter((e) => e.channel_username === "global");

  return (
    <div className="border border-[#27272a] bg-[#0a0a0a] p-6" data-testid="emote-manager">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Smile className="h-4 w-4 text-[#e5ff00]" />
          <div className="label-caps mb-0">// CHANNEL EMOTES STUDIO</div>
        </div>
        <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">
          {channelEmotes.length} CUSTOM / 20 MAX
        </span>
      </div>

      <p className="mt-2 font-mono text-[11px] leading-relaxed text-zinc-400">
        Broadcasters can create custom channel emotes for subscribers & viewers. Emotes can be typed directly into chat using shortcut codes (e.g. <code className="text-[#e5ff00]">:pirateDrop:</code>).
      </p>

      {/* Upload Form */}
      <form onSubmit={handleUpload} className="mt-5 space-y-4 border-t border-[#27272a] pt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label-caps" htmlFor="emote-code">EMOTE CODE</label>
            <input
              id="emote-code"
              data-testid="emote-code-input"
              className="input-terminal font-mono text-xs text-[#e5ff00]"
              placeholder=":subDrop:"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="label-caps" htmlFor="emote-name">DISPLAY NAME</label>
            <input
              id="emote-name"
              data-testid="emote-name-input"
              className="input-terminal font-mono text-xs"
              placeholder="Sub Drop"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="label-caps">IMAGE SOURCE</label>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setFile(f);
                  setImageUrl("");
                }
              }}
              className="hidden"
              data-testid="emote-file-input"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="btn-ghost inline-flex items-center gap-2 text-xs"
              data-testid="select-emote-file-btn"
            >
              <Upload className="h-3.5 w-3.5 text-[#e5ff00]" />
              {file ? file.name : "CHOOSE IMAGE FILE"}
            </button>
            <span className="font-mono text-[10px] text-zinc-500 uppercase">OR</span>
            <input
              className="input-terminal flex-1 text-xs"
              placeholder="https://example.com/emote.png"
              value={imageUrl}
              onChange={(e) => {
                setImageUrl(e.target.value);
                setFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
              data-testid="emote-url-input"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={uploading}
          data-testid="add-emote-btn"
          className="btn-primary w-full inline-flex items-center justify-center gap-2"
        >
          <Plus className="h-3.5 w-3.5" />
          {uploading ? "UPLOADING EMOTE..." : "ADD CHANNEL EMOTE"}
        </button>
      </form>

      {/* Emotes List */}
      <div className="mt-6 border-t border-[#27272a] pt-4 space-y-4">
        <div>
          <div className="label-caps text-zinc-400">// YOUR CHANNEL EMOTES</div>
          {channelEmotes.length === 0 ? (
            <div className="mt-2 border border-dashed border-[#27272a] p-4 text-center font-mono text-xs uppercase text-zinc-500">
              NO CUSTOM CHANNEL EMOTES CREATED YET
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {channelEmotes.map((e) => (
                <div
                  key={e.id}
                  data-testid={`channel-emote-${e.id}`}
                  className="flex items-center justify-between border border-[#27272a] bg-black p-2.5"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={e.image_url.startsWith("http") ? e.image_url : fileUrl(e.image_url)}
                      alt={e.name}
                      className="h-8 w-8 object-contain rounded bg-zinc-900 p-0.5 border border-zinc-800"
                    />
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-bold text-[#e5ff00] truncate">
                        {e.code}
                      </div>
                      <div className="font-mono text-[10px] text-zinc-400 truncate">{e.name}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(e.id)}
                    className="btn-ghost p-1 text-zinc-500 hover:text-red-400"
                    title="Delete Emote"
                    data-testid={`delete-emote-${e.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div className="label-caps text-zinc-500">// GLOBAL PLATFORM EMOTES (EVERYWHERE)</div>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {globalEmotes.map((e) => (
              <div
                key={e.id}
                className="flex flex-col items-center border border-[#1f1f23] bg-[#0d0d0e] p-2 text-center"
              >
                <img
                  src={e.image_url}
                  alt={e.name}
                  className="h-7 w-7 object-contain rounded p-0.5"
                />
                <span className="mt-1 font-mono text-[9px] text-zinc-400 truncate w-full">
                  {e.code}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
