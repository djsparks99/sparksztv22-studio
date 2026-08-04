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
import admin from "firebase-admin";

import { IvsClient, CreateChannelCommand } from "@aws-sdk/client-ivs";

dotenv.config();

console.log("SPARKZ.TV - Server booting up with latest deployment environment parameters.");

let ivsClient: IvsClient | null = null;
function getIvsClient() {
  if (!ivsClient) {
    const region = process.env.AWS_REGION || "us-east-1";
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    
    if (accessKeyId && secretAccessKey) {
      ivsClient = new IvsClient({
        region,
        credentials: {
          accessKeyId,
          secretAccessKey,
        },
      });
      console.log(`[AWS IVS] Client initialized successfully for region ${region}.`);
    } else {
      console.warn("[AWS IVS] Credentials missing in environment (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY). Running in Mock/Simulator mode.");
    }
  }
  return ivsClient;
}

async function createIvsChannel(name: string): Promise<{
  playbackUrl: string;
  streamKey: string;
  ingestEndpoint: string;
  arn: string;
}> {
  const client = getIvsClient();
  if (client) {
    try {
      console.log(`[AWS IVS] Calling CreateChannelCommand for stream name "${name}"...`);
      const command = new CreateChannelCommand({
        name: name.replace(/[^a-zA-Z0-9-_]/g, "-"),
        latencyMode: "LOW",
        type: "STANDARD",
      });
      const response = await client.send(command);
      const playbackUrl = response.channel?.playbackUrl || "";
      const streamKey = response.streamKey?.value || "";
      const ingestEndpoint = response.channel?.ingestEndpoint || "rtmps://global-ingest.live-video.net:443/app/";
      const arn = response.channel?.arn || "";
      
      if (playbackUrl && streamKey) {
        console.log(`[AWS IVS] Channel created successfully on AWS! playbackUrl=${playbackUrl}`);
        return { playbackUrl, streamKey, ingestEndpoint, arn };
      }
    } catch (e: any) {
      console.error("[AWS IVS] CreateChannelCommand failed. Propagating error to routing controller.", e);
      throw new Error(`AWS SDK CreateChannelCommand Failed (Verify IAM Permissions, Credentials, Region): ${e.message || e}`);
    }
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    console.log("[AWS IVS] No credentials provided, proceeding with secure simulator fallback.");
    const crypto = await import("crypto");
    const randId = crypto.randomBytes(6).toString("hex");
    const channelId = crypto.randomBytes(6).toString("hex");
    return {
      playbackUrl: `https://${randId}.us-east-1.playback.live-video.net/api/video/v1/us-east-1.123456789012.channel.${channelId}.m3u8`,
      streamKey: `sk_us-east-1_${channelId}_${crypto.randomBytes(12).toString("hex")}`,
      ingestEndpoint: `rtmps://${randId}.global-ingest.live-video.net:443/app/`,
      arn: `arn:aws:ivs:us-east-1:123456789012:channel/${channelId}`,
    };
  } else {
    throw new Error("AWS Access Keys are defined but IvsClient failed to initialize or authenticate.");
  }
}

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
    fileSize: 100 * 1024 * 1024,
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

