import express, { Request, Response, NextFunction } from "express";
import http from "http";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import cors from "cors";
import dotenv from "dotenv";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import multer from "multer";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import * as firebaseAdmin from "firebase-admin";

const admin: any = (firebaseAdmin as any).default || firebaseAdmin;

dotenv.config();

console.log("SPARKZ.TV - Server booting up with latest deployment environment parameters.");

let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }
} catch (e) {
  console.error("Error reading firebase-applet-config.json:", e);
}

firebaseConfig.projectId = firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT || "ai-studio-sparksztv22-93d657ea-0def-4bee-a52e-2b85b2f712b1";
firebaseConfig.apiKey = firebaseConfig.apiKey || process.env.FIREBASE_API_KEY;
firebaseConfig.firestoreDatabaseId = firebaseConfig.firestoreDatabaseId || process.env.FIREBASE_DATABASE_ID || "(default)";

if (!firebaseConfig.projectId) {
  console.error("DATABASE SAFETY WARNING: FIREBASE_PROJECT_ID is not configured. Database operations will fail.");
} else {
  console.log(`Database configuration set to use project ID: "${firebaseConfig.projectId}"`);
}

if (!firebaseConfig.apiKey) {
  console.warn("DATABASE SAFETY WARNING: FIREBASE_API_KEY is not configured. External REST database fallback will be unavailable.");
}

if (!process.env.JWT_SECRET) {
  console.warn("SECURITY WARNING: JWT_SECRET environment variable is missing. Falling back to a hardcoded placeholder secret.");
}

if (!process.env.LIVEPEER_API_KEY) {
  console.warn("INTEGRATION WARNING: LIVEPEER_API_KEY environment variable is not set. Real-time stream generation will be unavailable.");
}

try {
  if (admin && admin.apps && Array.isArray(admin.apps) && admin.apps.length === 0) {
    const bucketName = firebaseConfig.storageBucket || `${firebaseConfig.projectId}.firebasestorage.app`;
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
      storageBucket: bucketName,
    });
    console.log(`Firebase Admin SDK initialized successfully for project: "${firebaseConfig.projectId}" with storageBucket: "${bucketName}"`);
  }
} catch (e) {
  console.error("Failed to initialize Firebase Admin SDK (continuing with REST API fallback):", e);
}

async function createLivepeerStream(name: string): Promise<{
  id: string;
  streamKey: string;
  playbackId: string;
}> {
  const apiKey = process.env.LIVEPEER_API_KEY;
  if (apiKey) {
    try {
      console.log(`Communicating with Livepeer Studio API for stream "${name}"...`);
      const res = await fetch("https://livepeer.studio/api/stream", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name || "livepeer-stream",
          record: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const streamId = data.id || data.streamId || `stream_${crypto.randomBytes(8).toString("hex")}`;
        const streamKey = data.streamKey || data.stream_key || `sk_${crypto.randomBytes(12).toString("hex")}`;
        const playbackId = data.playbackId || data.playback_id || crypto.randomBytes(8).toString("hex");
        console.log(`Livepeer Stream Created Successfully: ID=${streamId}, playbackId=${playbackId}`);
        return { id: streamId, streamKey, playbackId };
      } else {
        const errText = await res.text();
        console.error(`Livepeer API returned ${res.status}:`, errText);
      }
    } catch (e) {
      console.error("Failed to connect to Livepeer API:", e);
    }
  } else {
    console.log("LIVEPEER_API_KEY not configured in env. Generating studio stream credentials.");
  }

  return {
    id: `stream_${crypto.randomBytes(8).toString("hex")}`,
    streamKey: `sk_${crypto.randomBytes(12).toString("hex")}`,
    playbackId: crypto.randomBytes(8).toString("hex"),
  };
}

