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
import admin from "firebase-admin";

import { 
  IvsClient, 
  CreateChannelCommand, 
  ListChannelsCommand,
  GetStreamKeyCommand,
  ListStreamKeysCommand,
  GetStreamCommand 
} from "@aws-sdk/client-ivs";

dotenv.config();

console.log("SPARKZ.TV - Server booting up with unified channel mapping.");

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

async function getOrCreatePersistentIvsChannel(username: string): Promise<{
  playbackUrl: string;
  streamKey: string;
  ingestEndpoint: string;
  arn: string;
}> {
  const client = getIvsClient();
  const safeName = `sparkz-${username}`;

  if (client) {
    try {
      const listCmd = new ListChannelsCommand({ filterByName: safeName });
      const listRes = await client.send(listCmd);
      
      if (listRes.channels && listRes.channels.length > 0) {
        const existingSummary = listRes.channels[0];
        const arn = existingSummary.arn;
        
        const keysRes = await client.send(new ListStreamKeysCommand({ channelArn: arn }));
        let streamKeyVal = "";
        
        if (keysRes.streamKeys && keysRes.streamKeys.length > 0) {
          const keyDetail = await client.send(new GetStreamKeyCommand({ arn: keysRes.streamKeys[0].arn }));
          streamKeyVal = keyDetail.streamKey?.value || "";
        }

        if (existingSummary.playbackUrl && streamKeyVal) {
          return {
            playbackUrl: existingSummary.playbackUrl,
            streamKey: streamKeyVal,
            ingestEndpoint: `rtmps://${(existingSummary.ingestEndpoint || "global-contribute.live-video.net").replace(/^rtmps?:\/\//, "").replace(/\/app\/?$/, "")}/app/`,
            arn: arn!,
          };
        }
      }
    } catch (e: any) {
      console.warn(`[AWS IVS Channel Lookup Error]: ${e.message || e}`);
    }

    try {
      const createCmd = new CreateChannelCommand({
        name: safeName,
        latencyMode: "LOW",
        type: "STANDARD",
      });
      const createRes = await client.send(createCmd);
      
      const channelArn = createRes.channel?.arn || "";
      const playbackUrl = createRes.channel?.playbackUrl || "";
      const streamKeyVal = createRes.streamKey?.value || "";
      const ingestEndpoint = createRes.channel?.ingestEndpoint || "global-contribute.live-video.net";

      if (playbackUrl && streamKeyVal) {
        return {
          playbackUrl,
          streamKey: streamKeyVal,
          ingestEndpoint: `rtmps://${ingestEndpoint.replace(/^rtmps?:\/\//, "").replace(/\/app\/?$/, "")}/app/`,
          arn: channelArn,
        };
      }
    } catch (e: any) {
      console.warn(`[AWS IVS Channel Creation Error]: ${e.message || e}`);
    }
  }

  // Gracefully fallback instead of crashing server if AWS IVS is not configured or fails
  console.warn(`[AWS IVS Fallback] AWS IVS not available or not configured. Using fallback demo stream for ${username}.`);
  return {
    playbackUrl: "https://fcc3ed1611b0.us-east-1.playback.live-video.net/api/video/v1/us-east-1.907205459387.channel.mndhuZg197Y6.m3u8",
    streamKey: "fallback-stream-key-djsparkz-123456",
    ingestEndpoint: "rtmps://global-contribute.live-video.net:443/app/",
    arn: `arn:aws:ivs:eu-west-1:123456789012:channel/mock-sparkz-${username}`,
  };
}

const uploadsDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 },
});

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
    channel_id: "djsparkz",
    user_uid: "nsU1v44XFnN3FloJvNePqj6cBG2",
    username: "djsparkz",
    display_name: "djsparkz",
    photo_url: c.photo_url,
    thumbnail_url: c.thumbnail_url,
    playback_id: playbackId,
    playbackUrl: playbackId,
    stream_title: c.stream_title || "djsparkz Live Stream",
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
  return db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2") || null;
}

async function authenticateToken(req: Request): Promise<UserDoc | null> {
  return db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2") || null;
}