async function syncChannelToFirestore(c: ChannelDoc) {
  if (!c) return;

  if (admin && admin.apps && admin.apps.length) {
    try {
      const dbFs = admin.firestore();
      const uid = c.user_uid || c.channel_id;
      if (uid && uid !== "undefined" && uid !== "null") {
        const strictChannelDoc = {
          uid: uid,
          username: c.username || "",
          livepeer_stream_id: c.livepeer_stream_id || "",
          stream_key: c.stream_key || "",
          playback_id: c.playback_id || "",
          playback_url: c.playback_url || c.playback_id || "",
          playbackUrl: c.playbackUrl || c.playback_id || "",
          streamKey: c.streamKey || c.stream_key || "",
          rtmp_url: c.rtmp_url || "rtmps://global-ingest.live-video.net:443/app/",
          rtmpUrl: c.rtmpUrl || "rtmps://global-ingest.live-video.net:443/app/",
          updated_at: new Date()
        };
        await dbFs.collection("channels").doc(uid).set(strictChannelDoc, { merge: true });
        console.log(`[syncChannelToFirestore] Strictly synchronized channels document for user UID: ${uid}`);
      }
    } catch (err) {
      console.error("[syncChannelToFirestore] Error syncing strict channels document:", err);
    }
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

  if (admin && admin.apps && admin.apps.length) {
    try {
      const dbFs = admin.firestore();
      const docRef = dbFs.collection("channels").doc(docId);
      try {
        await docRef.update(updateFields);
      } catch {
        await docRef.set(updateFields, { merge: true });
      }

      if (docId === "nsU1v44XFnN3FloJvNePqj6cBG2" || docId === "djsparkz") {
        const otherId = docId === "djsparkz" ? "nsU1v44XFnN3FloJvNePqj6cBG2" : "djsparkz";
        const otherRef = dbFs.collection("channels").doc(otherId);
        try {
          await otherRef.update(updateFields);
        } catch {
          await otherRef.set(updateFields, { merge: true });
        }
      }
    } catch (adminErr) {}
  }
}

async function checkLivepeerStreamIsLive(streamId: string): Promise<boolean> {
  const targetArn = streamId.startsWith("arn:aws:ivs:") 
    ? streamId 
    : "";
  
  if (!targetArn) return false;

  const client = getIvsClient();
  if (client) {
    try {
      const { GetStreamCommand } = await import("@aws-sdk/client-ivs");
      const response = await client.send(new GetStreamCommand({ channelArn: targetArn }));
      return !!response.stream;
    } catch (ivsErr: any) {
      console.log(`[AWS IVS checkLivepeerStreamIsLive] offline/error for ${targetArn}: ${ivsErr.name || ivsErr.message}`);
      return false;
    }
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

      const djsparkzChannel: ChannelDoc = {
        channel_id: "nsU1v44XFnN3FloJvNePqj6cBG2",
        user_uid: "nsU1v44XFnN3FloJvNePqj6cBG2",
        username: "djsparkz",
        display_name: "djsparkz",
        photo_url: null,
        thumbnail_url: null,
        livepeer_stream_id: "",
        stream_key: "",
        playback_id: "",
        playback_url: "",
        playbackUrl: "",
        streamKey: "",
        rtmp_url: "rtmps://global-ingest.live-video.net:443/app/",
        rtmpUrl: "rtmps://global-ingest.live-video.net:443/app/",
        stream_title: "djsparkz's Live Stream",
        category: "music",
        is_live: false,
        viewer_count: 0,
        record_enabled: true,
        last_updated: new Date().toISOString(),
        created_at: new Date().toISOString(),
        schedule: [],
      };

      db.channels.set(djsparkzChannel.channel_id, djsparkzChannel);
      await syncChannelToFirestore(djsparkzChannel);
      console.log("[Firestore Sync] Core channel 'djsparkz' initialized successfully.");
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
            return;
          }

          const channelObj: ChannelDoc = {
            channel_id: channelId,
            user_uid: data.user_uid || channelId,
            username: data.username,
            display_name: data.display_name || data.username,
            photo_url: data.photo_url || null,
            thumbnail_url: data.thumbnail_url || null,
            livepeer_stream_id: data.livepeer_stream_id || "",
            stream_key: data.stream_key || "",
            playback_id: data.playback_id || data.playbackUrl || "",
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
  created_at?: string;
  schedule?: ScheduleItem[];
  playback_url?: string;
  playbackUrl?: string;
  streamKey?: string;
  rtmp_url?: string;
  rtmpUrl?: string;
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
      livepeer_stream_id: "",
      stream_key: "",
      playback_id: "",
      playback_url: "",
      playbackUrl: "",
      streamKey: "",
      rtmp_url: "rtmps://global-ingest.live-video.net:443/app/",
      rtmpUrl: "rtmps://global-ingest.live-video.net:443/app/",
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
  let playbackUrl = playbackId.startsWith("http") ? playbackId : (playbackId ? `https://lvpr.tv/?v=${playbackId}` : "");

  const out: Record<string, any> = {
    channel_id: c.channel_id,
    user_uid: c.user_uid,
    username: c.username,
    display_name: c.display_name,
    photo_url: c.photo_url,
    thumbnail_url: c.thumbnail_url,
    playback_id: playbackId,
    playbackId: playbackId,
    playback_url: playbackUrl,
    playbackUrl: playbackUrl,
    stream_title: c.stream_title || "",
    category: c.category || "music",
    is_live: isLive,
    isLive: isLive,
    viewer_count: opts.viewer_count_override !== undefined ? opts.viewer_count_override : c.viewer_count,
    last_updated: c.last_updated,
    stream_started_at: c.stream_started_at,
    stream_ended_at: c.stream_ended_at,
    record_enabled: c.record_enabled ?? true,
    schedule: c.schedule || [],
  };

  if (opts.follower_count !== undefined) out.follower_count = opts.follower_count;
  if (opts.is_following !== undefined) out.is_following = opts.is_following;
  if (opts.subscriber_count !== undefined) out.subscriber_count = opts.subscriber_count;
  if (opts.is_subscribed !== undefined) out.is_subscribed = opts.is_subscribed;

  if (opts.include_stream_key) {
    out.stream_key = c.stream_key || "";
    out.streamKey = c.stream_key || "";
    out.rtmp_url = c.rtmp_url || "rtmps://global-ingest.live-video.net:443/app/";
    out.rtmpUrl = c.rtmpUrl || "rtmps://global-ingest.live-video.net:443/app/";
    out.livepeer_stream_id = c.livepeer_stream_id || "";
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

async function getOrCreateChannelForUser(uid: string, username: string, forceNew = false): Promise<{
  uid: string;
  username: string;
  livepeer_stream_id: string;
  stream_key: string;
  playback_id: string;
  playback_url?: string;
  playbackUrl?: string;
  streamKey?: string;
  rtmp_url?: string;
  rtmpUrl?: string;
  updated_at: Date;
}> {
  if (!uid) throw new Error("UID is required");

  let dbFs;
  try {
    dbFs = admin.firestore();
  } catch (fsInitErr: any) {
    throw new Error(`Firebase Firestore Initialization Failed: ${fsInitErr.message || fsInitErr}`);
  }

  let docRef = dbFs.collection("channels").doc(uid);
  let docSnap;
  try {
    docSnap = await docRef.get();
  } catch (dbGetErr: any) {
    throw new Error(`Firestore Database Read Failed for UID "${uid}": ${dbGetErr.message || dbGetErr}`);
  }

  if (docSnap.exists && !forceNew) {
    const data = docSnap.data() || {};
    let streamId = data.livepeer_stream_id || data.arn || "";
    let streamKey = data.stream_key || data.streamKey || "";
    let playbackId = data.playback_id || data.playbackUrl || data.playback_url || "";
    let rtmpUrl = data.rtmp_url || data.rtmpUrl || "rtmps://global-ingest.live-video.net:443/app/";

    if (!playbackId || !streamKey || forceNew) {
      console.log(`[AWS IVS] Provisioning Amazon IVS channel for ${username}...`);
      const ivsData = await createIvsChannel(username);
      streamId = ivsData.arn;
      streamKey = ivsData.streamKey;
      playbackId = ivsData.playbackUrl;
      rtmpUrl = ivsData.ingestEndpoint;

      await docRef.set({
        uid,
        username,
        livepeer_stream_id: streamId,
        stream_key: streamKey,
        playback_id: playbackId,
        playback_url: playbackId,
        playbackUrl: playbackId,
        streamKey,
        rtmp_url: rtmpUrl,
        rtmpUrl,
        updated_at: new Date()
      }, { merge: true });
    }

    return {
      uid: data.uid || uid,
      username: data.username || username,
      livepeer_stream_id: streamId,
      stream_key: streamKey,
      playback_id: playbackId,
      playback_url: playbackId,
      playbackUrl: playbackId,
      streamKey: streamKey,
      rtmp_url: rtmpUrl,
      rtmpUrl: rtmpUrl,
      updated_at: new Date()
    };
  } else {
    console.log(`[AWS IVS Create] Provisioning new Amazon IVS channel for user: ${username} (UID: ${uid})`);
    const ivsData = await createIvsChannel(username);

    const newDoc = {
      uid,
      username,
      livepeer_stream_id: ivsData.arn,
      stream_key: ivsData.streamKey,
      playback_id: ivsData.playbackUrl,
      playback_url: ivsData.playbackUrl,
      playbackUrl: ivsData.playbackUrl,
      streamKey: ivsData.streamKey,
      rtmp_url: ivsData.ingestEndpoint,
      rtmpUrl: ivsData.ingestEndpoint,
      updated_at: new Date()
    };

    await docRef.set(newDoc, { merge: true });
    return {
      ...newDoc,
      updated_at: new Date()
    };
  }
}

async function getOrResolveChannelPlaybackId(channel: ChannelDoc): Promise<ChannelDoc> {
  const resolved = await getOrCreateChannelForUser(channel.user_uid || channel.channel_id, channel.username);
  channel.livepeer_stream_id = resolved.livepeer_stream_id;
  channel.stream_key = resolved.stream_key;
  channel.playback_id = resolved.playback_id;
  channel.playback_url = resolved.playback_url;
  channel.playbackUrl = resolved.playbackUrl;
  channel.streamKey = resolved.streamKey;
  channel.rtmp_url = resolved.rtmp_url;
  channel.rtmpUrl = resolved.rtmpUrl;
  channel.last_updated = resolved.updated_at.toISOString();
  db.channels.set(channel.channel_id, channel);
  return channel;
}

async function getOrRestoreUserChannel(user: UserDoc): Promise<ChannelDoc> {
  const resolved = await getOrCreateChannelForUser(user.uid, user.username);

  const chan: ChannelDoc = {
    channel_id: user.uid,
    user_uid: user.uid,
    username: user.username,
    display_name: user.display_name || user.username,
    photo_url: user.photo_url || null,
    thumbnail_url: null,
    livepeer_stream_id: resolved.livepeer_stream_id,
    stream_key: resolved.stream_key,
    playback_id: resolved.playback_id,
    playback_url: resolved.playback_url,
    playbackUrl: resolved.playbackUrl,
    streamKey: resolved.streamKey,
    rtmp_url: resolved.rtmp_url,
    rtmpUrl: resolved.rtmpUrl,
    stream_title: `${user.display_name || user.username}'s Live Stream`,
    category: "music",
    is_live: false,
    viewer_count: 0,
    record_enabled: true,
    last_updated: resolved.updated_at.toISOString(),
    created_at: new Date().toISOString(),
    schedule: [],
  };

  db.channels.set(user.uid, chan);
  return chan;
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

  const handleIvsWebhook = async (req: any, res: any) => {
    try {
      const event = req.body;
      console.log("Amazon IVS Webhook Event Received:", JSON.stringify(event));

      let action: "start" | "end" | null = null;
      let channelArn = "";
      let streamId = "";

      if (event && event["detail-type"] === "IVS Channel State Change") {
        const detail = event.detail || {};
        const eventName = detail["event_name"];
        channelArn = detail["channel_arn"] || "";
        streamId = detail["stream_id"] || "";
        if (eventName === "Session Started") {
          action = "start";
        } else if (eventName === "Session Ended") {
          action = "end";
        }
      }

      if (action && (channelArn || streamId)) {
        const timestamp = new Date().toISOString();
        for (const [id, channel] of db.channels.entries()) {
          const isMatch = 
            channel.livepeer_stream_id === channelArn || 
            channel.livepeer_stream_id === streamId ||
            channel.playback_id === channelArn ||
            channel.playback_id === streamId;

          if (isMatch) {
            channel.is_live = action === "start";
            if (action === "start") {
              channel.stream_started_at = timestamp;
            } else {
              channel.stream_ended_at = timestamp;
            }
            channel.last_updated = timestamp;
            db.channels.set(id, channel);
            await updateFirestoreChannelLiveStatus(id, action === "start", timestamp);
          }
        }
      }

      return res.status(200).json({ received: true });
    } catch (err) {
      console.error("IVS Webhook processing error:", err);
      return res.status(200).json({ received: false });
    }
  };

  app.post("/api/livepeer/webhook", handleIvsWebhook);
  app.post("/api/ivs/webhook", handleIvsWebhook);

  const handleIvsCheckStatus = async (req: any, res: any) => {
    try {
      const streamId = req.body.streamId || req.body.stream_id || req.body.channel_id || req.body.username;
      let targetStreamId = streamId || "";

      const client = getIvsClient();
      if (client && targetStreamId && targetStreamId.startsWith("arn:aws:ivs:")) {
        try {
          const { GetStreamCommand } = await import("@aws-sdk/client-ivs");
          const response = await client.send(new GetStreamCommand({ channelArn: targetStreamId }));
          const isLive = !!response.stream;
          return res.json({ isActive: isLive, isLive: isLive, is_live: isLive, stream: response.stream });
        } catch (ivsErr: any) {
          return res.json({ isActive: false, isLive: false, is_live: false });
        }
      }

      return res.json({ isActive: false, isLive: false, is_live: false });
    } catch (e) {
      return res.status(200).json({ isActive: false, isLive: false, is_live: false });
    }
  };

  app.post("/api/livepeer/check-status", handleIvsCheckStatus);
  app.post("/api/ivs/check-status", handleIvsCheckStatus);

  app.get("/api/channels/mine", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const channel = await getOrCreateChannelForUser(user.uid, user.username);
      const myChannel = await getOrRestoreUserChannel(user);

      const publicData = channelPublic(myChannel, { include_stream_key: true });

      return res.json({
        ...publicData,
        stream_key: channel.stream_key,
        playback_id: channel.playback_id,
        livepeer_stream_id: channel.livepeer_stream_id,
        playback_url: channel.playback_id,
        playbackUrl: channel.playback_id,
        rtmp_url: channel.rtmp_url || "rtmps://global-ingest.live-video.net:443/app/",
        rtmpUrl: channel.rtmp_url || "rtmps://global-ingest.live-video.net:443/app/",
      });
    } catch (err: any) {
      console.error("[GET /api/channels/mine] Error:", err);
      return res.status(500).json({ error: "Failed to fetch channel", details: err.message });
    }
  });

  async function resolveChannelByIdentifier(req: Request, paramValue?: string): Promise<ChannelDoc> {
    const mapToChannelDoc = (data: any, identifier: string): ChannelDoc => {
      const uid = data.uid || data.channel_id || identifier;
      const username = data.username || identifier;
      return {
        channel_id: uid,
        user_uid: uid,
        username: username,
        display_name: data.display_name || username,
        photo_url: data.photo_url || null,
        thumbnail_url: data.thumbnail_url || null,
        livepeer_stream_id: data.livepeer_stream_id || "",
        stream_key: data.stream_key || "",
        playback_id: data.playback_id || data.playbackUrl || "",
        playback_url: data.playback_url || data.playback_id || "",
        playbackUrl: data.playback_url || data.playback_id || "",
        rtmp_url: data.rtmp_url || "rtmps://global-ingest.live-video.net:443/app/",
        rtmpUrl: data.rtmp_url || "rtmps://global-ingest.live-video.net:443/app/",
        streamKey: data.stream_key || "",
        stream_title: data.stream_title || `${username}'s Live Stream`,
        category: data.category || "music",
        is_live: Boolean(data.is_live ?? false),
        viewer_count: typeof data.viewer_count === "number" ? data.viewer_count : 0,
        record_enabled: Boolean(data.record_enabled ?? true),
        schedule: data.schedule || [],
        last_updated: new Date().toISOString(),
      };
    };

    if (paramValue && admin && admin.apps && admin.apps.length) {
      try {
        const dbFs = admin.firestore();
        const docSnap = await dbFs.collection("channels").doc(paramValue).get();
        if (docSnap.exists) {
          return mapToChannelDoc(docSnap.data(), paramValue);
        }
      } catch (e) {}
    }

    const firstChan = Array.from(db.channels.values())[0];
    if (firstChan) return firstChan;

    return {
      channel_id: "nsU1v44XFnN3FloJvNePqj6cBG2",
      user_uid: "nsU1v44XFnN3FloJvNePqj6cBG2",
      username: "djsparkz",
      display_name: "djsparkz",
      photo_url: null,
      thumbnail_url: null,
      livepeer_stream_id: "",
      stream_key: "",
      playback_id: "",
      playback_url: "",
      playbackUrl: "",
      streamKey: "",
      rtmp_url: "rtmps://global-ingest.live-video.net:443/app/",
      rtmpUrl: "rtmps://global-ingest.live-video.net:443/app/",
      stream_title: "djsparkz's Live Stream",
      category: "music",
      is_live: false,
      viewer_count: 0,
      record_enabled: true,
      last_updated: new Date().toISOString(),
      schedule: [],
    };
  }

  const api = express.Router();

  api.get("/geolocation", async (req, res) => {
    return res.json({
      ipAddress: "127.0.0.1",
      countryCode: "GB",
      countryName: "United Kingdom",
      regionName: "London",
      cityName: "London",
      zipCode: "E17",
      timeZone: "Europe/London",
    });
  });

  api.get("/channels", async (req, res) => {
    try {
      const channelsList = [];
      for (const c of db.channels.values()) {
        channelsList.push(channelPublic(c));
      }
      return res.json(channelsList);
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to list channels", message: err.message });
    }
  });

  api.post("/stream/create", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const forceNew = req.body?.forceNew === true;
      const channel = await getOrCreateChannelForUser(user.uid, user.username, forceNew);

      return res.json({
        stream_key: channel.stream_key,
        playback_id: channel.playback_id,
        livepeer_stream_id: channel.livepeer_stream_id,
        playback_url: channel.playback_id,
        playbackUrl: channel.playback_id,
        streamKey: channel.stream_key,
        rtmp_url: channel.rtmp_url || "rtmps://global-ingest.live-video.net:443/app/",
        rtmpUrl: channel.rtmp_url || "rtmps://global-ingest.live-video.net:443/app/",
      });
    } catch (err: any) {
      console.error("[POST /api/stream/create] Error:", err);
      return res.status(500).json({ error: "Failed to create/get stream", details: err.message });
    }
  });

  api.post("/channels/generate-key", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const channel = await getOrCreateChannelForUser(user.uid, user.username, true);

      return res.json({
        stream_key: channel.stream_key,
        playback_id: channel.playback_id,
        livepeer_stream_id: channel.livepeer_stream_id,
        playback_url: channel.playback_id,
        playbackUrl: channel.playback_id,
        streamKey: channel.stream_key,
        rtmp_url: channel.rtmp_url || "rtmps://global-ingest.live-video.net:443/app/",
        rtmpUrl: channel.rtmp_url || "rtmps://global-ingest.live-video.net:443/app/",
      });
    } catch (err: any) {
      console.error("[POST /api/channels/generate-key] Error:", err);
      return res.status(500).json({ error: "Failed to regenerate stream key", details: err.message });
    }
  });

  api.get("/users/me", requireAuth, async (req, res) => {
    const user = (req as any).user as UserDoc;
    return res.json(db.users.get(user.uid) || user);
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
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);
    });
  }
}

export const setupPromise = startServer().catch((err) => {
  console.error("Failed to start server:", err);
});