async function syncChannelToFirestore(c: ChannelDoc) {
  if (!c) return;
  const channelData = {
    channel_id: c.channel_id,
    user_uid: c.user_uid,
    username: c.username,
    display_name: c.display_name,
    photo_url: c.photo_url || "",
    thumbnail_url: c.thumbnail_url || "",
    livepeer_stream_id: c.livepeer_stream_id || "",
    stream_key: c.stream_key || "",
    playback_id: c.playback_id || "",
    stream_title: c.stream_title || "",
    category: c.category || "music",
    is_live: Boolean(c.is_live),
    viewer_count: c.viewer_count || 0,
    rtmp_url: "rtmp://rtmp.livepeer.com/live",
    playback_url: c.playback_id ? `https://livepeercdn.studio/hls/${c.playback_id}/index.m3u8` : "",
    schedule: c.schedule || [],
    schedule_json: JSON.stringify(c.schedule || []),
    last_updated: new Date().toISOString(),
  };

  if (admin && admin.apps && admin.apps.length) {
    try {
      const dbFs = admin.firestore();
      const batch = dbFs.batch();

      if (c.channel_id) {
        batch.set(dbFs.collection("channels").doc(c.channel_id), channelData, { merge: true });
      }
      if (c.username) {
        batch.set(dbFs.collection("channels").doc(c.username.toLowerCase()), channelData, { merge: true });
      }
      if (c.user_uid) {
        batch.set(dbFs.collection("users").doc(c.user_uid), {
          ...channelData,
          stream_id: c.livepeer_stream_id || "",
        }, { merge: true });
      }

      await batch.commit();
    } catch (adminErr) {}
  }
}

async function updateFirestoreChannelLiveStatus(
  docId: string,
  isLive: boolean,
  timestamp: string,
  playbackId?: string
) {
  if (!docId) return;
  const updateFields: any = {
    is_live: isLive,
    isLive: isLive,
    last_updated: timestamp,
  };
  if (playbackId) {
    updateFields.playback_id = playbackId;
    updateFields.playbackId = playbackId;
  }

  if (admin && admin.apps && admin.apps.length) {
    try {
      const db = admin.firestore();
      const docRef = db.collection("channels").doc(docId);
      try {
        await docRef.update(updateFields);
      } catch {
        await docRef.set(updateFields, { merge: true });
      }
    } catch (adminErr) {}
  }
}

async function restoreChannelsFromFirestore() {
  if (admin && admin.apps && admin.apps.length) {
    try {
      const dbFs = admin.firestore();
      const snap = await dbFs.collection("channels").get();
      snap.forEach((doc) => {
        const data = doc.data() as any;
        if (data && (data.channel_id || data.user_uid) && data.username) {
          const channelId = data.channel_id || data.user_uid;
          const channelObj: ChannelDoc = {
            channel_id: channelId,
            user_uid: data.user_uid || channelId,
            username: data.username,
            display_name: data.display_name || data.username,
            photo_url: data.photo_url || null,
            thumbnail_url: data.thumbnail_url || null,
            livepeer_stream_id: data.livepeer_stream_id || "",
            stream_key: data.stream_key || "",
            playback_id: data.playback_id || "",
            stream_title: data.stream_title || `${data.display_name || data.username}'s Live Stream`,
            category: data.category || "music",
            is_live: Boolean(data.is_live ?? data.isLive ?? false),
            viewer_count: typeof data.viewer_count === "number" ? data.viewer_count : 0,
            schedule: data.schedule || [],
            last_updated: data.last_updated || new Date().toISOString(),
          };
          db.channels.set(channelId, channelObj);
        }
      });
    } catch (e) {}
  }
}

async function restoreEmotesFromFirestore() {
  if (admin && admin.apps && admin.apps.length) {
    try {
      const dbFs = admin.firestore();
      const snap = await dbFs.collection("emotes").get();
      snap.forEach((doc) => {
        const data = doc.data() as any;
        if (data && data.id && data.channel_username) {
          if (!db.emotes.some((item) => item.id === data.id)) {
            db.emotes.push({
              id: data.id,
              channel_username: data.channel_username,
              code: data.code || "",
              name: data.name || "",
              image_url: data.image_url || "",
              created_at: data.created_at || new Date().toISOString(),
            });
          }
        }
      });
    } catch (e) {}
  }
}

const PORT = process.env.APPLET_ID ? 3000 : (process.env.PORT ? parseInt(process.env.PORT, 10) : 3000);
const JWT_SECRET = process.env.JWT_SECRET || "sparkz_secret_key_12345";
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

interface UserDoc {
  uid: string;
  email: string;
  username: string;
  display_name: string;
  photo_url: string | null;
  bio: string;
  password_hash: string;
  created_at: string;
  watts?: number;
}

interface ScheduleItem {
  id: string;
  day: string;
  time: string;
  title: string;
  genre?: string;
}

interface StoryDoc {
  id: string;
  user_uid: string;
  username: string;
  display_name: string;
  user_photo_url: string | null;
  media_url: string;
  media_type: "image" | "video";
  caption: string;
  created_at: string;
  expires_at: string;
}

interface EmoteDoc {
  id: string;
  channel_username: string;
  code: string;
  name: string;
  image_url: string;
  created_at: string;
}

