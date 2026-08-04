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

// Set up uploads directory and multer configuration
const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp3";
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max file size
  },
});

function getFileUrl(req: any, filename: string): string {
  const host = req.headers["x-forwarded-host"] || req.get("host") || "localhost:3000";
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${proto}://${host}/api/files/${filename}`;
}

function saveBase64File(base64Str: string, originalFilename: string): string {
  const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
  let buffer: Buffer;
  let extension = path.extname(originalFilename) || ".jpg";

  if (matches && matches.length === 3) {
    buffer = Buffer.from(matches[2], "base64");
  } else {
    buffer = Buffer.from(base64Str, "base64");
  }

  const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(2, 10)}${extension}`;
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  fs.writeFileSync(path.join(uploadsDir, uniqueName), buffer);
  return uniqueName;
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

  let isLiveVal = Boolean(c.is_live);
  let playbackIdVal = c.playback_id || "";
  let livepeerStreamIdVal = c.livepeer_stream_id || "";
  let streamKeyVal = c.stream_key || "";

  if (c.username?.toLowerCase() === "djsparkz" || c.channel_id === "nsU1v44XFnN3FloJvNePqj6cBG2" || c.user_uid === "nsU1v44XFnN3FloJvNePqj6cBG2") {
    playbackIdVal = "051fkj9ynhu2qk6";
    livepeerStreamIdVal = "1bd59085-a056-431c-96d9-2dcbe8b0919f";
    streamKeyVal = "051f-k58u-670m-ydfj";
    isLiveVal = Boolean(c.is_live);
  }

  const channelData = {
    channel_id: c.channel_id,
    user_uid: c.user_uid,
    username: c.username,
    display_name: c.display_name,
    photo_url: c.photo_url || "",
    thumbnail_url: c.thumbnail_url || "",
    livepeer_stream_id: livepeerStreamIdVal,
    stream_key: streamKeyVal,
    playback_id: playbackIdVal,
    stream_title: c.stream_title || "",
    category: c.category || "music",
    is_live: isLiveVal,
    viewer_count: c.viewer_count || 0,
    rtmp_url: "rtmp://rtmp.livepeer.com/live",
    playback_url: playbackIdVal ? `https://livepeercdn.studio/hls/${playbackIdVal}/index.m3u8` : "",
    schedule: c.schedule || [],
    schedule_json: JSON.stringify(c.schedule || []),
    last_updated: new Date().toISOString(),
  };

  if (admin && admin.apps && admin.apps.length) {
    try {
      const dbFs = admin.firestore();
      const batch = dbFs.batch();

      if (c.channel_id && c.channel_id !== "undefined" && c.channel_id !== "null") {
        batch.set(dbFs.collection("channels").doc(c.channel_id), channelData, { merge: true });
      }
      if (c.username && c.username !== "undefined" && c.username !== "null") {
        batch.set(dbFs.collection("channels").doc(c.username.toLowerCase()), channelData, { merge: true });
      }
      if (c.user_uid && c.user_uid !== "undefined" && c.user_uid !== "null") {
        batch.set(dbFs.collection("users").doc(c.user_uid), {
          ...channelData,
          stream_id: livepeerStreamIdVal,
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
  if (!docId || docId === "undefined" || docId === "null") return;
  const updateFields: any = {
    is_live: isLive,
    isLive: isLive,
    last_updated: timestamp,
  };
  if (playbackId) {
    updateFields.playback_id = playbackId;
    updateFields.playbackId = playbackId;
  }

  if (docId === "djsparkz" || docId === "nsU1v44XFnN3FloJvNePqj6cBG2") {
    updateFields.playback_id = "051fkj9ynhu2qk6";
    updateFields.playbackId = "051fkj9ynhu2qk6";
    updateFields.stream_key = "051f-k58u-670m-ydfj";
    updateFields.streamKey = "051f-k58u-670m-ydfj";
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

async function checkLivepeerStreamIsLive(streamId: string): Promise<boolean> {
  const apiKey = process.env.LIVEPEER_API_KEY;
  if (!apiKey) return false;
  try {
    const res = await fetch(`https://livepeer.studio/api/stream/${streamId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const data = await res.json() as any;
      return !!(data && data.isActive);
    }
  } catch (err) {
    console.error(`[Firestore Sync] Failed to fetch Livepeer stream status for ${streamId}:`, err);
  }
  return false;
}

async function purgeInvalidFirestoreDocuments() {
  if (admin && admin.apps && admin.apps.length) {
    try {
      const dbFs = admin.firestore();
      console.log("[Firestore Sync] Running routine: query and clean up 'channels' collection...");
      const snap = await dbFs.collection("channels").get();
      const deletions: Promise<any>[] = [];

      snap.forEach((doc) => {
        const docId = doc.id;
        const data = doc.data() || {};
        const playbackId = data.playback_id || data.playbackId || "";

        const isUndefinedId = (
          docId === "undefined" ||
          docId === "null" ||
          !docId ||
          docId.toLowerCase() === "undefined" ||
          docId.toLowerCase() === "null"
        );

        const isOmitEmpty = !playbackId || playbackId === "undefined" || playbackId === "null";

        if (isUndefinedId || isOmitEmpty) {
          console.log(`[Firestore Sync] Deleting invalid/stale document: docId="${docId}", playback_id="${playbackId}"`);
          deletions.push(dbFs.collection("channels").doc(docId).delete());
        }
      });

      if (deletions.length > 0) {
        await Promise.all(deletions);
        console.log(`[Firestore Sync] Completed purging ${deletions.length} invalid/stale channels documents.`);
      } else {
        console.log("[Firestore Sync] Clean sweep complete: No invalid channel documents found.");
      }
    } catch (err) {
      console.error("[Firestore Sync] Error during channels collection purge:", err);
    }
  }
}

async function enforceSingleSourceOfTruth() {
  if (admin && admin.apps && admin.apps.length) {
    try {
      const dbFs = admin.firestore();
      console.log("[Firestore Sync] Enforcing single source of truth for core channel 'djsparkz'...");

      // Get accurate Livepeer state for the permanent stream
      const isCurrentlyLive = await checkLivepeerStreamIsLive("1bd59085-a056-431c-96d9-2dcbe8b0919f");
      console.log(`[Firestore Sync] Stream status check for 'djsparkz': is_live = ${isCurrentlyLive}`);

      const djsparkzChannel: ChannelDoc = {
        channel_id: "nsU1v44XFnN3FloJvNePqj6cBG2",
        user_uid: "nsU1v44XFnN3FloJvNePqj6cBG2",
        username: "djsparkz",
        display_name: "djsparkz",
        photo_url: null,
        thumbnail_url: null,
        livepeer_stream_id: "1bd59085-a056-431c-96d9-2dcbe8b0919f",
        stream_key: "051f-k58u-670m-ydfj",
        playback_id: "051fkj9ynhu2qk6",
        stream_title: "djsparkz's Live Stream",
        category: "music",
        is_live: isCurrentlyLive,
        viewer_count: isCurrentlyLive ? 1 : 0,
        record_enabled: true,
        last_updated: new Date().toISOString(),
        created_at: new Date().toISOString(),
        schedule: [],
      };

      db.channels.set(djsparkzChannel.channel_id, djsparkzChannel);
      await syncChannelToFirestore(djsparkzChannel);
      console.log("[Firestore Sync] Core channel 'djsparkz' document overwrote Firestore successfully.");
    } catch (err) {
      console.error("[Firestore Sync] Error enforcing single source of truth on startup:", err);
    }
  }
}

async function restoreChannelsFromFirestore() {
  if (admin && admin.apps && admin.apps.length) {
    try {
      const dbFs = admin.firestore();
      const snap = await dbFs.collection("channels").get();
      snap.forEach((doc) => {
        const docId = doc.id;
        const data = doc.data() as any;
        if (!data) return;

        const isUndefinedId = (
          docId === "undefined" ||
          docId === "null" ||
          docId.toLowerCase() === "undefined" ||
          docId.toLowerCase() === "null"
        );
        if (isUndefinedId) return;

        if ((data.channel_id || data.user_uid) && data.username) {
          const channelId = data.channel_id || data.user_uid;
          if (channelId === "undefined" || channelId === "null" || data.username === "undefined" || data.username === "null") {
            return; // skip orphaned/undefined documents
          }

          let playbackId = data.playback_id || data.playbackId || "";
          let livepeerStreamId = data.livepeer_stream_id || "";
          let streamKey = data.stream_key || "";

          // Clean up and enforce single source of truth on load
          if (data.username && (data.username.toLowerCase() === "djsparkz" || channelId === "nsU1v44XFnN3FloJvNePqj6cBG2" || data.user_uid === "nsU1v44XFnN3FloJvNePqj6cBG2")) {
            playbackId = "051fkj9ynhu2qk6";
            livepeerStreamId = "1bd59085-a056-431c-96d9-2dcbe8b0919f";
            streamKey = "051f-k58u-670m-ydfj";
          }

          const channelObj: ChannelDoc = {
            channel_id: channelId,
            user_uid: data.user_uid || channelId,
            username: data.username,
            display_name: data.display_name || data.username,
            photo_url: data.photo_url || null,
            thumbnail_url: data.thumbnail_url || null,
            livepeer_stream_id: livepeerStreamId,
            stream_key: streamKey,
            playback_id: playbackId,
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

    // Seed permanent djsparkz user and channel data
    const djsparkzUser: UserDoc = {
      uid: "nsU1v44XFnN3FloJvNePqj6cBG2",
      email: "djsparkz@sparkz.tv",
      username: "djsparkz",
      display_name: "djsparkz",
      photo_url: null,
      bio: "Broadcasting live and loud on SPARKZ.TV",
      password_hash: bcrypt.hashSync("password123", 8),
      created_at: now,
      watts: 2500,
    };
    const djsparkzChannel: ChannelDoc = {
      channel_id: "nsU1v44XFnN3FloJvNePqj6cBG2",
      user_uid: "nsU1v44XFnN3FloJvNePqj6cBG2",
      username: "djsparkz",
      display_name: "djsparkz",
      photo_url: null,
      thumbnail_url: null,
      livepeer_stream_id: "1bd59085-a056-431c-96d9-2dcbe8b0919f",
      stream_key: "051f-k58u-670m-ydfj",
      playback_id: "051fkj9ynhu2qk6",
      stream_title: "djsparkz's Live Stream",
      category: "music",
      is_live: false,
      viewer_count: 0,
      record_enabled: true,
      last_updated: now,
      created_at: now,
      schedule: [],
    };

    this.users.set(djsparkzUser.uid, djsparkzUser);
    this.channels.set(djsparkzChannel.channel_id, djsparkzChannel);

    setTimeout(() => {
      syncChannelToFirestore(dnbChannel).catch(() => {});
      syncChannelToFirestore(djsparkzChannel).catch(() => {});
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
  if (!c || c.channel_id === "undefined" || c.channel_id === "null" || c.username === "undefined" || c.username === "null") {
    return {};
  }

  let isLive = Boolean(c.is_live);
  let playbackId = c.playback_id || "";

  if (c.username?.toLowerCase() === "djsparkz" || c.channel_id === "nsU1v44XFnN3FloJvNePqj6cBG2" || c.user_uid === "nsU1v44XFnN3FloJvNePqj6cBG2") {
    isLive = Boolean(c.is_live);
    playbackId = "051fkj9ynhu2qk6";
  }

  const playbackUrl = `https://lvpr.tv/?v=${playbackId}`;
  const out: Record<string, any> = {
    channel_id: c.channel_id,
    user_uid: c.user_uid,
    username: c.username,
    display_name: c.display_name,
    photo_url: c.photo_url,
    thumbnail_url: c.thumbnail_url,
    playback_id: playbackId,
    playbackId: playbackId,
    stream_title: c.stream_title || "",
    category: c.category || "music",
    is_live: isLive,
    isLive: isLive,
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
    if (c.username.toLowerCase() === "djsparkz" || c.channel_id === "nsU1v44XFnN3FloJvNePqj6cBG2" || c.user_uid === "nsU1v44XFnN3FloJvNePqj6cBG2") {
      out.stream_key = c.stream_key || "051f-k58u-670m-ydfj";
      out.rtmp_url = "rtmp://rtmp.livepeer.com/live";
      out.livepeer_stream_id = "1bd59085-a056-431c-96d9-2dcbe8b0919f";
    } else {
      out.stream_key = c.stream_key;
      out.rtmp_url = "rtmp://rtmp.livepeer.com/live";
      out.livepeer_stream_id = c.livepeer_stream_id;
    }
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

  // Intercept and return permanent djsparkz user details
  if (uid === "nsU1v44XFnN3FloJvNePqj6cBG2" || (emailFromToken && emailFromToken.toLowerCase().trim() === "djsparkz@sparkz.tv") || (nameFromToken && nameFromToken.toLowerCase().trim() === "djsparkz")) {
    uid = "nsU1v44XFnN3FloJvNePqj6cBG2";
    let user = db.users.get(uid);
    if (!user) {
      user = {
        uid: "nsU1v44XFnN3FloJvNePqj6cBG2",
        email: "djsparkz@sparkz.tv",
        username: "djsparkz",
        display_name: "djsparkz",
        photo_url: null,
        bio: "Broadcasting live and loud on SPARKZ.TV",
        password_hash: "",
        created_at: new Date().toISOString(),
        watts: 2500,
      };
      db.users.set(uid, user);
    }
    return user;
  }

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
  if (user.username.toLowerCase() === "djsparkz" || user.uid === "nsU1v44XFnN3FloJvNePqj6cBG2") {
    let chan = db.channels.get("nsU1v44XFnN3FloJvNePqj6cBG2");
    if (!chan) {
      chan = {
        channel_id: "nsU1v44XFnN3FloJvNePqj6cBG2",
        user_uid: "nsU1v44XFnN3FloJvNePqj6cBG2",
        username: "djsparkz",
        display_name: "djsparkz",
        photo_url: user.photo_url || null,
        thumbnail_url: null,
        livepeer_stream_id: "1bd59085-a056-431c-96d9-2dcbe8b0919f",
        stream_key: "051f-k58u-670m-ydfj",
        playback_id: "051fkj9ynhu2qk6",
        stream_title: "djsparkz's Live Stream",
        category: "music",
        is_live: false,
        viewer_count: 0,
        record_enabled: true,
        last_updated: new Date().toISOString(),
        created_at: new Date().toISOString(),
        schedule: [],
      };
      db.channels.set(chan.channel_id, chan);
      await syncChannelToFirestore(chan).catch(() => {});
    } else {
      // Force single source of truth for active stream details on any cache/memory read
      if (chan.playback_id !== "051fkj9ynhu2qk6" || chan.livepeer_stream_id !== "1bd59085-a056-431c-96d9-2dcbe8b0919f" || chan.stream_key !== "051f-k58u-670m-ydfj") {
        chan.playback_id = "051fkj9ynhu2qk6";
        chan.livepeer_stream_id = "1bd59085-a056-431c-96d9-2dcbe8b0919f";
        chan.stream_key = "051f-k58u-670m-ydfj";
        db.channels.set(chan.channel_id, chan);
        await syncChannelToFirestore(chan).catch(() => {});
      }
    }
    return chan;
  }

  // 1. DATABASE-FIRST RESOLUTION: When any user accesses their channel or dashboard, the backend MUST query Firestore first under the `channels` collection using their `user_uid`.
  if (admin && admin.apps && admin.apps.length) {
    try {
      const dbFs = admin.firestore();
      
      let doc = null;
      let data = null;

      // Query Firestore first under the `channels` collection using their `user_uid`
      let querySnap = await dbFs.collection("channels").where("user_uid", "==", user.uid).limit(1).get();
      if (!querySnap.empty) {
        doc = querySnap.docs[0];
        data = doc.data();
      }

      // Fallback: Look up by doc ID = user.uid
      if (!data) {
        const directDoc = await dbFs.collection("channels").doc(user.uid).get();
        if (directDoc.exists) {
          doc = directDoc;
          data = directDoc.data();
        }
      }

      // Fallback: Look up by username query
      if (!data && user.username) {
        querySnap = await dbFs.collection("channels").where("username", "==", user.username).limit(1).get();
        if (!querySnap.empty) {
          doc = querySnap.docs[0];
          data = doc.data();
        }
      }

      // Fallback: Look up by doc ID = user.username.toLowerCase()
      if (!data && user.username) {
        const nameDoc = await dbFs.collection("channels").doc(user.username.toLowerCase()).get();
        if (nameDoc.exists) {
          doc = nameDoc;
          data = nameDoc.data();
        }
      }

      if (data) {
        // 2. PREVENT DYNAMIC RE-CREATION: If a document already exists for that user and contains `livepeer_stream_id`, `stream_key`, and `playback_id`, the server MUST load and return those exact stored credentials. It is strictly forbidden to call Livepeer's stream creation endpoint if a record already exists in the database.
        const loadedPlaybackId = data.playback_id || data.playbackId || "";
        const loadedStreamKey = data.stream_key || data.streamKey || "";
        const loadedStreamId = data.livepeer_stream_id || data.stream_id || data.streamId || "";

        console.log(`[Firestore First] Found existing channel record in Firestore for user ${user.username} (UID: ${user.uid}): playback_id="${loadedPlaybackId}", stream_id="${loadedStreamId}"`);
        
        const channelObj: ChannelDoc = {
          channel_id: data.channel_id || (doc ? doc.id : (user.uid || crypto.randomUUID())),
          user_uid: data.user_uid || user.uid,
          username: data.username || user.username,
          display_name: data.display_name || user.display_name || data.username || user.username,
          photo_url: data.photo_url || user.photo_url || null,
          thumbnail_url: data.thumbnail_url || null,
          livepeer_stream_id: loadedStreamId,
          stream_key: loadedStreamKey,
          playback_id: loadedPlaybackId,
          stream_title: data.stream_title || `${data.display_name || user.display_name || user.username}'s Live Stream`,
          category: data.category || "music",
          is_live: Boolean(data.is_live ?? data.isLive ?? false),
          viewer_count: typeof data.viewer_count === "number" ? data.viewer_count : 0,
          record_enabled: Boolean(data.record_enabled ?? data.recordEnabled ?? true),
          schedule: data.schedule || [],
          last_updated: data.last_updated || new Date().toISOString(),
          created_at: data.created_at || new Date().toISOString(),
        };

        db.channels.set(channelObj.channel_id, channelObj);
        return channelObj;
      }
    } catch (fsErr) {
      console.error("[getOrRestoreUserChannel] Failed to perform Firestore-first lookup:", fsErr);
    }
  }

  // Fallback to memory cache ONLY if Firestore failed or is not available
  for (const c of db.channels.values()) {
    if (c.user_uid === user.uid || (c.username && c.username.toLowerCase() === user.username.toLowerCase())) {
      console.log(`[getOrRestoreUserChannel] Found existing in-memory channel for user ${user.username} (UID: ${user.uid}) after Firestore lookup fallback.`);
      return c;
    }
  }

  // 3. ON-DEMAND PROVISIONING FOR NEW USERS: Only if a user has zero records in Firestore should the backend call Livepeer to create a new stream, immediately saving the resulting `livepeer_stream_id`, `stream_key`, and `playback_id` to their Firestore channel document so it remains permanently locked from then on.
  console.log(`[getOrRestoreUserChannel] No existing stream record in memory or Firestore for user ${user.username}. Provisioning Livepeer stream dynamically...`);
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
  try {
    await purgeInvalidFirestoreDocuments();
    await enforceSingleSourceOfTruth();
  } catch (err) {
    console.error("Failed to run startup database cleanup and enforcement:", err);
  }

  restoreChannelsFromFirestore().catch(() => {});
  restoreEmotesFromFirestore().catch(() => {});

  // Livepeer Webhook Handler
  app.post("/api/livepeer/webhook", async (req, res) => {
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

  // Livepeer Status Check Proxy (prevents browser CORS blocks)
  app.post("/api/livepeer/check-status", async (req, res) => {
    try {
      const { streamId } = req.body;
      const apiKey = process.env.LIVEPEER_API_KEY;
      if (!apiKey) return res.status(500).json({ error: "Livepeer API key not configured" });

      const livepeerRes = await fetch(`https://livepeer.studio/api/stream/${streamId || ""}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await livepeerRes.json();
      return res.json(data);
    } catch (e) {
      return res.status(500).json({ error: "Failed to check Livepeer status" });
    }
  });

  // Direct un-routed dashboard endpoints
  app.get("/api/channels/mine", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const myChannel = await getOrRestoreUserChannel(user);
      const publicData = channelPublic(myChannel, { include_stream_key: true });

      const responsePayload = {
        ...publicData,
        stream_key: publicData.stream_key || myChannel.stream_key || "",
        rtmp_url: publicData.rtmp_url || "rtmp://rtmp.livepeer.com/live",
        playback_id: publicData.playback_id || myChannel.playback_id || "",
        playbackId: publicData.playbackId || myChannel.playback_id || "",
        stream_title: publicData.stream_title || myChannel.stream_title || "",
        category: publicData.category || myChannel.category || "music",
        livepeer_stream_id: publicData.livepeer_stream_id || myChannel.livepeer_stream_id || "",
        is_live: publicData.is_live ?? myChannel.is_live ?? false,
      };

      return res.json(responsePayload);
    } catch (err: any) {
      console.error("[GET /api/channels/mine] Error:", err);
      return res.status(500).json({ error: "Failed to fetch channel" });
    }
  });

  app.patch("/api/channels/mine", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const { stream_title, category, stream_key, playback_id, livepeer_stream_id } = req.body || {};
      const myChannel = await getOrRestoreUserChannel(user);

      if (stream_title !== undefined) myChannel.stream_title = String(stream_title);
      if (category !== undefined) myChannel.category = String(category);
      if (stream_key !== undefined) myChannel.stream_key = String(stream_key);
      if (playback_id !== undefined) {
        myChannel.playback_id = String(playback_id);
      }
      if (livepeer_stream_id !== undefined) myChannel.livepeer_stream_id = String(livepeer_stream_id);
      myChannel.last_updated = new Date().toISOString();

      db.channels.set(myChannel.channel_id, myChannel);
      await syncChannelToFirestore(myChannel).catch(() => {});

      const publicData = channelPublic(myChannel, { include_stream_key: true });
      const responsePayload = {
        ...publicData,
        stream_key: publicData.stream_key || myChannel.stream_key || "",
        rtmp_url: publicData.rtmp_url || "rtmp://rtmp.livepeer.com/live",
        playback_id: publicData.playback_id || myChannel.playback_id || "",
        playbackId: publicData.playbackId || myChannel.playback_id || "",
        stream_title: publicData.stream_title || myChannel.stream_title || "",
        category: publicData.category || myChannel.category || "music",
        livepeer_stream_id: publicData.livepeer_stream_id || myChannel.livepeer_stream_id || "",
        is_live: publicData.is_live ?? myChannel.is_live ?? false,
      };

      return res.json(responsePayload);
    } catch (err: any) {
      console.error("[PATCH /api/channels/mine] Error:", err);
      return res.status(500).json({ error: "Failed to update channel" });
    }
  });

  const api = express.Router();

  // Geolocation endpoint using freeipapi.com (server-side, avoiding CORS issues)
  app.get("/api/geolocation", async (req, res) => {
    try {
      let ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "";
      if (ip.includes(",")) {
        ip = ip.split(",")[0].trim();
      }
      
      const url = ip && ip !== "::1" && ip !== "127.0.0.1"
        ? `https://freeipapi.com/api/json/${ip}`
        : "https://freeipapi.com/api/json";

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`freeipapi returned ${response.status}`);
      }
      const data = await response.json();
      return res.json(data);
    } catch (e: any) {
      console.error("Error in server-side geolocation:", e.message);
      return res.json({
        ipAddress: "127.0.0.1",
        countryCode: "US",
        countryName: "United States",
        regionName: "California",
        cityName: "San Francisco",
        zipCode: "94105",
        timeZone: "America/Los_Angeles",
      });
    }
  });

  // Get channel by username
  api.get("/channels/:username", async (req, res) => {
    const uname = req.params.username.toLowerCase();

    let found: ChannelDoc | null = null;
    for (const c of db.channels.values()) {
      if (c.username.toLowerCase() === uname || c.channel_id.toLowerCase() === uname || c.user_uid === uname) {
        found = c;
        break;
      }
    }

    if (!found) {
      if (uname === "djsparkz" || uname === "nsu1v44xfnn3flojvnepqj6cbg2") {
        const stubChannel: ChannelDoc = {
          channel_id: "nsU1v44XFnN3FloJvNePqj6cBG2",
          user_uid: "nsU1v44XFnN3FloJvNePqj6cBG2",
          username: "djsparkz",
          display_name: "djsparkz",
          photo_url: null,
          thumbnail_url: null,
          livepeer_stream_id: "1bd59085-a056-431c-96d9-2dcbe8b0919f",
          stream_key: "051f-k58u-670m-ydfj",
          playback_id: "051fkj9ynhu2qk6",
          stream_title: "djsparkz's Live Stream",
          category: "music",
          is_live: true,
          viewer_count: 1,
          record_enabled: true,
          last_updated: new Date().toISOString(),
          created_at: new Date().toISOString(),
          schedule: [],
        };
        db.channels.set(stubChannel.channel_id, stubChannel);
        return res.json(channelPublic(stubChannel));
      }
      return res.status(404).json({ error: "Channel not found" });
    }

    res.json(channelPublic(found));
  });

  // GET all channels
  api.get("/channels", async (req, res) => {
    try {
      const channelsList = Array.from(db.channels.values()).map((c) =>
        channelPublic(c)
      );
      return res.json(channelsList);
    } catch (err) {
      return res.status(500).json({ error: "Failed to list channels" });
    }
  });

  // GET messages for a channel
  api.get("/channels/:username/messages", async (req, res) => {
    try {
      const { username } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      const filtered = db.chatMessages.filter(
        (m) => m.channel_username?.toLowerCase() === username.toLowerCase()
      );
      const msgs = filtered.slice(-limit);
      return res.json(msgs);
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch messages" });
    }
  });

  // GET emotes for a channel
  api.get("/channels/:username/emotes", async (req, res) => {
    try {
      const { username } = req.params;
      const filtered = db.emotes.filter(
        (e) => e.channel_username === "global" || e.channel_username?.toLowerCase() === username.toLowerCase()
      );
      return res.json({ emotes: filtered });
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch emotes" });
    }
  });

  // POST emotes to a channel
  api.post("/channels/mine/emotes", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const { code, name, image_url } = req.body || {};
      
      const newEmote: EmoteDoc = {
        id: crypto.randomUUID(),
        channel_username: user.username,
        code: code || "",
        name: name || "",
        image_url: image_url || "",
        created_at: new Date().toISOString(),
      };

      db.emotes.push(newEmote);
      if (admin && admin.apps && admin.apps.length) {
        try {
          const dbFs = admin.firestore();
          await dbFs.collection("emotes").doc(newEmote.id).set(newEmote);
        } catch {}
      }
      return res.json(newEmote);
    } catch (err) {
      return res.status(500).json({ error: "Failed to create emote" });
    }
  });

  // DELETE emotes from a channel
  api.delete("/channels/mine/emotes/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const index = db.emotes.findIndex((e) => e.id === id);
      if (index !== -1) {
        db.emotes.splice(index, 1);
        if (admin && admin.apps && admin.apps.length) {
          try {
            const dbFs = admin.firestore();
            await dbFs.collection("emotes").doc(id).delete();
          } catch {}
        }
      }
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: "Failed to delete emote" });
    }
  });

  // GET user Watts
  api.get("/users/me/watts", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const u = db.users.get(user.uid);
      return res.json({ watts: u ? u.watts || 0 : 0 });
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch watts" });
    }
  });

  // POST Watts ping
  api.post("/channels/:username/watts/ping", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const u = db.users.get(user.uid);
      if (!u) {
        return res.status(404).json({ error: "User not found" });
      }
      
      const accrued = 15;
      u.watts = (u.watts || 0) + accrued;
      db.users.set(user.uid, u);
      
      if (admin && admin.apps && admin.apps.length) {
        try {
          const dbFs = admin.firestore();
          await dbFs.collection("users").doc(user.uid).set({ watts: u.watts }, { merge: true });
        } catch {}
      }
      return res.json({ watts: u.watts, accrued });
    } catch (err) {
      return res.status(500).json({ error: "Failed to ping watts" });
    }
  });

  // POST Stream create/get
  api.post("/stream/create", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const myChannel = await getOrRestoreUserChannel(user);
      return res.json(channelPublic(myChannel, { include_stream_key: true }));
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to create/get stream" });
    }
  });

  // POST livepeer streams mockup (dashboard fallback)
  api.post("/livepeer/streams", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const myChannel = await getOrRestoreUserChannel(user);
      return res.json({ id: myChannel.livepeer_stream_id, streamKey: myChannel.stream_key, playbackId: myChannel.playback_id });
    } catch (err) {
      return res.status(500).json({ error: "Failed to mock stream" });
    }
  });

  // GET User profile
  api.get("/users/me", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const u = db.users.get(user.uid);
      return res.json(u || user);
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch profile" });
    }
  });

  // PATCH User profile
  api.patch("/users/me", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const u = db.users.get(user.uid);
      if (!u) return res.status(404).json({ error: "User not found" });

      const { display_name, bio } = req.body || {};
      if (display_name !== undefined) u.display_name = String(display_name);
      if (bio !== undefined) u.bio = String(bio);

      db.users.set(user.uid, u);
      
      for (const [cid, c] of db.channels.entries()) {
        if (c.user_uid === user.uid) {
          if (display_name !== undefined) c.display_name = String(display_name);
          db.channels.set(cid, c);
          await syncChannelToFirestore(c).catch(() => {});
        }
      }
      return res.json(u);
    } catch (err) {
      return res.status(500).json({ error: "Failed to update profile" });
    }
  });

  // PUT / POST User profile fallbacks
  api.put("/users/me", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const u = db.users.get(user.uid);
      if (!u) return res.status(404).json({ error: "User not found" });
      const { display_name, bio } = req.body || {};
      if (display_name !== undefined) u.display_name = String(display_name);
      if (bio !== undefined) u.bio = String(bio);
      db.users.set(user.uid, u);
      return res.json(u);
    } catch {
      return res.status(500).json({ error: "Failed to put profile" });
    }
  });

  api.post("/users/me", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const u = db.users.get(user.uid);
      if (!u) return res.status(404).json({ error: "User not found" });
      const { display_name, bio } = req.body || {};
      if (display_name !== undefined) u.display_name = String(display_name);
      if (bio !== undefined) u.bio = String(bio);
      db.users.set(user.uid, u);
      return res.json(u);
    } catch {
      return res.status(500).json({ error: "Failed to post profile" });
    }
  });

  // POST User photo
  api.post("/users/me/photo", requireAuth, upload.single("file"), async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const u = db.users.get(user.uid);
      if (!u) return res.status(404).json({ error: "User not found" });

      let filename = "";
      if (req.file) {
        filename = req.file.filename;
      } else {
        const { image, photo, file, filename: originalFilename } = req.body || {};
        const base64Str = image || photo || file;
        if (base64Str) {
          filename = saveBase64File(base64Str, originalFilename || "photo.jpg");
        }
      }

      if (!filename) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const fileUrl = getFileUrl(req, filename);
      u.photo_url = fileUrl;
      db.users.set(user.uid, u);

      for (const [cid, c] of db.channels.entries()) {
        if (c.user_uid === user.uid) {
          c.photo_url = fileUrl;
          db.channels.set(cid, c);
          await syncChannelToFirestore(c).catch(() => {});
        }
      }

      // Sync to Firestore user document
      if (admin && admin.apps && admin.apps.length) {
        try {
          const dbFs = admin.firestore();
          await dbFs.collection("users").doc(user.uid).set({ photo_url: fileUrl }, { merge: true });
        } catch (fsErr) {
          console.error("Failed to sync user photo to Firestore users collection:", fsErr);
        }
      }

      // Return user with multiple url mappings to support any frontend expectation
      return res.json({
        ...u,
        photo_url: fileUrl,
        url: fileUrl,
        avatar_url: fileUrl,
      });
    } catch (err: any) {
      console.error("[POST /users/me/photo] Error:", err);
      return res.status(500).json({ error: "Failed to update photo: " + err.message });
    }
  });

  // POST channel thumbnail update
  api.post("/channels/mine/thumbnail", requireAuth, upload.single("file"), async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const myChannel = await getOrRestoreUserChannel(user);

      let filename = "";
      if (req.file) {
        filename = req.file.filename;
      } else {
        const { image, thumbnail, file, filename: originalFilename } = req.body || {};
        const base64Str = image || thumbnail || file;
        if (base64Str) {
          filename = saveBase64File(base64Str, originalFilename || "thumbnail.jpg");
        }
      }

      if (!filename) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const fileUrl = getFileUrl(req, filename);
      myChannel.thumbnail_url = fileUrl;
      db.channels.set(myChannel.channel_id, myChannel);
      await syncChannelToFirestore(myChannel).catch(() => {});

      // Sync to Firestore user document
      if (admin && admin.apps && admin.apps.length) {
        try {
          const dbFs = admin.firestore();
          await dbFs.collection("users").doc(user.uid).set({ thumbnail_url: fileUrl }, { merge: true });
        } catch (fsErr) {
          console.error("Failed to sync channel thumbnail to Firestore users collection:", fsErr);
        }
      }

      const channelObj = channelPublic(myChannel, { include_stream_key: true });
      return res.json({
        ...channelObj,
        thumbnail_url: fileUrl,
        url: fileUrl,
      });
    } catch (err: any) {
      console.error("[POST /channels/mine/thumbnail] Error:", err);
      return res.status(500).json({ error: "Failed to update thumbnail: " + err.message });
    }
  });

  // DELETE channel thumbnail
  api.delete("/channels/mine/thumbnail", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const myChannel = await getOrRestoreUserChannel(user);
      myChannel.thumbnail_url = null;
      db.channels.set(myChannel.channel_id, myChannel);
      await syncChannelToFirestore(myChannel).catch(() => {});
      return res.json(channelPublic(myChannel, { include_stream_key: true }));
    } catch (err) {
      return res.status(500).json({ error: "Failed to delete thumbnail" });
    }
  });

  // POST channel schedule
  api.post("/channels/mine/schedule", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const { schedule } = req.body || {};
      const myChannel = await getOrRestoreUserChannel(user);
      myChannel.schedule = schedule || [];
      db.channels.set(myChannel.channel_id, myChannel);
      await syncChannelToFirestore(myChannel).catch(() => {});
      return res.json(channelPublic(myChannel, { include_stream_key: true }));
    } catch (err) {
      return res.status(500).json({ error: "Failed to update schedule" });
    }
  });

  // GET channel sessions
  api.get("/channels/:username/sessions", async (req, res) => {
    try {
      const { username } = req.params;
      const filtered = db.sessions.filter((s) => s.channel_username.toLowerCase() === username.toLowerCase());
      return res.json(filtered);
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch sessions" });
    }
  });

  // POST sessions refresh mockup
  api.post("/channels/mine/sessions/refresh", requireAuth, async (req, res) => {
    return res.json({ success: true, sessions: [] });
  });

  // GET Stories
  api.get("/stories", async (req, res) => {
    try {
      return res.json(db.stories);
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch stories" });
    }
  });

  // POST Stories
  api.post("/stories", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const { media_url, media_type, caption } = req.body || {};
      
      const newStory: StoryDoc = {
        id: crypto.randomUUID(),
        user_uid: user.uid,
        username: user.username,
        display_name: user.display_name,
        user_photo_url: user.photo_url,
        media_url: media_url || "",
        media_type: media_type || "image",
        caption: caption || "",
        created_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };

      db.stories.push(newStory);
      return res.json(newStory);
    } catch (err) {
      return res.status(500).json({ error: "Failed to create story" });
    }
  });

  // DELETE Stories
  api.delete("/stories/:id", requireAuth, async (req, res) => {
    try {
      const { id } = req.params;
      const index = db.stories.findIndex((s) => s.id === id);
      if (index !== -1) {
        db.stories.splice(index, 1);
      }
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: "Failed to delete story" });
    }
  });

  // GET Notifications
  api.get("/notifications", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const filtered = db.notifications.filter((n) => n.user_uid === user.uid);
      return res.json(filtered);
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch notifications" });
    }
  });

  // POST Mark Notifications read
  api.post("/notifications/mark-read", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      db.notifications.forEach((n) => {
        if (n.user_uid === user.uid) {
          n.read = true;
        }
      });
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: "Failed to mark notifications read" });
    }
  });

  // POST Follow
  api.post("/channels/:username/follow", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const { username } = req.params;
      
      const followObj: FollowDoc = {
        follower_uid: user.uid,
        follower_username: user.username,
        channel_username: username,
        channel_user_uid: "",
        created_at: new Date().toISOString(),
      };

      if (!db.follows.some((f) => f.follower_uid === user.uid && f.channel_username.toLowerCase() === username.toLowerCase())) {
        db.follows.push(followObj);
      }
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: "Failed to follow" });
    }
  });

  // DELETE Follow
  api.delete("/channels/:username/follow", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const { username } = req.params;
      
      db.follows = db.follows.filter(
        (f) => !(f.follower_uid === user.uid && f.channel_username.toLowerCase() === username.toLowerCase())
      );
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: "Failed to unfollow" });
    }
  });

  // GET User's followed channels
  api.get("/users/mine/following", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const followed = db.follows.filter((f) => f.follower_uid === user.uid);
      return res.json({ following: followed });
    } catch (err) {
      return res.status(500).json({ error: "Failed to fetch followed channels" });
    }
  });

  // POST Subscribe
  api.post("/channels/:username/subscribe", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const { username } = req.params;
      
      const subObj: SubscriptionDoc = {
        subscriber_uid: user.uid,
        subscriber_username: user.username,
        channel_username: username,
        channel_user_uid: "",
        tier: "tier_1",
        created_at: new Date().toISOString(),
      };

      if (!db.subscriptions.some((s) => s.subscriber_uid === user.uid && s.channel_username.toLowerCase() === username.toLowerCase())) {
        db.subscriptions.push(subObj);
      }
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: "Failed to subscribe" });
    }
  });

  // DELETE Subscribe
  api.delete("/channels/:username/subscribe", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const { username } = req.params;
      
      db.subscriptions = db.subscriptions.filter(
        (s) => !(s.subscriber_uid === user.uid && s.channel_username.toLowerCase() === username.toLowerCase())
      );
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: "Failed to unsubscribe" });
    }
  });

  // POST increment channel view count
  api.post("/channels/:username/view", async (req, res) => {
    try {
      const { username } = req.params;
      for (const [cid, c] of db.channels.entries()) {
        if (c.username.toLowerCase() === username.toLowerCase()) {
          c.viewer_count = (c.viewer_count || 0) + 1;
          db.channels.set(cid, c);
          break;
        }
      }
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: "Failed to register view" });
    }
  });

  // POST Upload
  api.post("/upload", upload.single("file"), async (req, res) => {
    try {
      let filename = "";
      if (req.file) {
        filename = req.file.filename;
      } else {
        const { file, image, dataUrl, filename: originalFilename } = req.body || {};
        const base64Str = file || image || dataUrl;
        if (base64Str) {
          filename = saveBase64File(base64Str, originalFilename || "upload.mp3");
        }
      }

      if (!filename) {
        return res.status(400).json({ error: "No file uploaded or provided" });
      }

      const fileUrl = getFileUrl(req, filename);
      console.log(`[Upload] File successfully uploaded. Saved as ${filename}. URL: ${fileUrl}`);
      return res.json({ url: fileUrl, filename });
    } catch (err: any) {
      console.error("[Upload] Error handling upload:", err);
      return res.status(500).json({ error: "Upload failed: " + err.message });
    }
  });

  api.use("/files", express.static(path.join(process.cwd(), "uploads")));

  app.use("/api", api);

  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  if (!process.env.VERCEL) {
    const server = http.createServer(app);

    // Set up WebSocket server for live chat
    const wss = new WebSocketServer({ noServer: true });
    const channelsMap = new Map<string, Set<WebSocket>>();

    server.on("upgrade", (request, socket, head) => {
      try {
        const pathname = request.url ? new URL(request.url, "http://localhost").pathname : "";
        console.log(`[WS UPGRADE] Path: ${pathname}, URL: ${request.url}`);
        if (pathname.startsWith("/api/ws/chat/")) {
          wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit("connection", ws, request);
          });
        } else {
          socket.destroy();
        }
      } catch (err) {
        console.error("[WS UPGRADE] Error parsing upgrade URL:", err);
        socket.destroy();
      }
    });

    wss.on("connection", async (ws: WebSocket, request) => {
      try {
        const urlObj = new URL(request.url || "", "http://localhost");
        const pathname = urlObj.pathname;
        const parts = pathname.split("/");
        const channelUsername = decodeURIComponent(parts[parts.length - 1] || "");
        
        const token = urlObj.searchParams.get("token") || "";
        const guestName = urlObj.searchParams.get("guest_name") || "Guest";

        let user: UserDoc | null = await findUserByToken(token);
        
        let username = "Guest";
        let displayName = "Guest";
        let uid = "guest-" + crypto.randomUUID().slice(0, 8);
        let photoUrl = null;
        let badges: string[] = ["guest"];
        let userColor = "#a1a1aa";

        if (user) {
          username = user.username;
          displayName = user.display_name || user.username;
          uid = user.uid;
          photoUrl = user.photo_url;
          badges = [];
          
          if (username.toLowerCase() === "djsparkz" || uid === "nsU1v44XFnN3FloJvNePqj6cBG2") {
            badges.push("broadcaster");
            userColor = "#e5ff00";
          } else {
            badges.push("supporter");
            userColor = "#38bdf8";
          }
        } else if (guestName) {
          displayName = guestName;
          username = guestName.toLowerCase().replace(/\s+/g, "_");
        }

        console.log(`WebSocket connected: ${displayName} (@${username}) to channel: ${channelUsername}`);

        if (!channelsMap.has(channelUsername.toLowerCase())) {
          channelsMap.set(channelUsername.toLowerCase(), new Set());
        }
        channelsMap.get(channelUsername.toLowerCase())!.add(ws);

        ws.send(JSON.stringify({
          type: "system",
          message: `Connected to ${channelUsername}'s live chat!`,
        }));

        ws.on("message", async (messageStr) => {
          try {
            const data = JSON.parse(messageStr.toString());
            
            if (data.type === "typing") {
              const clients = channelsMap.get(channelUsername.toLowerCase());
              if (clients) {
                const typingPayload = JSON.stringify({
                  type: "typing",
                  uid,
                  username,
                  display_name: displayName,
                  is_typing: Boolean(data.is_typing),
                });
                for (const client of clients) {
                  if (client !== ws && client.readyState === WebSocket.OPEN) {
                    client.send(typingPayload);
                  }
                }
              }
            } else {
              const text = data.text || "";
              if (!text.trim()) return;

              const isHighlighted = Boolean(data.is_highlighted);
              const msgObj: ChatMessageDoc = {
                id: crypto.randomUUID(),
                channel_username: channelUsername,
                text,
                sender_uid: uid,
                sender_username: username,
                sender_display_name: displayName,
                sender_photo_url: photoUrl,
                created_at: new Date().toISOString(),
                is_highlighted: isHighlighted,
                highlight_type: isHighlighted ? "neon_glow" : null,
                sender_badges: badges,
                sender_color: userColor,
              };

              db.chatMessages.push(msgObj);
              if (db.chatMessages.length > 500) {
                db.chatMessages.shift();
              }

              if (admin && admin.apps && admin.apps.length) {
                try {
                  const dbFs = admin.firestore();
                  await dbFs.collection("chat_messages").doc(msgObj.id).set(msgObj);
                } catch {}
              }

              const clients = channelsMap.get(channelUsername.toLowerCase());
              if (clients) {
                const messagePayload = JSON.stringify({
                  type: "message",
                  ...msgObj,
                });
                for (const client of clients) {
                  if (client.readyState === WebSocket.OPEN) {
                    client.send(messagePayload);
                  }
                }
              }
            }
          } catch (err) {
            console.error("Error processing WebSocket message:", err);
          }
        });

        ws.on("close", () => {
          const clients = channelsMap.get(channelUsername.toLowerCase());
          if (clients) {
            clients.delete(ws);
            if (clients.size === 0) {
              channelsMap.delete(channelUsername.toLowerCase());
            }
          }
          console.log(`WebSocket disconnected: ${displayName} from channel: ${channelUsername}`);
        });

        ws.on("error", (err) => {
          console.error("WebSocket client error:", err);
        });

      } catch (err) {
        console.error("Error establishing WebSocket connection:", err);
        ws.close();
      }
    });

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

export const setupPromise = startServer().catch((err) => {
  console.error("Failed to start server:", err);
});