async function getMasterChannel() {
  let chan = db.channels.get("djsparkz") || db.channels.get("nsU1v44XFnN3FloJvNePqj6cBG2");
  if (!chan) {
    const ivsData = await getOrCreatePersistentIvsChannel("djsparkz");
    chan = {
      channel_id: "djsparkz",
      user_uid: "nsU1v44XFnN3FloJvNePqj6cBG2",
      username: "djsparkz",
      display_name: "djsparkz",
      photo_url: db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2")?.photo_url || null,
      thumbnail_url: null,
      ivs_channel_arn: ivsData.arn,
      stream_key: ivsData.streamKey,
      playback_id: ivsData.playbackUrl,
      stream_title: "djsparkz's Live Stream",
      category: "music",
      is_live: false,
      viewer_count: 0,
      record_enabled: true,
      last_updated: new Date().toISOString(),
      rtmp_url: ivsData.ingestEndpoint,
    };
    db.channels.set("djsparkz", chan);
    db.channels.set("nsU1v44XFnN3FloJvNePqj6cBG2", chan);
  }
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
  db.channels.clear();
  await getMasterChannel();

  app.get("/api/channels/mine", async (req, res) => {
    try {
      const channel = await getMasterChannel();
      const publicData = channelPublic(channel, { include_stream_key: true });
      return res.json({
        ...publicData,
        username: "djsparkz",
        display_name: "djsparkz",
        stream_key: channel.stream_key,
        playback_id: channel.playback_id,
        ivs_channel_arn: channel.ivs_channel_arn,
        playbackUrl: channel.playback_id,
        rtmp_url: channel.rtmp_url || "rtmps://global-contribute.live-video.net:443/app/",
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch channel", details: err.message });
    }
  });

  app.get("/api/channels", async (req, res) => {
    try {
      const channel = await getMasterChannel();
      return res.json([channelPublic(channel)]);
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to list channels" });
    }
  });

  // Handle individual channel lookups by name/ID (e.g., /api/channels/djsparkz or /api/channels/nsU1v44XFnN3FloJvNePqj6cBG2)
  app.get("/api/channels/:id", async (req, res) => {
    try {
      const channel = await getMasterChannel();
      return res.json(channelPublic(channel, { include_stream_key: true }));
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to fetch channel" });
    }
  });

  app.post("/api/stream/create", async (req, res) => {
    try {
      const channel = await getMasterChannel();
      return res.json({
        stream_key: channel.stream_key,
        playback_id: channel.playback_id,
        ivs_channel_arn: channel.ivs_channel_arn,
        playbackUrl: channel.playback_id,
        streamKey: channel.stream_key,
        rtmp_url: channel.rtmp_url || "rtmps://global-contribute.live-video.net:443/app/",
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to create/get stream", details: err.message });
    }
  });

  app.post("/api/channels/generate-key", async (req, res) => {
    try {
      const ivsData = await getOrCreatePersistentIvsChannel("djsparkz");
      const channel = await getMasterChannel();
      channel.stream_key = ivsData.streamKey;
      channel.playback_id = ivsData.playbackUrl;
      channel.ivs_channel_arn = ivsData.arn;

      return res.json({
        stream_key: channel.stream_key,
        playback_id: channel.playback_id,
        ivs_channel_arn: channel.ivs_channel_arn,
        playbackUrl: channel.playback_id,
        streamKey: channel.stream_key,
        rtmp_url: channel.rtmp_url || "rtmps://global-contribute.live-video.net:443/app/",
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to regenerate stream key", details: err.message });
    }
  });

  app.post("/api/ivs/check-status", async (req, res) => {
    try {
      const channel = await getMasterChannel();
      const client = getIvsClient();
      
      if (client && channel?.ivs_channel_arn) {
        const response = await client.send(new GetStreamCommand({ channelArn: channel.ivs_channel_arn }));
        const isLive = !!response.stream;
        channel.is_live = isLive;
        return res.json({ isActive: isLive, isLive, is_live: isLive, stream: response.stream });
      }
      
      channel.is_live = false;
      return res.json({ isActive: false, isLive: false, is_live: false });
    } catch (e) {
      return res.json({ isActive: false, isLive: false, is_live: false });
    }
  });

  const api = express.Router();
  
  api.get("/users/me", async (req, res) => {
    const user = db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2")!;
    return res.json({
      ...user,
      username: "djsparkz",
      display_name: "djsparkz",
    });
  });

  const handlePhotoUpload = async (req: Request, res: Response) => {
    try {
      const user = db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2")!;
      let photoUrl = user.photo_url;

      if (req.file) {
        photoUrl = `/api/files/${req.file.filename}`;
      } else if (req.body?.photo_url || req.body?.photoUrl || req.body?.photo) {
        photoUrl = req.body.photo_url || req.body.photoUrl || req.body.photo;
      }

      user.photo_url = photoUrl;
      const channel = await getMasterChannel();
      channel.photo_url = photoUrl;

      return res.json({
        success: true,
        photo_url: photoUrl,
        photoUrl: photoUrl,
        user: {
          ...user,
          username: "djsparkz",
          display_name: "djsparkz",
          photo_url: photoUrl,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to update profile photo", details: err.message });
    }
  };

  api.post("/users/me/photo", upload.single("photo"), handlePhotoUpload);
  api.put("/users/me/photo", upload.single("photo"), handlePhotoUpload);

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