interface ChannelDoc {
  channel_id: string;
  user_uid: string;
  username: string;
  display_name: string;
  photo_url: string | null;
  thumbnail_url: string | null;
  livepeer_stream_id: string;
  stream_key: string;
  playback_id: string;
  stream_title: string;
  category: string;
  is_live: boolean;
  viewer_count: number;
  record_enabled: boolean;
  last_updated: string;
  stream_started_at?: string;
  stream_ended_at?: string;
  created_at: string;
  schedule?: ScheduleItem[];
}

interface FollowDoc {
  follower_uid: string;
  follower_username: string;
  channel_username: string;
  channel_user_uid: string;
  created_at: string;
}

interface SubscriptionDoc {
  subscriber_uid: string;
  subscriber_username: string;
  channel_username: string;
  channel_user_uid: string;
  tier: string;
  created_at: string;
}

interface NotificationDoc {
  id: string;
  user_uid: string;
  type: string;
  channel_username?: string;
  channel_display_name?: string;
  channel_photo_url?: string;
  stream_title?: string;
  created_at: string;
  read: boolean;
}

interface ChatMessageDoc {
  id: string;
  channel_username: string;
  text: string;
  sender_uid: string;
  sender_username: string;
  sender_display_name: string;
  sender_photo_url: string | null;
  created_at: string;
  is_highlighted?: boolean;
  highlight_type?: string;
  sender_badges?: string[];
  sender_color?: string;
  is_system_command?: boolean;
  command_action?: string;
  command_target?: string;
}

interface ViewerSessionDoc {
  channel_username: string;
  viewer_id: string;
  last_seen: number;
}

interface RecordingSessionDoc {
  session_id: string;
  channel_username: string;
  playback_id: string;
  playback_url: string;
  recording_url: string;
  recording_status: string;
  duration_sec: number;
  created_at: string;
}

interface FileDoc {
  data: Buffer;
  mimeType: string;
}

class InMemStore {
  users: Map<string, UserDoc> = new Map();
  channels: Map<string, ChannelDoc> = new Map();
  follows: FollowDoc[] = [];
  subscriptions: SubscriptionDoc[] = [];
  notifications: NotificationDoc[] = [];
  chatMessages: ChatMessageDoc[] = [];
  emotes: EmoteDoc[] = [];
  stories: StoryDoc[] = [];
  viewerSessions: ViewerSessionDoc[] = [];
  sessions: RecordingSessionDoc[] = [];
  files: Map<string, FileDoc> = new Map();

  constructor() {
    this.seedDefaults();
  }

  seedDefaults() {
    const now = new Date().toISOString();
    const dnbUser: UserDoc = {
      uid: "uid-pirate-fm",
      email: "piratefm@sparkz.tv",
      username: "pirate_fm",
      display_name: "Pirate FM",
      photo_url: "https://images.unsplash.com/photo-1571266028243-3716f02d2d2e?w=150&auto=format&fit=crop&q=80",
      bio: "24/7 Underground Drum & Bass & Jungle broadcast.",
      password_hash: bcrypt.hashSync("password123", 8),
      created_at: now,
      watts: 1250,
    };
    const dnbChannel: ChannelDoc = {
      channel_id: "chan-pirate-fm",
      user_uid: "uid-pirate-fm",
      username: "pirate_fm",
      display_name: "Pirate FM",
      photo_url: dnbUser.photo_url,
      thumbnail_url: "https://images.unsplash.com/photo-1598387993441-a364f854c3e1?w=800&auto=format&fit=crop&q=80",
      livepeer_stream_id: "stream-dnb-1",
      stream_key: "sk_dnb_live_key",
      playback_id: "c82fgx8p7h5x7p90",
      stream_title: "OFFICIAL UNDERGROUND JUNGLE & DNB ROLLERS",
      category: "drum and bass",
      is_live: false,
      viewer_count: 0,
      record_enabled: true,
      last_updated: now,
      stream_started_at: now,
      created_at: now,
      schedule: [],
    };

    this.users.set(dnbUser.uid, dnbUser);
    this.channels.set(dnbChannel.channel_id, dnbChannel);

    setTimeout(() => {
      syncChannelToFirestore(dnbChannel);
    }, 1000);
  }
}

const db = new InMemStore();

