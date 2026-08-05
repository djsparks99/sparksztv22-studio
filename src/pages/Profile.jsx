import { useEffect, useRef, useState } from "react";
import { api, fileUrl, apiErrorMessage, fileToBase64, compressAndResizeImage } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { updateUserProfileInFirestore } from "@/lib/firebase";
import { toast } from "sonner";
import { Upload, User, Copy, RefreshCw, Radio, Eye, EyeOff } from "lucide-react";

export default function Profile() {
  const { user, setUser, refresh } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [channel, setChannel] = useState(null);
  const [revealKey, setRevealKey] = useState(false);
  const [loadingStream, setLoadingStream] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || "");
      setBio(user.bio || "");
      api.get("/channels/mine", {
        params: {
          uid: user.uid,
          username: user.username
        },
        headers: {
          "x-user-uid": user.uid || "",
          "x-username": user.username || ""
        }
      })
        .then(({ data }) => setChannel(data))
        .catch(() => {});
    }
  }, [user]);

  const generateNewStreamKey = async () => {
    setLoadingStream(true);
    try {
      const { data } = await api.post("/stream/create");
      setChannel(data.channel || data);
      toast.success("AWS IVS stream credentials generated & synced to Firestore!");
    } catch {
      toast.error("Failed to generate AWS IVS stream credentials.");
    } finally {
      setLoadingStream(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        display_name: displayName,
        bio,
      };

      let updatedData = null;
      try {
        const { data } = await api.patch("/users/me", payload);
        updatedData = data;
      } catch (err1) {
        try {
          const { data } = await api.put("/users/me", payload);
          updatedData = data;
        } catch (err2) {
          const { data } = await api.post("/users/me", payload);
          updatedData = data;
        }
      }

      if (user?.uid) {
        updateUserProfileInFirestore(user.uid, payload).catch(() => {});
      }

      if (updatedData) {
        setUser((prev) => (prev ? { ...prev, ...updatedData } : updatedData));
      } else {
        setUser((prev) => (prev ? { ...prev, display_name: displayName, bio } : { display_name: displayName, bio }));
      }

      toast.success("Profile updated successfully!");
    } catch (err) {
      console.error("Save profile error:", err);
      toast.error(apiErrorMessage(err) || "Failed to save profile.");
    } finally {
      setSaving(false);
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image must be under 5MB.");
      return;
    }
    setUploading(true);
    try {
      const base64 = await compressAndResizeImage(file, 400, 400, 0.7);
      const { data } = await api.post("/users/me/photo", {
        image: base64,
        photo: base64,
        file: base64,
        filename: file.name
      });
      const photoUrl = data?.photo_url || data?.url || data?.avatar_url;
      if (photoUrl) {
        setUser((prev) => ({ ...prev, photo_url: photoUrl }));
        if (user?.uid) {
          await updateUserProfileInFirestore(user.uid, { photo_url: photoUrl }, user.username);
        }
      }
      if (typeof refresh === "function") {
        await refresh();
      }
      toast.success("Photo updated.");
    } catch (err) {
      console.error("Photo upload error:", err);
      toast.error(apiErrorMessage(err) || "Upload photo failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl px-6 pt-12 pb-24 sm:pb-28 lg:pb-32" data-testid="profile-page">
      <div className="label-caps">// PROFILE</div>
      <h1 className="mb-8 font-display text-4xl font-black tracking-tighter sm:text-5xl">
        EDIT YOUR SIGNATURE
      </h1>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="border border-[#27272a] bg-[#0a0a0a] p-6">
            <div className="label-caps">// AVATAR</div>
            <div className="mt-4 flex flex-col items-center">
              {user.photo_url ? (
                <img
                  src={fileUrl(user.photo_url)}
                  alt=""
                  className="h-40 w-40 border border-[#27272a] object-cover"
                  data-testid="profile-avatar"
                />
              ) : (
                <div className="flex h-40 w-40 items-center justify-center border border-[#27272a] bg-black">
                  <User className="h-16 w-16 text-zinc-700" />
                </div>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                onChange={onFile}
                className="hidden"
                data-testid="profile-photo-input"
              />
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                data-testid="profile-photo-upload"
                className="btn-primary mt-6 inline-flex w-full items-center justify-center gap-2"
              >
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "UPLOADING..." : "UPLOAD PHOTO"}
              </button>
              <p className="mt-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                JPG / PNG / WEBP — MAX 5MB
              </p>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="border border-[#27272a] bg-[#0a0a0a] p-6">
            <div className="label-caps">// IDENTITY</div>
            <div className="mt-4 space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <label className="label-caps" htmlFor="username">USERNAME (PERMANENT HANDLE)</label>
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#e5ff00]">
                    🔒 FIRESTORE LOCKED
                  </span>
                </div>
                <input
                  id="username"
                  className="input-terminal opacity-70 bg-[#050505] text-[#e5ff00] cursor-not-allowed"
                  value={user.username}
                  readOnly
                />
                <p className="mt-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">
                  Permanent Firestore handle locked on sign-up. Cannot be reset or reverted.
                </p>
              </div>
              <div>
                <label className="label-caps" htmlFor="email-ro">EMAIL</label>
                <input
                  id="email-ro"
                  className="input-terminal opacity-60"
                  value={user.email}
                  readOnly
                />
              </div>
              <div>
                <label className="label-caps" htmlFor="display-name">DISPLAY NAME</label>
                <input
                  id="display-name"
                  data-testid="profile-display-name"
                  className="input-terminal"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={48}
                />
              </div>
              <div>
                <label className="label-caps" htmlFor="bio">BIO</label>
                <textarea
                  id="bio"
                  data-testid="profile-bio"
                  className="input-terminal min-h-[120px] resize-y"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  maxLength={280}
                  placeholder="Selectors, tracks, tell 'em what you're about."
                />
              </div>
              <button
                onClick={save}
                disabled={saving}
                data-testid="profile-save"
                className="btn-primary"
              >
                {saving ? "SAVING..." : "SAVE PROFILE"}
              </button>
            </div>
          </div>

          {/* Stream & Broadcast credentials */}
          <div className="mt-6 border border-[#27272a] bg-[#0a0a0a] p-6" data-testid="profile-stream-settings">
            <div className="mb-4 flex items-center justify-between">
              <div className="label-caps">// BROADCAST & STREAM KEY (AMAZON IVS)</div>
              <button
                onClick={generateNewStreamKey}
                disabled={loadingStream}
                data-testid="generate-stream-key-btn"
                className="btn-ghost inline-flex items-center gap-1.5 text-xs text-[#e5ff00]"
              >
                <RefreshCw className={`h-3 w-3 ${loadingStream ? "animate-spin" : ""}`} />
                {loadingStream ? "GENERATING..." : "REGENERATE KEY"}
              </button>
            </div>

            {channel ? (
              <div className="space-y-4">
                <div>
                  <div className="mb-1 label-caps">RTMP SERVER</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 overflow-x-auto whitespace-nowrap border border-[#27272a] bg-black px-3 py-2 font-mono text-[11px] text-zinc-200">
                      {channel.rtmp_url || channel.rtmpUrl || "rtmps://global-ingest.live-video.net:443/app/"}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(channel.rtmp_url || channel.rtmpUrl || "rtmps://global-ingest.live-video.net:443/app/");
                        toast.success("RTMP Server copied!");
                      }}
                      className="btn-ghost"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="label-caps">STREAM KEY</span>
                    <button
                      onClick={() => setRevealKey(!revealKey)}
                      className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 hover:text-[#e5ff00]"
                    >
                      {revealKey ? "HIDE" : "REVEAL"}
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 overflow-x-auto whitespace-nowrap border border-[#27272a] bg-black px-3 py-2 font-mono text-[11px] text-zinc-200">
                      {revealKey ? (channel.stream_key || channel.streamKey) : "•".repeat(Math.min((channel.stream_key || channel.streamKey || "").length || 16, 24))}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(channel.stream_key || channel.streamKey || "");
                        toast.success("Stream Key copied!");
                      }}
                      className="btn-ghost"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div>
                  <div className="mb-1 label-caps">PLAYBACK URL</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 overflow-x-auto whitespace-nowrap border border-[#27272a] bg-black px-3 py-2 font-mono text-[11px] text-zinc-300">
                      {channel.playback_url || channel.playbackUrl || channel.playback_id || "None"}
                    </code>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(channel.playback_url || channel.playbackUrl || channel.playback_id || "");
                        toast.success("Playback URL copied!");
                      }}
                      className="btn-ghost"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <p className="font-mono text-xs text-zinc-500">
                Loading stream details or no channel created yet...
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
