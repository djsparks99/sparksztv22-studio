import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { api, fileUrl, apiErrorMessage, fileToBase64 } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import {
  Plus,
  Play,
  Pause,
  ChevronLeft,
  ChevronRight,
  X,
  Trash2,
  Clock,
  Sparkles,
  Upload,
  Image as ImageIcon,
  Film,
  MessageSquare,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";

export default function StoriesSection({ sidebar = false, collapsed = false }) {
  const { user } = useAuth();
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeStoryIndex, setActiveStoryIndex] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Fetch active stories
  const loadStories = async () => {
    try {
      const { data } = await api.get("/stories");
      if (Array.isArray(data)) {
        setStories(data);
      }
    } catch (e) {
      console.error("Failed to load stories:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStories();
    const interval = setInterval(loadStories, 15000); // refresh every 15s
    return () => clearInterval(interval);
  }, []);

  const openViewer = (index) => {
    setActiveStoryIndex(index);
  };

  const closeViewer = () => {
    setActiveStoryIndex(null);
  };

  const handleDeleteStory = async (storyId) => {
    try {
      await api.delete(`/stories/${storyId}`);
      toast.success("Story removed!");
      setStories((prev) => prev.filter((s) => s.id !== storyId));
      if (activeStoryIndex !== null) {
        if (stories.length <= 1) {
          closeViewer();
        } else if (activeStoryIndex >= stories.length - 1) {
          setActiveStoryIndex(stories.length - 2);
        }
      }
    } catch (err) {
      toast.error(apiErrorMessage(err) || "Failed to delete story");
    }
  };

  if (sidebar) {
    if (collapsed) {
      // Collapsed sidebar vertical list of stories
      return (
        <div className="flex flex-col items-center py-4 gap-4 border-b border-[#27272a]/40" data-testid="stories-sidebar-collapsed">
          {/* Compact Upload Story Trigger */}
          <button
            type="button"
            data-testid="create-story-btn-collapsed"
            onClick={() => {
              if (!user) {
                toast.error("Please log in to share a story");
                return;
              }
              setShowCreateModal(true);
            }}
            className="group relative flex flex-col items-center justify-center cursor-pointer"
            title="Post a 24-Hour Transmission"
          >
            <div className="relative flex h-9 w-9 items-center justify-center rounded-full border border-dashed border-[#e5ff00]/60 bg-[#0a0a0a] transition-all group-hover:scale-105 group-hover:border-[#e5ff00] group-hover:bg-[#e5ff00]/10">
              {user?.photo_url ? (
                <img
                  src={fileUrl(user.photo_url)}
                  alt="Your Avatar"
                  className="h-full w-full rounded-full object-cover opacity-60 group-hover:opacity-100"
                />
              ) : (
                <div className="h-full w-full rounded-full bg-zinc-900" />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-5 w-5 items-center justify-center rounded-full border border-black bg-[#e5ff00] text-black shadow-md transition-transform group-hover:scale-110">
                  <Plus className="h-3 w-3 stroke-[3]" />
                </div>
              </div>
            </div>
          </button>

          {/* Loading state */}
          {loading && (
            <div className="flex flex-col items-center gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-8 w-8 rounded-full bg-zinc-800 border border-zinc-700 animate-pulse" />
              ))}
            </div>
          )}

          {/* Stories List */}
          {!loading &&
            stories.map((story, idx) => {
              const hoursLeft = Math.floor(story.time_left_sec / 3600);
              const minsLeft = Math.floor((story.time_left_sec % 3600) / 60);

              return (
                <button
                  key={story.id}
                  type="button"
                  data-testid={`story-item-${story.id}`}
                  onClick={() => openViewer(idx)}
                  className="group relative flex flex-col items-center cursor-pointer"
                  title={`${story.display_name} (${hoursLeft > 0 ? `${hoursLeft}h` : `${minsLeft}m`} left)`}
                >
                  <div className="relative p-0.5 rounded-full border border-[#e5ff00] shadow-[0_0_6px_rgba(229,255,0,0.3)] group-hover:scale-105 group-hover:shadow-[0_0_10px_rgba(229,255,0,0.6)] transition-all">
                    <div className="h-8 w-8 overflow-hidden rounded-full bg-zinc-900 border border-black flex items-center justify-center">
                      {story.user_photo_url ? (
                        <img
                          src={fileUrl(story.user_photo_url)}
                          alt={story.display_name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-mono font-bold text-xs text-[#e5ff00] bg-zinc-950">
                          {story.display_name?.slice(0, 2)?.toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Media Type Indicator Badge */}
                    <div className="absolute -bottom-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#050505] border border-[#e5ff00] text-[#e5ff00]">
                      {story.media_type === "video" ? (
                        <Film className="h-1.5 w-1.5" />
                      ) : (
                        <ImageIcon className="h-1.5 w-1.5" />
                      )}
                    </div>
                  </div>
                </button>
              );
            })}

          {/* Modal hooks inside condition */}
          {activeStoryIndex !== null && stories[activeStoryIndex] && (
            <StoryViewerModal
              stories={stories}
              currentIndex={activeStoryIndex}
              setCurrentIndex={setActiveStoryIndex}
              onClose={closeViewer}
              onDelete={handleDeleteStory}
              currentUser={user}
            />
          )}

          {showCreateModal && (
            <CreateStoryModal
              onClose={() => setShowCreateModal(false)}
              onSuccess={() => {
                setShowCreateModal(false);
                loadStories();
              }}
            />
          )}
        </div>
      );
    } else {
      // Expanded sidebar horizontal scrolling of stories
      return (
        <div className="flex flex-col p-3 border-b border-[#27272a]/40" data-testid="stories-sidebar-expanded">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase font-bold tracking-wider text-[#e5ff00]">
              <Sparkles className="h-3 w-3 animate-pulse" />
              <span>TRANSMISSIONS</span>
            </div>
            <span className="font-mono text-[8px] text-zinc-500 uppercase tracking-widest">
              24H LIMIT
            </span>
          </div>

          <div className="flex items-center gap-3 overflow-x-auto pb-1.5 pt-0.5 no-scrollbar scroll-smooth">
            {/* Post Story Button */}
            <button
              type="button"
              data-testid="create-story-btn"
              onClick={() => {
                if (!user) {
                  toast.error("Please log in to share a story");
                  return;
                }
                setShowCreateModal(true);
              }}
              className="group relative flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer"
            >
              <div className="relative flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-[#e5ff00]/60 bg-[#0a0a0a] transition-all group-hover:scale-105 group-hover:border-[#e5ff00] group-hover:bg-[#e5ff00]/10">
                {user?.photo_url ? (
                  <img
                    src={fileUrl(user.photo_url)}
                    alt="Your Avatar"
                    className="h-full w-full rounded-full object-cover opacity-60 group-hover:opacity-100"
                  />
                ) : (
                  <div className="h-full w-full rounded-full bg-zinc-900" />
                )}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="flex h-5 w-5 items-center justify-center rounded-full border border-black bg-[#e5ff00] text-black shadow-md transition-transform group-hover:scale-110">
                    <Plus className="h-3 w-3 stroke-[3]" />
                  </div>
                </div>
              </div>
              <span className="font-mono text-[8px] uppercase tracking-wider font-bold text-zinc-400 group-hover:text-[#e5ff00]">
                + YOURS
              </span>
            </button>

            {/* Loading Skeletons */}
            {loading && (
              <div className="flex items-center gap-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex flex-col items-center gap-1.5 flex-shrink-0 animate-pulse">
                    <div className="h-10 w-10 rounded-full bg-zinc-800 border border-zinc-700" />
                    <div className="h-2 w-8 rounded bg-zinc-800" />
                  </div>
                ))}
              </div>
            )}

            {/* Stories circles */}
            {!loading &&
              stories.map((story, idx) => {
                const isMine = user && story.user_uid === user.uid;
                const hoursLeft = Math.floor(story.time_left_sec / 3600);
                const minsLeft = Math.floor((story.time_left_sec % 3600) / 60);

                return (
                  <button
                    key={story.id}
                    type="button"
                    data-testid={`story-item-${story.id}`}
                    onClick={() => openViewer(idx)}
                    className="group relative flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer text-left"
                  >
                    <div className="relative p-0.5 rounded-full border border-[#e5ff00] shadow-[0_0_6px_rgba(229,255,0,0.3)] group-hover:scale-105 group-hover:shadow-[0_0_10px_rgba(229,255,0,0.6)] transition-all">
                      <div className="h-9 w-9 overflow-hidden rounded-full bg-zinc-900 border border-black flex items-center justify-center">
                        {story.user_photo_url ? (
                          <img
                            src={fileUrl(story.user_photo_url)}
                            alt={story.display_name}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center font-mono font-bold text-[10px] text-[#e5ff00] bg-zinc-950">
                            {story.display_name?.slice(0, 2)?.toUpperCase()}
                          </div>
                        )}
                      </div>

                      {/* Media Type Indicator Badge */}
                      <div className="absolute -bottom-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#050505] border border-[#e5ff00] text-[#e5ff00]">
                        {story.media_type === "video" ? (
                          <Film className="h-1.5 w-1.5" />
                        ) : (
                          <ImageIcon className="h-1.5 w-1.5" />
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-center">
                      <span className="font-mono text-[8px] uppercase font-bold text-zinc-300 group-hover:text-[#e5ff00] max-w-[48px] truncate">
                        {isMine ? "YOU" : story.display_name}
                      </span>
                      <span className="font-mono text-[7px] text-[#e5ff00] tracking-tight flex items-center gap-0.5">
                        <Clock className="h-1.5 w-1.5" />
                        {hoursLeft > 0 ? `${hoursLeft}h` : `${minsLeft}m`}
                      </span>
                    </div>
                  </button>
                );
              })}
          </div>

          {/* Modal hooks inside condition */}
          {activeStoryIndex !== null && stories[activeStoryIndex] && (
            <StoryViewerModal
              stories={stories}
              currentIndex={activeStoryIndex}
              setCurrentIndex={setActiveStoryIndex}
              onClose={closeViewer}
              onDelete={handleDeleteStory}
              currentUser={user}
            />
          )}

          {showCreateModal && (
            <CreateStoryModal
              onClose={() => setShowCreateModal(false)}
              onSuccess={() => {
                setShowCreateModal(false);
                loadStories();
              }}
            />
          )}
        </div>
      );
    }
  }

  return (
    <section className="mb-8 border-y border-[#27272a] bg-[#050505] py-4" data-testid="stories-section">
      <div className="mx-auto max-w-[1440px] px-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase font-bold tracking-widest text-[#e5ff00]">
            <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            <span>24-HOUR TRANSMISSIONS</span>
          </div>
          <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest hidden sm:inline">
            DISAPPEARS PERMANENTLY AFTER 24 HOURS
          </span>
        </div>

        {/* Stories Horizontal Reel */}
        <div className="flex items-center gap-4 overflow-x-auto pb-2 pt-1 no-scrollbar scroll-smooth">
          {/* Post Story Button */}
          <button
            type="button"
            data-testid="create-story-btn"
            onClick={() => {
              if (!user) {
                toast.error("Please log in to share a story");
                return;
              }
              setShowCreateModal(true);
            }}
            className="group relative flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer"
          >
            <div className="relative flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-[#e5ff00]/60 bg-[#0a0a0a] transition-all group-hover:scale-105 group-hover:border-[#e5ff00] group-hover:bg-[#e5ff00]/10">
              {user?.photo_url ? (
                <img
                  src={fileUrl(user.photo_url)}
                  alt="Your Avatar"
                  className="h-full w-full rounded-full object-cover opacity-60 group-hover:opacity-100"
                />
              ) : (
                <div className="h-full w-full rounded-full bg-zinc-900" />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex h-7 w-7 items-center justify-center rounded-full border border-black bg-[#e5ff00] text-black shadow-md transition-transform group-hover:scale-110">
                  <Plus className="h-4 w-4 stroke-[3]" />
                </div>
              </div>
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider font-bold text-zinc-300 group-hover:text-[#e5ff00]">
              + YOUR STORY
            </span>
          </button>

          {/* Loading Skeleton */}
          {loading && (
            <div className="flex items-center gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="flex flex-col items-center gap-2 flex-shrink-0 animate-pulse">
                  <div className="h-16 w-16 rounded-full bg-zinc-800 border border-zinc-700" />
                  <div className="h-2 w-12 rounded bg-zinc-800" />
                </div>
              ))}
            </div>
          )}

          {/* Active Stories Circle Avatars */}
          {!loading && stories.length === 0 && (
            <div className="flex items-center gap-2 font-mono text-[11px] text-zinc-500 uppercase px-2">
              <span>No active transmissions. Be the first to share!</span>
            </div>
          )}

          {!loading &&
            stories.map((story, idx) => {
              const isMine = user && story.user_uid === user.uid;
              const hoursLeft = Math.floor(story.time_left_sec / 3600);
              const minsLeft = Math.floor((story.time_left_sec % 3600) / 60);

              return (
                <button
                  key={story.id}
                  type="button"
                  data-testid={`story-item-${story.id}`}
                  onClick={() => openViewer(idx)}
                  className="group relative flex flex-col items-center gap-2 flex-shrink-0 cursor-pointer text-left"
                >
                  <div className="relative p-0.5 rounded-full border-2 border-[#e5ff00] shadow-[0_0_10px_rgba(229,255,0,0.4)] group-hover:scale-105 group-hover:shadow-[0_0_16px_rgba(229,255,0,0.8)] transition-all">
                    <div className="h-16 w-16 overflow-hidden rounded-full bg-zinc-900 border border-black flex items-center justify-center">
                      {story.user_photo_url ? (
                        <img
                          src={fileUrl(story.user_photo_url)}
                          alt={story.display_name}
                          className="h-full w-full object-cover"
                          style={{ objectFit: "cover", width: "100%", height: "100%" }}
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center font-mono font-bold text-sm text-[#e5ff00] bg-zinc-950">
                          {story.display_name?.slice(0, 2)?.toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Media Type Indicator Badge */}
                    <div className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-[#050505] border border-[#e5ff00] text-[#e5ff00]">
                      {story.media_type === "video" ? (
                        <Film className="h-2.5 w-2.5" />
                      ) : (
                        <ImageIcon className="h-2.5 w-2.5" />
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-center">
                    <span className="font-mono text-[10px] uppercase font-bold text-zinc-200 group-hover:text-[#e5ff00] max-w-[70px] truncate">
                      {isMine ? "YOU" : story.display_name}
                    </span>
                    <span className="font-mono text-[8px] text-[#e5ff00] tracking-tight flex items-center gap-0.5">
                      <Clock className="h-2 w-2" />
                      {hoursLeft > 0 ? `${hoursLeft}h` : `${minsLeft}m`}
                    </span>
                  </div>
                </button>
              );
            })}
        </div>
      </div>

      {/* Fullscreen Story Viewer Modal */}
      {activeStoryIndex !== null && stories[activeStoryIndex] && (
        <StoryViewerModal
          stories={stories}
          currentIndex={activeStoryIndex}
          setCurrentIndex={setActiveStoryIndex}
          onClose={closeViewer}
          onDelete={handleDeleteStory}
          currentUser={user}
        />
      )}

      {/* Create New Story Modal */}
      {showCreateModal && (
        <CreateStoryModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            loadStories();
          }}
        />
      )}
    </section>
  );
}

// Fullscreen Story Viewer Modal
function StoryViewerModal({
  stories,
  currentIndex,
  setCurrentIndex,
  onClose,
  onDelete,
  currentUser,
}) {
  const story = stories[currentIndex];
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const duration = 7; // 7 seconds per story

  useEffect(() => {
    setProgress(0);
  }, [currentIndex]);

  useEffect(() => {
    if (paused || !story) return;

    const interval = 50; // update progress every 50ms
    const step = (interval / (duration * 1000)) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + step;
        if (next >= 100) {
          return 100;
        }
        return next;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [currentIndex, paused, story, duration]);

  useEffect(() => {
    if (progress >= 100) {
      if (currentIndex < stories.length - 1) {
        setCurrentIndex((i) => i + 1);
      } else {
        onClose();
      }
    }
  }, [progress, currentIndex, stories.length, onClose, setCurrentIndex]);

  if (!story) return null;

  const isOwner = currentUser && story.user_uid === currentUser.uid;
  const hoursLeft = Math.floor(story.time_left_sec / 3600);
  const minsLeft = Math.floor((story.time_left_sec % 3600) / 60);

  const prevStory = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const nextStory = () => {
    if (currentIndex < stories.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onClose();
    }
  };

  return (
    <div
      data-testid="story-viewer-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-md p-2 sm:p-6"
    >
      {/* Container simulating vertical smartphone screen / story card */}
      <div className="relative flex h-full max-h-[850px] w-full max-w-[440px] flex-col overflow-hidden rounded-xl border border-[#27272a] bg-[#050505] shadow-[0_0_50px_rgba(229,255,0,0.15)]">
        
        {/* Top Progress Bars */}
        <div className="absolute top-0 left-0 right-0 z-20 flex gap-1 p-3 bg-gradient-to-b from-black/80 via-black/40 to-transparent">
          {stories.map((s, i) => (
            <div key={s.id} className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full bg-[#e5ff00] transition-all duration-75"
                style={{
                  width:
                    i < currentIndex
                      ? "100%"
                      : i === currentIndex
                      ? `${progress}%`
                      : "0%",
                }}
              />
            </div>
          ))}
        </div>

        {/* Story Header */}
        <div className="absolute top-4 left-0 right-0 z-20 flex items-center justify-between px-4 pt-2">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 overflow-hidden rounded-full border border-[#e5ff00] bg-zinc-900">
              {story.user_photo_url ? (
                <img
                  src={fileUrl(story.user_photo_url)}
                  alt={story.display_name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-mono font-bold text-xs text-[#e5ff00]">
                  {story.display_name?.slice(0, 2)?.toUpperCase()}
                </div>
              )}
            </div>
            <div>
              <Link
                to={`/channel/${story.username}`}
                onClick={onClose}
                className="font-mono text-xs uppercase font-bold text-white hover:text-[#e5ff00]"
              >
                {story.display_name}
              </Link>
              <div className="flex items-center gap-1 font-mono text-[9px] text-[#e5ff00]">
                <Clock className="h-2.5 w-2.5" />
                <span>
                  EXPIRES IN {hoursLeft > 0 ? `${hoursLeft}h ${minsLeft}m` : `${minsLeft}m`}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPaused(!paused)}
              className="p-1.5 text-zinc-300 hover:text-[#e5ff00] bg-black/60 rounded-full"
              title={paused ? "Play" : "Pause"}
            >
              {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
            </button>

            {isOwner && (
              <button
                type="button"
                onClick={() => onDelete(story.id)}
                className="p-1.5 text-red-400 hover:text-red-300 bg-black/60 rounded-full"
                title="Delete Story"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-zinc-300 hover:text-white bg-black/60 rounded-full"
              title="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Media Content */}
        <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden" style={{ overflow: "hidden" }}>
          {story.media_type === "video" ? (
            <video
              src={fileUrl(story.media_url)}
              autoPlay
              playsInline
              loop={false}
              className="h-full w-full object-contain"
              onEnded={nextStory}
              style={{ objectFit: "contain", width: "100%", height: "100%", maxHeight: "100%", maxWidth: "100%" }}
            />
          ) : (
            <img
              src={fileUrl(story.media_url)}
              alt="Story Transmission"
              className="h-full w-full object-cover"
              style={{ objectFit: "cover", width: "100%", height: "100%", maxHeight: "100%", maxWidth: "100%" }}
            />
          )}

          {/* Left / Right Tap Controls */}
          <div
            className="absolute top-0 bottom-0 left-0 w-1/3 z-10 cursor-pointer"
            onClick={prevStory}
          />
          <div
            className="absolute top-0 bottom-0 right-0 w-1/3 z-10 cursor-pointer"
            onClick={nextStory}
          />
        </div>

        {/* Story Text / Overlay Caption */}
        {story.caption && (
          <div className="absolute bottom-6 left-4 right-4 z-20 rounded-lg border border-[#e5ff00]/40 bg-black/85 p-3 backdrop-blur-md shadow-lg">
            <div className="mb-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-widest text-[#e5ff00]">
              <MessageSquare className="h-3 w-3" /> TRANSMISSION CAPTION
            </div>
            <p className="font-sans text-sm font-semibold text-white leading-snug">
              {story.caption}
            </p>
          </div>
        )}

        {/* Navigation Buttons for desktop */}
        {currentIndex > 0 && (
          <button
            type="button"
            onClick={prevStory}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-black/70 text-white hover:text-[#e5ff00]"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <button
          type="button"
          onClick={nextStory}
          className="absolute right-2 top-1/2 -translate-y-1/2 z-30 p-2 rounded-full bg-black/70 text-white hover:text-[#e5ff00]"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      </div>
    </div>
  );
}

// Create Story Modal Component
function CreateStoryModal({ onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [mediaType, setMediaType] = useState("image");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    if (selected.size > 50 * 1024 * 1024) {
      toast.error("File size must be under 50MB");
      return;
    }

    const isVid = selected.type.startsWith("video/");
    setMediaType(isVid ? "video" : "image");
    setFile(selected);

    const objectUrl = URL.createObjectURL(selected);
    setPreviewUrl(objectUrl);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error("Please select a photo or video");
      return;
    }

    try {
      setUploading(true);
      const base64 = await fileToBase64(file);
      await api.post("/stories", {
        media: base64,
        file: base64,
        caption,
        media_type: mediaType,
        filename: file.name
      });

      toast.success("24-Hour Story Published! ⚡");
      onSuccess();
    } catch (err) {
      console.error("Story upload error:", err);
      toast.error(apiErrorMessage(err) || "Failed to upload story");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div
      data-testid="create-story-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-md"
    >
      <div className="relative w-full max-w-md border border-[#27272a] bg-[#0a0a0a] p-6 shadow-2xl rounded-sm">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-zinc-400 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4 flex items-center gap-2 font-mono text-xs uppercase font-bold tracking-widest text-[#e5ff00]">
          <Sparkles className="h-4 w-4" />
          <span>NEW 24-HOUR STORY</span>
        </div>

        <div className="mb-4 flex items-center gap-2 border border-[#e5ff00]/30 bg-[#e5ff00]/10 p-2.5 text-xs text-zinc-300">
          <AlertCircle className="h-4 w-4 text-[#e5ff00] flex-shrink-0" />
          <span className="font-mono text-[10px] uppercase">
            Stories automatically self-destruct and disappear after 24 hours.
          </span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* File Selector & Preview */}
          <div>
            <label className="label-caps mb-2 block">// SELECT PHOTO OR VIDEO</label>
            {previewUrl ? (
              <div className="relative max-h-60 w-full overflow-hidden rounded border border-[#27272a] bg-black flex items-center justify-center">
                {mediaType === "video" ? (
                  <video src={previewUrl} controls className="max-h-56 w-full object-contain" />
                ) : (
                  <img src={previewUrl} alt="Preview" className="max-h-56 w-full object-contain" />
                )}
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    setPreviewUrl(null);
                  }}
                  className="absolute top-2 right-2 rounded bg-black/80 p-1 text-red-400 hover:text-red-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <label className="flex h-36 w-full cursor-pointer flex-col items-center justify-center border-2 border-dashed border-[#27272a] bg-[#050505] p-4 text-center transition-all hover:border-[#e5ff00]">
                <Upload className="mb-2 h-6 w-6 text-[#e5ff00]" />
                <span className="font-mono text-xs uppercase font-bold text-zinc-300">
                  UPLOAD PHOTO OR VIDEO
                </span>
                <span className="font-mono text-[10px] text-zinc-500 mt-1">
                  PNG, JPG, GIF, MP4, WEBM (Max 50MB)
                </span>
                <input
                  type="file"
                  accept="image/*,video/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {/* Caption Input */}
          <div>
            <label className="label-caps mb-1 block">// CAPTION & TEXT (OPTIONAL)</label>
            <textarea
              className="input-terminal w-full resize-none h-20"
              placeholder="Write a message for your story..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              maxLength={280}
            />
            <div className="text-right font-mono text-[9px] text-zinc-500">
              {caption.length}/280
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="btn-ghost flex-1 py-2.5"
              disabled={uploading}
            >
              CANCEL
            </button>
            <button
              type="submit"
              disabled={!file || uploading}
              className="btn-primary flex-1 py-2.5 font-bold uppercase"
            >
              {uploading ? "UPLOADING..." : "⚡ PUBLISH STORY"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