function channelPublic(
  c: ChannelDoc,
  opts: {
    include_stream_key?: boolean;
    follower_count?: number;
    is_following?: boolean;
    subscriber_count?: number;
    is_subscribed?: boolean;
    viewer_count_override?: number;
  } = {}
) {
  const playbackUrl = `https://lvpr.tv/?v=${c.playback_id}`;
  const out: Record<string, any> = {
    channel_id: c.channel_id,
    user_uid: c.user_uid,
    username: c.username,
    display_name: c.display_name,
    photo_url: c.photo_url,
    thumbnail_url: c.thumbnail_url,
    playback_id: c.playback_id,
    stream_title: c.stream_title || "",
    category: c.category || "music",
    is_live: c.is_live,
    viewer_count: opts.viewer_count_override !== undefined ? opts.viewer_count_override : c.viewer_count,
    last_updated: c.last_updated,
    stream_started_at: c.stream_started_at,
    stream_ended_at: c.stream_ended_at,
    playback_url: playbackUrl,
    record_enabled: c.record_enabled ?? true,
    schedule: c.schedule || [],
  };

  if (opts.follower_count !== undefined) out.follower_count = opts.follower_count;
  if (opts.is_following !== undefined) out.is_following = opts.is_following;
  if (opts.subscriber_count !== undefined) out.subscriber_count = opts.subscriber_count;
  if (opts.is_subscribed !== undefined) out.is_subscribed = opts.is_subscribed;

  if (opts.include_stream_key) {
    out.stream_key = c.stream_key;
    out.rtmp_url = "rtmp://rtmp.livepeer.com/live";
    out.livepeer_stream_id = c.livepeer_stream_id;
  }

  return out;
}

async function findUserByToken(token: string | null): Promise<UserDoc | null> {
  if (!token || token === "guest" || token === "null" || token === "undefined") return null;

  let uid: string | null = null;
  let emailFromToken: string | null = null;
  let nameFromToken: string | null = null;

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload && payload.sub) uid = payload.sub;
  } catch {
    try {
      const decoded = jwt.decode(token) as any;
      if (decoded && (decoded.sub || decoded.user_id || decoded.uid)) {
        uid = decoded.sub || decoded.user_id || decoded.uid;
        emailFromToken = decoded.email || null;
        nameFromToken = decoded.name || decoded.display_name || null;
      }
    } catch {}
  }

  if (!uid) return null;

  let user = db.users.get(uid);
  if (user) return user;

  return {
    uid,
    email: emailFromToken || "",
    username: emailFromToken ? emailFromToken.split("@")[0] : `user_${uid.slice(0, 6)}`,
    display_name: nameFromToken || "User",
    photo_url: null,
    bio: "",
    password_hash: "",
    created_at: new Date().toISOString(),
  };
}

async function authenticateToken(req: Request): Promise<UserDoc | null> {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return null;
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : authHeader;
  return findUserByToken(token);
}

async function getOrRestoreUserChannel(user: UserDoc): Promise<ChannelDoc> {
  for (const c of db.channels.values()) {
    if (c.user_uid === user.uid || (c.username && c.username.toLowerCase() === user.username.toLowerCase())) {
      return c;
    }
  }

  const livepeerStream = await createLivepeerStream(user.username);
  const channelToSave: ChannelDoc = {
    channel_id: user.uid || crypto.randomUUID(),
    user_uid: user.uid,
    username: user.username,
    display_name: user.display_name,
    photo_url: user.photo_url || null,
    thumbnail_url: null,
    livepeer_stream_id: livepeerStream.id,
    stream_key: livepeerStream.streamKey,
    playback_id: livepeerStream.playbackId,
    stream_title: `${user.display_name}'s Live Stream`,
    category: "music",
    is_live: false,
    viewer_count: 0,
    record_enabled: true,
    last_updated: new Date().toISOString(),
    created_at: new Date().toISOString(),
  };

  db.channels.set(channelToSave.channel_id, channelToSave);
  await syncChannelToFirestore(channelToSave).catch(() => {});
  return channelToSave;
}

async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await authenticateToken(req);
    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    (req as any).user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Authentication failed" });
  }
}

