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

import { 
  IvsClient, 
  CreateChannelCommand, 
  GetStreamCommand, 
  ListChannelsCommand, 
  ListStreamKeysCommand 
} from "@aws-sdk/client-ivs";

dotenv.config();

console.log("SPARKZ.TV - Server booting up with live AWS IVS sync.");

try {
  if (!admin.apps || admin.apps.length === 0) {
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || "ai-studio-applet-webapp-400d5",
    });
  }
} catch (e: any) {}

let ivsClient: IvsClient | null = null;
function getIvsClient() {
  if (!ivsClient) {
    const region = process.env.AWS_REGION || "eu-west-1";
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    
    if (accessKeyId && secretAccessKey) {
      ivsClient = new IvsClient({
        region,
        credentials: { accessKeyId, secretAccessKey },
      });
      console.log(`[AWS IVS] Client initialized successfully for region ${region}.`);
    }
  }
  return ivsClient;
}

async function getOrCreateIvsChannelDetails(username: string): Promise<{
  playbackUrl: string;
  streamKey: string;
  ingestEndpoint: string;
  arn: string;
}> {
  const client = getIvsClient();
  const safeName = username.replace(/[^a-zA-Z0-9-_]/g, "-");

  if (client) {
    try {
      // 1. Check if channel already exists in AWS to avoid recreating duplicates
      const listCmd = new ListChannelsCommand({});
      const listRes = await client.send(listCmd);
      const existingChannel = listRes.channels?.find(c => c.name === safeName);

      let channelArn = existingChannel?.arn;
      let playbackUrl = existingChannel?.playbackUrl;
      let ingestEndpoint = existingChannel?.ingestEndpoint || "rtmps://global-contribute.live-video.net:443/app/";

      if (!channelArn) {
        console.log(`[AWS IVS] Creating new channel for "${safeName}"...`);
        const createCmd = new CreateChannelCommand({
          name: safeName,
          latencyMode: "LOW",
          type: "STANDARD",
        });
        const createRes = await client.send(createCmd);
        channelArn = createRes.channel?.arn;
        playbackUrl = createRes.channel?.playbackUrl;
        ingestEndpoint = createRes.channel?.ingestEndpoint || ingestEndpoint;
      }

      if (channelArn) {
        // 2. Fetch the actual active stream key for this channel from AWS
        const keysCmd = new ListStreamKeysCommand({ channelArn });
        const keysRes = await client.send(keysCmd);
        let streamKeyVal = "";

        if (keysRes.streamKeys && keysRes.streamKeys.length > 0) {
          const keySummary = keysRes.streamKeys[0];
          // If we only have the summary ARN, we use it or query it, but ListStreamKeys returns summaries
          // Let's grab the stream key value using GetStreamKey if needed, or use summary value if present
          streamKeyVal = keySummary.arn || "";
        }

        // To get the actual secret stream key string value from AWS IVS:
        if (keysRes.streamKeys && keysRes.streamKeys.length > 0) {
          const { GetStreamKeyCommand } = await import("@aws-sdk/client-ivs");
          const getKeyDetail = await client.send(new GetStreamKeyCommand({ arn: keysRes.streamKeys[0].arn }));
          streamKeyVal = getKeyDetail.streamKey?.value || "";
        }

        if (playbackUrl && streamKeyVal) {
          console.log("[AWS IVS] Successfully synced live channel credentials from AWS.");
          return {
            playbackUrl,
            streamKey: streamKeyVal,
            ingestEndpoint: `rtmps://${ingestEndpoint.replace(/^rtmps?:\/\//, "").replace(/\/app\/?$/, "")}/app/`,
            arn: channelArn,
          };
        }
      }
    } catch (e: any) {
      console.warn("[AWS IVS API Error]:", e.message || e);
    }
  }

  // Fallback simulator if AWS call fails
  const hash = crypto.createHash("md5").update(username).digest("hex");
  return {
    playbackUrl: `https://${hash.substring(0, 12)}.eu-west-1.playback.live-video.net/api/video/v1/eu-west-1.123456789012.channel.${hash.substring(12, 24)}.m3u8`,
    streamKey: `sk_eu-west-1_${username}_fallbackkey`,
    ingestEndpoint: "rtmps://global-contribute.live-video.net:443/app/",
    arn: `arn:aws:ivs:eu-west-1:123456789012:channel/${username}`,
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
  ivs_channel_arn: string;
  stream_key: string;
  playback_id: string;
  stream_title: string;
  category: string;
  is_live: boolean;
  viewer_count: number;
  record_enabled: boolean;
  last_updated: string;
  rtmp_url?: string;
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
    this.users.set(djsparkzUser.uid, djsparkzUser);
  }
}

