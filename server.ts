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
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { WebSocketServer, WebSocket as WSWebSocket } from "ws";

import { 
  IvsClient, 
  CreateChannelCommand, 
  ListChannelsCommand,
  GetStreamKeyCommand,
  ListStreamKeysCommand,
  GetStreamCommand 
} from "@aws-sdk/client-ivs";

dotenv.config();

let firestoreDatabaseId: string | undefined = undefined;
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    if (config.firestoreDatabaseId) {
      firestoreDatabaseId = config.firestoreDatabaseId;
    }
  }
} catch (e) {
  console.warn("Failed to read firebase-applet-config.json:", e);
}

function getFirestoreDb() {
  if (firestoreDatabaseId) {
    return getFirestore(firestoreDatabaseId);
  }
  return getFirestore();
}

console.log("SPARKZ.TV - Server booting up with universal avatar sync.");

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
    } catch (e: any) {}

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
    } catch (e: any) {}
  }

  return {
    playbackUrl: "https://fcc3ddae59ed.us-west-2.playback.live-video.net/api/video/v1/us-west-2.536395396152.channel.d-8HJvvryP0PNm.m3u8",
    streamKey: "SK_us-west-2_dummyKey999999",
    ingestEndpoint: "rtmps://global-contribute.live-video.net:443/app/",
    arn: "arn:aws:ivs:eu-west-1:000000000000:channel/fallback",
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

const DUMMY_USERNAMES = [
  "pirate_fm", "acid_vault", "dub_station", "test", "demo", "undefined", "null", "dummy", "user", "channel"
];

function isDummyOrInvalid(channel: any) {
  if (!channel) return true;
  const username = (channel.username || "").toLowerCase().trim();
  const displayName = (channel.display_name || "").toLowerCase().trim();
  const id = (channel.id || channel.channel_id || "").toLowerCase().trim();

  // If ID is null or undefined or empty
  if (!id || id === "undefined" || id === "null") return true;

  // Filter out explicit dummies or test accounts
  if (channel.is_dummy || channel.isDummy) return true;
  
  if (DUMMY_USERNAMES.includes(username) || DUMMY_USERNAMES.includes(displayName) || DUMMY_USERNAMES.includes(id)) {
    return true;
  }

  // Filter out channel IDs starting with dummy patterns
  if (id.startsWith("chan-pirate") || id.startsWith("chan-acid") || id.startsWith("chan-dub") || id.startsWith("dummy-")) {
    return true;
  }

  // Filter out stubs where username is too short
  if (username.length < 2) return true;

  return false;
}

function channelPublic(c: ChannelDoc, opts: { include_stream_key?: boolean } = {}) {
  if (!c || c.channel_id === "undefined" || c.username === "undefined") return {};
  
  const isMaster = (c.username || "").toLowerCase() === "djsparkz" || c.user_uid === "nsU1v44XFnN3FloJvNePqj6cBG2";
  const user = db.users.get(c.user_uid || "nsU1v44XFnN3FloJvNePqj6cBG2");
  const activePhoto = c.photo_url || user?.photo_url || null;
  
  const channelId = isMaster ? "djsparkz" : (c.channel_id || c.username || "");
  const username = isMaster ? "djsparkz" : (c.username || "");
  const displayName = isMaster ? "djsparkz" : (c.display_name || username);
  const userUid = isMaster ? "nsU1v44XFnN3FloJvNePqj6cBG2" : (c.user_uid || "");
  const playbackId = c.playback_id || "";

  const out: Record<string, any> = {
    channel_id: channelId,
    id: channelId,
    user_uid: userUid,
    username: username,
    display_name: displayName,
    photo_url: activePhoto,
    photoUrl: activePhoto,
    avatar: activePhoto,
    avatar_url: activePhoto,
    thumbnail_url: c.thumbnail_url || null,
    playback_id: playbackId,
    playbackUrl: playbackId,
    stream_title: c.stream_title || `${displayName}'s Live Stream`,
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

async function getMasterChannel() {
  let chan = db.channels.get("djsparkz") || db.channels.get("nsU1v44XFnN3FloJvNePqj6cBG2");
  const user = db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2")!;
  
  try {
    const dbFirestore = getFirestoreDb();
    
    const fetchFromFirestore = async () => {
      const userSnap = await dbFirestore.collection("users").doc("nsU1v44XFnN3FloJvNePqj6cBG2").get();
      if (userSnap.exists) {
        const data = userSnap.data();
        if (data) {
          if (data.photo_url !== undefined) user.photo_url = data.photo_url;
          if (data.display_name !== undefined) user.display_name = data.display_name;
          if (data.bio !== undefined) user.bio = data.bio;
        }
      }
      
      const channelSnap = await dbFirestore.collection("channels").doc("djsparkz").get();
      if (channelSnap.exists) {
        const data = channelSnap.data();
        if (data) {
          if (chan) {
            if (data.photo_url !== undefined) chan.photo_url = data.photo_url;
            if (data.thumbnail_url !== undefined) chan.thumbnail_url = data.thumbnail_url;
            if (data.display_name !== undefined) chan.display_name = data.display_name;
            if (data.stream_title !== undefined) chan.stream_title = data.stream_title;
            if (data.category !== undefined) chan.category = data.category;
            if (data.schedule !== undefined) (chan as any).schedule = data.schedule;
            if (data.is_live !== undefined) chan.is_live = Boolean(data.is_live);
            if (data.viewer_count !== undefined) chan.viewer_count = Number(data.viewer_count);
          }
        }
      } else {
        const channelSnapUid = await dbFirestore.collection("channels").doc("nsU1v44XFnN3FloJvNePqj6cBG2").get();
        if (channelSnapUid.exists) {
          const data = channelSnapUid.data();
          if (data) {
            if (chan) {
              if (data.photo_url !== undefined) chan.photo_url = data.photo_url;
              if (data.thumbnail_url !== undefined) chan.thumbnail_url = data.thumbnail_url;
              if (data.display_name !== undefined) chan.display_name = data.display_name;
              if (data.stream_title !== undefined) chan.stream_title = data.stream_title;
              if (data.category !== undefined) chan.category = data.category;
              if (data.schedule !== undefined) (chan as any).schedule = data.schedule;
              if (data.is_live !== undefined) chan.is_live = Boolean(data.is_live);
              if (data.viewer_count !== undefined) chan.viewer_count = Number(data.viewer_count);
            }
          }
        }
      }
    };

    await Promise.race([
      fetchFromFirestore(),
      new Promise<void>((resolve) => setTimeout(() => {
        console.warn("[Firestore Sync] Timeout reached (2000ms). Falling back to cached memory data.");
        resolve();
      }, 2000))
    ]);
  } catch (err: any) {
    console.warn("[Firestore getMasterChannel sync notice]:", err.message);
  }

  if (!chan) {
    const ivsData = await getOrCreatePersistentIvsChannel("djsparkz");
    chan = {
      channel_id: "djsparkz",
      user_uid: "nsU1v44XFnN3FloJvNePqj6cBG2",
      username: "djsparkz",
      display_name: user?.display_name || "djsparkz",
      photo_url: user?.photo_url || null,
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
  } else if (user?.photo_url) {
    chan.photo_url = user.photo_url;
  }
  return chan;
}

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 10000;

export const app = express();
app.use(cors({ origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["*"] }));
app.options("*", cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

async function startServer() {
  db.channels.clear();
  getMasterChannel().catch((err) => {
    console.warn("Failed to pre-warm master channel in background:", err.message);
  });

  app.get("/api/channels/mine", async (req, res) => {
    try {
      const channel = await getMasterChannel();
      const publicData = channelPublic(channel, { include_stream_key: true });
      return res.json({
        ...publicData,
        username: "djsparkz",
        display_name: "djsparkz",
        stream_key: channel.stream_key,
        streamKey: channel.stream_key,
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
      const masterChannel = await getMasterChannel();
      const channelsList: any[] = [channelPublic(masterChannel)];

      const seenUsernames = new Set<string>();
      const seenUids = new Set<string>();

      seenUsernames.add("djsparkz");
      if (masterChannel.user_uid) {
        seenUids.add(masterChannel.user_uid);
      }

      try {
        const dbFirestore = getFirestoreDb();
        const snapshot = await dbFirestore.collection("channels").get();
        
        snapshot.forEach((doc) => {
          const docId = doc.id;
          const data = doc.data();
          if (!data) return;

          const username = (data.username || "").toLowerCase().trim();
          const userUid = (data.user_uid || docId || "").trim();

          if (!username || username === "undefined" || username === "null") return;
          if (username === "djsparkz" || userUid === "nsU1v44XFnN3FloJvNePqj6cBG2") return;

          const cDoc: ChannelDoc = {
            channel_id: docId,
            user_uid: userUid,
            username: data.username || docId,
            display_name: data.display_name || data.username || docId,
            photo_url: data.photo_url || null,
            thumbnail_url: data.thumbnail_url || null,
            ivs_channel_arn: data.ivs_channel_arn || "",
            stream_key: data.stream_key || "",
            playback_id: data.playback_id || data.playback_url || data.playbackUrl || "",
            stream_title: data.stream_title || `${data.display_name || data.username || docId}'s Live Stream`,
            category: data.category || "music",
            is_live: Boolean(data.is_live || data.isLive),
            viewer_count: Number(data.viewer_count || 0),
            record_enabled: Boolean(data.record_enabled !== false),
            last_updated: data.last_updated || new Date().toISOString(),
            rtmp_url: data.rtmp_url || "",
          };

          if (isDummyOrInvalid(cDoc)) return;
          if (seenUsernames.has(username) || seenUids.has(userUid)) return;

          seenUsernames.add(username);
          if (userUid) {
            seenUids.add(userUid);
          }

          channelsList.push(channelPublic(cDoc));
        });
      } catch (fsErr: any) {
        console.warn("[Firestore channels list sync warning]:", fsErr.message);
      }

      return res.json(channelsList);
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to list channels" });
    }
  });

  app.get("/api/channels/:id", async (req, res) => {
    try {
      const requestedId = req.params.id;
      const normalizedId = (requestedId || "").toLowerCase().trim();

      if (normalizedId === "djsparkz" || normalizedId === "nsu1v44xfnn3flojvnepqj6cbg2") {
        const channel = await getMasterChannel();
        return res.json(channelPublic(channel, { include_stream_key: true }));
      }

      try {
        const dbFirestore = getFirestoreDb();
        let docSnap = await dbFirestore.collection("channels").doc(requestedId).get();
        if (!docSnap.exists) {
          const querySnap = await dbFirestore.collection("channels")
            .where("username", "==", requestedId)
            .limit(1)
            .get();
          if (!querySnap.empty) {
            docSnap = querySnap.docs[0];
          }
        }

        if (docSnap.exists) {
          const data = docSnap.data();
          if (data) {
            const userUid = data.user_uid || docSnap.id || "";
            const username = data.username || docSnap.id || "";

            const cDoc: ChannelDoc = {
              channel_id: docSnap.id,
              user_uid: userUid,
              username: username,
              display_name: data.display_name || username,
              photo_url: data.photo_url || null,
              thumbnail_url: data.thumbnail_url || null,
              ivs_channel_arn: data.ivs_channel_arn || "",
              stream_key: data.stream_key || "",
              playback_id: data.playback_id || data.playback_url || data.playbackUrl || "",
              stream_title: data.stream_title || `${data.display_name || username}'s Live Stream`,
              category: data.category || "music",
              is_live: Boolean(data.is_live || data.isLive),
              viewer_count: Number(data.viewer_count || 0),
              record_enabled: Boolean(data.record_enabled !== false),
              last_updated: data.last_updated || new Date().toISOString(),
              rtmp_url: data.rtmp_url || "",
            };

            if (!isDummyOrInvalid(cDoc)) {
              return res.json(channelPublic(cDoc, { include_stream_key: true }));
            }
          }
        }
      } catch (fsErr: any) {
        console.warn("[Firestore single channel fetch warning]:", fsErr.message);
      }

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
        streamKey: channel.stream_key,
        playback_id: channel.playback_id,
        ivs_channel_arn: channel.ivs_channel_arn,
        playbackUrl: channel.playback_id,
        rtmp_url: channel.rtmp_url || "rtmps://global-contribute.live-video.net:443/app/",
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to create/get stream", details: err.message });
    }
  });

  app.post("/api/ivs/check-status", async (req, res) => {
    try {
      const channel = await getMasterChannel();
      const client = getIvsClient();
      
      if (client && channel?.ivs_channel_arn && !channel.ivs_channel_arn.includes("fallback")) {
        const response = await client.send(new GetStreamCommand({ channelArn: channel.ivs_channel_arn }));
        const isLive = !!response.stream;
        channel.is_live = isLive;
        return res.json({ isActive: isLive, isLive, is_live: isLive, stream: response.stream });
      }
      
      return res.json({ isActive: channel.is_live, isLive: channel.is_live, is_live: channel.is_live });
    } catch (e) {
      const channel = await getMasterChannel();
      return res.json({ isActive: channel.is_live, isLive: channel.is_live, is_live: channel.is_live });
    }
  });

  const api = express.Router();
  
  api.get("/categories", (req, res) => {
    return res.json([
      "music",
      "talk",
      "gaming",
      "art",
      "outdoors",
      "lounge",
      "dj_mix",
      "podcast",
      "radio",
      "vibes"
    ]);
  });

  const handleUserUpdate = async (req: Request, res: Response) => {
    try {
      const user = db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2")!;
      const userUpdates: any = {};
      const channelUpdates: any = {};

      if (req.body?.display_name !== undefined) {
        user.display_name = req.body.display_name;
        const channel = await getMasterChannel();
        channel.display_name = req.body.display_name;
        userUpdates.display_name = req.body.display_name;
        channelUpdates.display_name = req.body.display_name;
      }
      if (req.body?.bio !== undefined) {
        user.bio = req.body.bio;
        userUpdates.bio = req.body.bio;
      }

      try {
        const dbFirestore = getFirestoreDb();
        if (Object.keys(userUpdates).length > 0) {
          await dbFirestore.collection("users").doc("nsU1v44XFnN3FloJvNePqj6cBG2").set(userUpdates, { merge: true });
        }
        if (Object.keys(channelUpdates).length > 0) {
          await dbFirestore.collection("channels").doc("djsparkz").set(channelUpdates, { merge: true });
          await dbFirestore.collection("channels").doc("nsU1v44XFnN3FloJvNePqj6cBG2").set(channelUpdates, { merge: true });
        }
      } catch (firestoreErr: any) {
        console.warn("[Firestore user sync error]:", firestoreErr.message);
      }

      return res.json({
        ...user,
        username: "djsparkz",
        display_name: user.display_name || "djsparkz",
        photo_url: user.photo_url,
        photoUrl: user.photo_url,
        avatar: user.photo_url,
        avatar_url: user.photo_url,
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to update user profile", details: err.message });
    }
  };

  api.patch("/users/me", handleUserUpdate);
  api.put("/users/me", handleUserUpdate);
  api.post("/users/me", handleUserUpdate);

  const handleChannelUpdate = async (req: Request, res: Response) => {
    try {
      const channel = await getMasterChannel();
      const updates: any = {};

      if (req.body?.stream_title !== undefined) {
        channel.stream_title = req.body.stream_title;
        updates.stream_title = req.body.stream_title;
      }
      if (req.body?.category !== undefined) {
        if (typeof req.body.category !== "string") {
          return res.status(400).json({ error: "Category must be a string" });
        }
        channel.category = req.body.category;
        updates.category = req.body.category;
      }
      if (req.body?.schedule !== undefined) {
        (channel as any).schedule = req.body.schedule;
        updates.schedule = req.body.schedule;
      }
      if (req.body?.thumbnail_url !== undefined) {
        channel.thumbnail_url = req.body.thumbnail_url;
        updates.thumbnail_url = req.body.thumbnail_url;
      }

      try {
        const dbFirestore = getFirestoreDb();
        if (Object.keys(updates).length > 0) {
          await dbFirestore.collection("channels").doc("djsparkz").set(updates, { merge: true });
          await dbFirestore.collection("channels").doc("nsU1v44XFnN3FloJvNePqj6cBG2").set(updates, { merge: true });
        }
      } catch (firestoreErr: any) {
        console.warn("[Firestore channel update sync error]:", firestoreErr.message);
      }
      
      return res.json(channelPublic(channel, { include_stream_key: true }));
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to update channel", details: err.message });
    }
  };

  api.patch("/channels/mine", handleChannelUpdate);
  api.put("/channels/mine", handleChannelUpdate);
  api.post("/channels/mine", handleChannelUpdate);

  api.post("/channels/mine/schedule", async (req, res) => {
    try {
      const channel = await getMasterChannel();
      if (req.body?.schedule !== undefined) {
        (channel as any).schedule = req.body.schedule;
      }
      return res.json({ success: true, schedule: (channel as any).schedule });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to update schedule" });
    }
  });

  api.get("/users/me", async (req, res) => {
    const user = db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2")!;
    return res.json({
      ...user,
      username: "djsparkz",
      display_name: user.display_name || "djsparkz",
      photo_url: user.photo_url,
      photoUrl: user.photo_url,
      avatar: user.photo_url,
      avatar_url: user.photo_url,
    });
  });

  const handlePhotoUpload = async (req: Request, res: Response) => {
    try {
      const user = db.users.get("nsU1v44XFnN3FloJvNePqj6cBG2")!;
      let photoUrl = user.photo_url;

      if (req.file) {
        photoUrl = `/api/files/${req.file.filename}`;
      } else if (req.body?.photo_url || req.body?.photoUrl || req.body?.photo || req.body?.avatar) {
        photoUrl = req.body.photo_url || req.body.photoUrl || req.body.photo || req.body.avatar;
      }

      user.photo_url = photoUrl;
      const channel = await getMasterChannel();
      channel.photo_url = photoUrl;

      try {
        const dbFirestore = getFirestoreDb();
        await dbFirestore.collection("users").doc("nsU1v44XFnN3FloJvNePqj6cBG2").set({
          photo_url: photoUrl
        }, { merge: true });
        await dbFirestore.collection("channels").doc("djsparkz").set({
          photo_url: photoUrl
        }, { merge: true });
        await dbFirestore.collection("channels").doc("nsU1v44XFnN3FloJvNePqj6cBG2").set({
          photo_url: photoUrl
        }, { merge: true });
      } catch (firestoreErr: any) {
        console.warn("[Firestore photo sync error]:", firestoreErr.message);
      }

      return res.json({
        success: true,
        photo_url: photoUrl,
        photoUrl: photoUrl,
        avatar: photoUrl,
        avatar_url: photoUrl,
        user: {
          ...user,
          username: "djsparkz",
          display_name: user.display_name || "djsparkz",
          photo_url: photoUrl,
          photoUrl: photoUrl,
          avatar: photoUrl,
          avatar_url: photoUrl,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to update profile photo", details: err.message });
    }
  };

  api.post("/users/me/photo", upload.single("photo"), handlePhotoUpload);
  api.put("/users/me/photo", upload.single("photo"), handlePhotoUpload);

  api.post("/channels/mine/thumbnail", upload.single("thumbnail"), async (req, res) => {
    try {
      const channel = await getMasterChannel();
      let thumbnailUrl = channel.thumbnail_url || null;

      if (req.file) {
        thumbnailUrl = `/api/files/${req.file.filename}`;
      } else if (req.body?.thumbnail || req.body?.image || req.body?.file) {
        thumbnailUrl = req.body.thumbnail || req.body.image || req.body.file;
      }

      channel.thumbnail_url = thumbnailUrl;

      try {
        const dbFirestore = getFirestoreDb();
        await dbFirestore.collection("channels").doc("djsparkz").set({
          thumbnail_url: thumbnailUrl
        }, { merge: true });
        await dbFirestore.collection("channels").doc("nsU1v44XFnN3FloJvNePqj6cBG2").set({
          thumbnail_url: thumbnailUrl
        }, { merge: true });
      } catch (firestoreErr: any) {
        console.warn("[Firestore thumbnail sync error]:", firestoreErr.message);
      }

      return res.json({
        success: true,
        thumbnail_url: thumbnailUrl,
        thumbnailUrl: thumbnailUrl,
      });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to update channel thumbnail", details: err.message });
    }
  });

  api.delete("/channels/mine/thumbnail", async (req, res) => {
    try {
      const channel = await getMasterChannel();
      channel.thumbnail_url = null;

      try {
        const dbFirestore = getFirestoreDb();
        await dbFirestore.collection("channels").doc("djsparkz").set({
          thumbnail_url: null
        }, { merge: true });
        await dbFirestore.collection("channels").doc("nsU1v44XFnN3FloJvNePqj6cBG2").set({
          thumbnail_url: null
        }, { merge: true });
      } catch (firestoreErr: any) {
        console.warn("[Firestore thumbnail delete sync error]:", firestoreErr.message);
      }

      return res.json({ success: true });
    } catch (err: any) {
      return res.status(500).json({ error: "Failed to clear channel thumbnail" });
    }
  });

  api.use("/files", express.static(uploadsDir));
  app.use("/api", api);

  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath));
  app.get("*", (req, res) => {
    res.sendFile(path.join(distPath, "index.html"));
  });

  const CHAT_COLORS = [
    "#ff4a5a", "#e5ff00", "#34d399", "#22d3ee", "#a78bfa",
    "#fb7185", "#38bdf8", "#fb923c", "#f472b6", "#a3e635"
  ];

  const chatRooms = new Map<string, Set<any>>();
  const chatHistory = new Map<string, any[]>();

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (request, socket, head) => {
    try {
      const urlObj = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
      const pathname = urlObj.pathname;

      if (pathname.startsWith("/api/ws/chat/")) {
        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, request);
        });
      } else {
        socket.destroy();
      }
    } catch (e) {
      socket.destroy();
    }
  });

  wss.on("connection", async (ws: any, request: any) => {
    try {
      const urlObj = new URL(request.url || "", `http://${request.headers.host || "localhost"}`);
      const pathname = urlObj.pathname;
      const chatMatch = pathname.match(/^\/api\/ws\/chat\/([^/]+)$/);
      
      if (!chatMatch) {
        ws.close();
        return;
      }

      const roomName = decodeURIComponent(chatMatch[1]);
      const token = urlObj.searchParams.get("token") || "";
      const guestNameParam = urlObj.searchParams.get("guest_name") || "";

      let uid = "guest-" + Math.random().toString(36).substring(2, 9);
      let username = guestNameParam ? guestNameParam.trim() : "Guest";
      let displayName = username;
      let photoUrl: string | null = null;
      let badges = ["guest"];
      let color = CHAT_COLORS[Math.floor(Math.random() * CHAT_COLORS.length)];
      let wattsVal = 0;

      if (token && token !== "guest") {
        try {
          const decodedToken = await getAuth().verifyIdToken(token);
          uid = decodedToken.uid;
          
          const dbFirestore = getFirestoreDb();
          const userSnap = await dbFirestore.collection("users").doc(uid).get();
          if (userSnap.exists) {
            const data = userSnap.data();
            if (data) {
              username = data.username || data.display_name || "User";
              displayName = data.display_name || username;
              photoUrl = data.photo_url || null;
              wattsVal = typeof data.watts === "number" ? data.watts : 100;
            }
          } else {
            const localUser = db.users.get(uid);
            if (localUser) {
              username = localUser.username;
              displayName = localUser.display_name;
              photoUrl = localUser.photo_url;
              wattsVal = typeof localUser.watts === "number" ? localUser.watts : 100;
            }
          }

          badges = [];
          if (username === roomName) {
            badges.push("broadcaster");
          }
          if (wattsVal >= 1000) {
            badges.push("watts_king");
          }
          if (badges.length === 0) {
            badges.push("supporter");
          }
        } catch (err) {
          console.error("[WS Auth Error]:", err);
        }
      }

      const client = {
        ws,
        uid,
        username,
        displayName,
        photoUrl,
        badges,
        color,
        roomName
      };

      if (!chatRooms.has(roomName)) {
        chatRooms.set(roomName, new Set());
      }
      chatRooms.get(roomName)!.add(client);

      console.log(`[WS] User ${username} connected to room: ${roomName}`);

      const history = chatHistory.get(roomName) || [];
      for (const msg of history) {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify(msg));
        }
      }

      ws.on("message", async (rawMsg: any) => {
        try {
          const data = JSON.parse(rawMsg.toString());
          
          if (data.type === "typing") {
            const typingPayload = {
              type: "typing",
              uid: client.uid,
              username: client.username,
              display_name: client.displayName,
              is_typing: data.is_typing
            };
            const roomClients = chatRooms.get(roomName);
            if (roomClients) {
              for (const c of roomClients) {
                if (c.ws !== ws && c.ws.readyState === 1) {
                  c.ws.send(JSON.stringify(typingPayload));
                }
              }
            }
          } else {
            const text = data.text || "";
            if (!text.trim()) return;

            const isHighlighted = !!data.is_highlighted;
            const highlightType = data.highlight_type || "neon_glow";

            if (isHighlighted) {
              wattsVal = Math.max(0, wattsVal - 50);
              try {
                const dbFirestore = getFirestoreDb();
                await dbFirestore.collection("users").doc(client.uid).update({ watts: wattsVal });
              } catch (e) {}
              const localUser = db.users.get(client.uid);
              if (localUser) {
                localUser.watts = wattsVal;
              }
            }

            const messagePayload = {
              type: "message",
              id: "msg-" + Date.now() + "-" + Math.random().toString(36).substring(2, 9),
              text: text,
              sender_uid: client.uid,
              sender_username: client.username,
              sender_display_name: client.displayName,
              sender_photo_url: client.photoUrl,
              created_at: new Date().toISOString(),
              is_highlighted: isHighlighted,
              highlight_type: highlightType,
              sender_badges: client.badges,
              sender_color: client.color,
              user_watts: wattsVal
            };

            if (!chatHistory.has(roomName)) {
              chatHistory.set(roomName, []);
            }
            const roomHistory = chatHistory.get(roomName)!;
            roomHistory.push(messagePayload);
            if (roomHistory.length > 50) {
              roomHistory.shift();
            }

            const roomClients = chatRooms.get(roomName);
            if (roomClients) {
              for (const c of roomClients) {
                if (c.ws.readyState === 1) {
                  c.ws.send(JSON.stringify(messagePayload));
                }
              }
            }
          }
        } catch (e) {
          console.error("[WS Message Error]:", e);
        }
      });

      ws.on("close", () => {
        console.log(`[WS] User ${username} disconnected from room: ${roomName}`);
        const roomClients = chatRooms.get(roomName);
        if (roomClients) {
          roomClients.delete(client);
          if (roomClients.size === 0) {
            chatRooms.delete(roomName);
          }
        }
      });

      ws.on("error", (err: any) => {
        console.error(`[WS] Connection error for ${username}:`, err);
      });

    } catch (err) {
      console.error("[WS Connection Handling Error]:", err);
      try {
        ws.close();
      } catch {}
    }
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

export const setupPromise = startServer().catch((err) => {
  console.error("Failed to start server:", err);
});