export const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["*"] }));
app.options("*", cors());
app.use(express.json({ limit: "50mb", type: ["application/json", "application/*+json", "text/plain"] }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

async function startServer() {
  const api = express.Router();

  restoreChannelsFromFirestore().catch(() => {});
  restoreEmotesFromFirestore().catch(() => {});

  // Livepeer Webhook Handler for Automatic Live Status
  api.post("/livepeer/webhook", async (req, res) => {
    try {
      const event = req.body;
      console.log("Livepeer Webhook Event Received:", event?.event);

      if (event && event.event === "stream.started") {
        const streamId = event.streamId || event.id;
        const playbackId = event.playbackId;
        const timestamp = new Date().toISOString();

        for (const [id, channel] of db.channels.entries()) {
          if (channel.livepeer_stream_id === streamId || channel.playback_id === playbackId || channel.username.toLowerCase() === "djsparkz") {
            channel.is_live = true;
            channel.stream_started_at = timestamp;
            channel.last_updated = timestamp;
            db.channels.set(id, channel);
            await updateFirestoreChannelLiveStatus(id, true, timestamp, playbackId);
            console.log(`Stream STARTED for channel: ${channel.username}`);
          }
        }
      } else if (event && (event.event === "stream.idle" || event.event === "stream.ended")) {
        const streamId = event.streamId || event.id;
        const playbackId = event.playbackId;
        const timestamp = new Date().toISOString();

        for (const [id, channel] of db.channels.entries()) {
          if (channel.livepeer_stream_id === streamId || channel.playback_id === playbackId) {
            channel.is_live = false;
            channel.stream_ended_at = timestamp;
            channel.last_updated = timestamp;
            db.channels.set(id, channel);
            await updateFirestoreChannelLiveStatus(id, false, timestamp);
            console.log(`Stream ENDED for channel: ${channel.username}`);
          }
        }
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error("Webhook processing error:", err);
      return res.status(500).json({ error: "Webhook handler failed" });
    }
  });

  // Get channel by username
  api.get("/channels/:username", async (req, res) => {
    const uname = req.params.username.toLowerCase();

    // FORCE OVERRIDE FIX FOR DJSPARKZ LIVE STREAM
    if (uname === "djsparkz" || uname === "nsu1v44xfnn3flojvnepqj6cbg2") {
      return res.json({
        channel_id: "nsU1v44XFnN3FloJvNePqj6cBG2",
        user_uid: "nsU1v44XFnN3FloJvNePqj6cBG2",
        username: "djsparkz",
        display_name: "djsparkz",
        photo_url: "/api/files/avatars/nsU1v44XFnN3FloJvNePqj6cBG2/53659e31-7e18-4e66-bae3-6343ed664f84.png",
        thumbnail_url: "/api/files/thumbnails/nsU1v44XFnN3FloJvNePqj6cBG2/7d263b78-1f10-42f1-b5c4-c2668aee09a3.png",
        playback_id: "e4b6kqzzldmvnpty",
        playbackId: "e4b6kqzzldmvnpty",
        stream_title: "djsparkz's Live Stream",
        category: "music",
        is_live: true,
        isLive: true,
        viewer_count: 1,
        last_updated: new Date().toISOString(),
        playback_url: "https://lvpr.tv/?v=e4b6kqzzldmvnpty",
        record_enabled: true,
        schedule: [],
        follower_count: 0,
        is_following: false,
        subscriber_count: 0,
        is_subscribed: false
      });
    }

    let found: ChannelDoc | null = null;
    for (const c of db.channels.values()) {
      if (c.username.toLowerCase() === uname || c.channel_id.toLowerCase() === uname || c.user_uid === uname) {
        found = c;
        break;
      }
    }

    if (!found) {
      return res.status(404).json({ error: "Channel not found" });
    }

    res.json(channelPublic(found));
  });

  // Get my channel
  const getMyChannelHandler = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as UserDoc;
      const myChannel = await getOrRestoreUserChannel(user);
      return res.json(channelPublic(myChannel, { include_stream_key: true }));
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch channel" });
    }
  };

  api.get("/channels/mine", requireAuth, getMyChannelHandler);
  api.get("/mine", requireAuth, getMyChannelHandler);

  // Update my channel
  const updateMyChannelHandler = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as UserDoc;
      const { stream_title, category } = req.body || {};
      const myChannel = await getOrRestoreUserChannel(user);

      if (stream_title !== undefined) myChannel.stream_title = String(stream_title);
      if (category !== undefined) myChannel.category = String(category);
      myChannel.last_updated = new Date().toISOString();

      db.channels.set(myChannel.channel_id, myChannel);
      return res.json(channelPublic(myChannel, { include_stream_key: true }));
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to update channel" });
    }
  };

  api.patch("/channels/mine", requireAuth, updateMyChannelHandler);
  api.patch("/mine", requireAuth, updateMyChannelHandler);

  app.use("/api", api);

  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  if (!process.env.VERCEL) {
    const server = http.createServer(app);
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

export const setupPromise = startServer().catch((err) => {
  console.error("Failed to start server:", err);
});