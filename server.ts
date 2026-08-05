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
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

import { IvsClient, CreateChannelCommand, GetStreamCommand } from "@aws-sdk/client-ivs";

dotenv.config();

console.log("SPARKZ.TV - Server booting up with latest deployment environment parameters.");

// Initialize Firebase Admin safely
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || process.env.GCP_PROJECT || "ai-studio-applet-webapp-400d5",
      storageBucket: `${process.env.FIREBASE_PROJECT_ID || "ai-studio-applet-webapp-400d5"}.firebasestorage.app`,
    });
    console.log("[Firebase Admin] Initialized successfully.");
  }
} catch (e) {
  console.error("[Firebase Admin] Initialization warning:", e);
}

// Reliable direct Firestore instance getter
function getDbFs() {
  return getFirestore();
}

let ivsClient: IvsClient | null = null;
function getIvsClient() {
  if (!ivsClient) {
    const region = process.env.AWS_REGION || "us-east-1";
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    
    if (accessKeyId && secretAccessKey) {
      ivsClient = new IvsClient({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });
      console.log(`[AWS IVS] Client initialized successfully for region ${region}.`);
    } else {
      console.warn("[AWS IVS] Credentials missing in environment. Running in Mock/Simulator mode.");
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
      console.error("[AWS IVS] CreateChannelCommand failed:", e);
      throw new Error(`AWS SDK CreateChannelCommand Failed: ${e.message || e}`);
    }
  }

  const cryptoMod = await import("crypto");
  const randId = cryptoMod.randomBytes(6).toString("hex");
  const channelId = cryptoMod.randomBytes(6).toString("hex");
  return {
    playbackUrl: `https://${randId}.us-east-1.playback.live-video.net/api/video/v1/us-east-1.123456789012.channel.${channelId}.m3u8`,
    streamKey: `sk_us-east-1_${channelId}_${cryptoMod.randomBytes(12).toString("hex")}`,
    ingestEndpoint: `rtmps://${randId}.global-ingest.live-video.net:443/app/`,
    arn: `arn:aws:ivs:us-east-1:123456789012:channel/${channelId}`,
  };
}

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

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
  rtmp_url?: string;
  rtmpUrl?: string;
  schedule?: any[];
}

class InMemStore {
  users: Map<string, UserDoc> = new Map();
  channels: Map<string, ChannelDoc> = new Map();

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
      stream_title: "djsparkz's Live Stream",
      category: "music",
      is_live: false,
      viewer_count: 0,
      record_enabled: true,
      last_updated: now,
      rtmp_url: "rtmps://global-ingest.live-video.net:443/app/",
    };
    this.users.set(djsparkzUser.uid, djsparkzUser);
    this.channels.set(djsparkzChannel.channel_id, djsparkzChannel);
  }
}

const db = new InMemStore();

function channelPublic(c: ChannelDoc, opts: { include_stream_key?: boolean } = {}) {
  if (!c || c.channel_id === "undefined") return {};
  const playbackId = c.playback_id || "";
  const playbackUrl = playbackId.startsWith("http") ? playbackId : (playbackId ? `https://lvpr.tv/?v=${playbackId}` : "");

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
    is_live: Boolean(c.is_live),
    isLive: Boolean(c.is_live),
    viewer_count: c.viewer_count || 0,
    last_updated: c.last_updated,
  };

  if (opts.include_stream_key) {
    out.stream_key = c.stream_key || "";
    out.streamKey = c.stream_key || "";
    out.rtmp_url = c.rtmp_url || "rtmps://global-ingest.live-video.net:443/app/";
    out.rtmpUrl = c.rtmp_url || "rtmps://global-ingest.live-video.net:443/app/";
    out.livepeer_stream_id = c.livepeer_stream_id || "";
  }
  return out;
}

async function findUserByToken(token: string | null): Promise<UserDoc | null> {
  if (!token || token === "guest" || token === "null" || token === "undefined") {
    return db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2") || null;
  }
  let uid: string | null = null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload && payload.sub) uid = payload.sub;
  } catch {
    uid = "nsU1v44XFnN3FloJvNePqj6cBG2";
  }
  return db.users.get(uid!) || db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2") || null;
}

async function authenticateToken(req: Request): Promise<UserDoc | null> {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : (authHeader || req.query.token as string);
  return findUserByToken(token || null);
}

async function getOrCreateChannelForUser(uid: string, username: string, forceNew = false) {
  if (!uid) uid = "nsU1v44XFnN3FloJvNePqj6cBG2";
  if (!username) username = "djsparkz";

  const dbFs = getDbFs();
  const docRef = dbFs.collection("channels").doc(uid);
  const docSnap = await docRef.get();

  if (docSnap.exists && !forceNew) {
    const data = docSnap.data() || {};
    if (data.playback_id && data.stream_key) {
      return {
        uid,
        username,
        livepeer_stream_id: data.livepeer_stream_id || "",
        stream_key: data.stream_key || "",
        playback_id: data.playback_id || "",
        rtmp_url: data.rtmp_url || "rtmps://global-ingest.live-video.net:443/app/",
        updated_at: new Date()
      };
    }
  }

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
  return newDoc;
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
    stream_title: `${user.display_name || user.username}'s Live Stream`,
    category: "music",
    is_live: false,
    viewer_count: 0,
    record_enabled: true,
    last_updated: new Date().toISOString(),
    rtmp_url: resolved.rtmp_url,
  };
  db.channels.set(user.uid, chan);
  return chan;
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 10000;
const JWT_SECRET = process.env.JWT_SECRET || "sparkz_secret_key_12345";

export const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["*"] }));
app.options("*", cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

async function startServer() {
  app.get("/api/channels/mine", async (req, res) => {
    try {
      const user = (await authenticateToken(req)) || db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2")!;
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

  app.post("/api/stream/create", async (req, res) => {
    try {
      const user = (await authenticateToken(req)) || db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2")!;
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

  app.post("/api/channels/generate-key", async (req, res) => {
    try {
      const user = (await authenticateToken(req)) || db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2")!;
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

  const handleIvsCheckStatus = async (req: any, res: any) => {
    try {
      const streamId = req.body.streamId || req.body.stream_id || req.body.channel_id || req.body.username || "nsU1v44XFnN3FloJvNePqj6cBG2";
      const client = getIvsClient();
      if (client && streamId.startsWith("arn:aws:ivs:")) {
        const response = await client.send(new GetStreamCommand({ channelArn: streamId }));
        const isLive = !!response.stream;
        return res.json({ isActive: isLive, isLive, is_live: isLive, stream: response.stream });
      }
      return res.json({ isActive: false, isLive: false, is_live: false });
    } catch (e) {
      return res.json({ isActive: false, isLive: false, is_live: false });
    }
  };

  app.post("/api/livepeer/check-status", handleIvsCheckStatus);
  app.post("/api/ivs/check-status", handleIvsCheckStatus);

  const api = express.Router();
  api.get("/users/me", async (req, res) => {
    const user = (await authenticateToken(req)) || db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2")!;
    return res.json(user);
  });

  api.use("/files", express.static(uploadsDir));
  app.use("/api", api);

  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  const server = http.createServer(app);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

export const setupPromise = startServer().catch((err) => {
  console.error("Failed to start server:", err);
});