const db = new InMemStore();

function channelPublic(c: ChannelDoc, opts: { include_stream_key?: boolean } = {}) {
  if (!c || c.channel_id === "undefined") return {};
  const playbackId = c.playback_id || "";

  const out: Record<string, any> = {
    channel_id: c.channel_id,
    user_uid: c.user_uid,
    username: c.username,
    display_name: c.display_name,
    photo_url: c.photo_url,
    thumbnail_url: c.thumbnail_url,
    playback_id: playbackId,
    playbackUrl: playbackId,
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
    out.rtmp_url = c.rtmp_url || "rtmps://global-contribute.live-video.net:443/app/";
    out.ivs_channel_arn = c.ivs_channel_arn || "";
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

  let existing = db.channels.get(uid);
  if (existing && !forceNew && existing.stream_key && !existing.stream_key.includes("fallback")) {
    return {
      uid,
      username,
      ivs_channel_arn: existing.ivs_channel_arn,
      stream_key: existing.stream_key,
      playback_id: existing.playback_id,
      rtmp_url: existing.rtmp_url || "rtmps://global-contribute.live-video.net:443/app/",
    };
  }

  const ivsData = await getOrCreateIvsChannelDetails(username);
  const newChan: ChannelDoc = {
    channel_id: uid,
    user_uid: uid,
    username,
    display_name: username,
    photo_url: null,
    thumbnail_url: null,
    ivs_channel_arn: ivsData.arn,
    stream_key: ivsData.streamKey,
    playback_id: ivsData.playbackUrl,
    stream_title: `${username}'s Live Stream`,
    category: "music",
    is_live: false,
    viewer_count: 0,
    record_enabled: true,
    last_updated: new Date().toISOString(),
    rtmp_url: ivsData.ingestEndpoint,
  };
  db.channels.set(uid, newChan);

  return {
    uid,
    username,
    ivs_channel_arn: ivsData.arn,
    stream_key: ivsData.streamKey,
    playback_id: ivsData.playbackUrl,
    rtmp_url: ivsData.ingestEndpoint,
  };
}

async function getOrRestoreUserChannel(user: UserDoc): Promise<ChannelDoc> {
  await getOrCreateChannelForUser(user.uid, user.username);
  return db.channels.get(user.uid)!;
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
        ivs_channel_arn: channel.ivs_channel_arn,
        playbackUrl: channel.playback_id,
        rtmp_url: channel.rtmp_url || "rtmps://global-contribute.live-video.net:443/app/",
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
        ivs_channel_arn: channel.ivs_channel_arn,
        playbackUrl: channel.playback_id,
        streamKey: channel.stream_key,
        rtmp_url: channel.rtmp_url || "rtmps://global-contribute.live-video.net:443/app/",
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
        ivs_channel_arn: channel.ivs_channel_arn,
        playbackUrl: channel.playback_id,
        streamKey: channel.stream_key,
        rtmp_url: channel.rtmp_url || "rtmps://global-contribute.live-video.net:443/app/",
      });
    } catch (err: any) {
      console.error("[POST /api/channels/generate-key] Error:", err);
      return res.status(500).json({ error: "Failed to regenerate stream key", details: err.message });
    }
  });

  app.post("/api/ivs/check-status", async (req, res) => {
    try {
      const user = db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2");
      const chan = db.channels.get(user?.uid || "");
      const client = getIvsClient();
      if (client && chan?.ivs_channel_arn) {
        const response = await client.send(new GetStreamCommand({ channelArn: chan.ivs_channel_arn }));
        const isLive = !!response.stream;
        return res.json({ isActive: isLive, isLive, is_live: isLive, stream: response.stream });
      }
      return res.json({ isActive: false, isLive: false, is_live: false });
    } catch (e) {
      return res.json({ isActive: false, isLive: false, is_live: false });
    }
  });

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