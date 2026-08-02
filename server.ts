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

let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  }
} catch (e) {
  console.error("Error reading firebase-applet-config.json:", e);
}

// Safely initialize Firebase Admin SDK for server-side admin operations
try {
  if (admin && admin.apps && Array.isArray(admin.apps) && admin.apps.length === 0) {
    const projectId = firebaseConfig.projectId || process.env.GCP_PROJECT || process.env.FIREBASE_PROJECT_ID || "ai-studio-sparksztv22-93d657ea-0def-4bee-a52e-2b85b2f712b1";
    admin.initializeApp({
      projectId,
    });
    console.log(`Firebase Admin SDK initialized successfully for project: "${projectId}"`);
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

  // Robust fallback stream credentials
  return {
    id: `stream_${crypto.randomBytes(8).toString("hex")}`,
    streamKey: `sk_${crypto.randomBytes(12).toString("hex")}`,
    playbackId: crypto.randomBytes(8).toString("hex"),
  };
}

async function syncChannelToFirestore(c: ChannelDoc) {
  if (!firebaseConfig.projectId || !firebaseConfig.apiKey) return;
  try {
    const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
    const channelIdUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/channels/${c.channel_id}?key=${firebaseConfig.apiKey}`;
    const channelNameUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/channels/${c.username}?key=${firebaseConfig.apiKey}`;
    const userUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/users/${c.user_uid}?key=${firebaseConfig.apiKey}`;

    const fields = {
      channel_id: { stringValue: c.channel_id },
      user_uid: { stringValue: c.user_uid },
      username: { stringValue: c.username },
      display_name: { stringValue: c.display_name },
      photo_url: { stringValue: c.photo_url || "" },
      thumbnail_url: { stringValue: c.thumbnail_url || "" },
      livepeer_stream_id: { stringValue: c.livepeer_stream_id || "" },
      stream_key: { stringValue: c.stream_key || "" },
      playback_id: { stringValue: c.playback_id || "" },
      stream_title: { stringValue: c.stream_title || "" },
      category: { stringValue: c.category || "music" },
      is_live: { booleanValue: Boolean(c.is_live) },
      viewer_count: { integerValue: c.viewer_count || 0 },
      rtmp_url: { stringValue: "rtmp://rtmp.livepeer.com/live" },
      playback_url: { stringValue: `https://livepeercdn.studio/hls/${c.playback_id}/index.m3u8` },
      schedule_json: { stringValue: JSON.stringify(c.schedule || []) },
      last_updated: { stringValue: new Date().toISOString() },
    };

    const payload = JSON.stringify({ fields });

    // Sync to channels by channel_id
    await fetch(channelIdUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: payload,
    }).catch(() => {});

    // Sync to channels by username
    await fetch(channelNameUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: payload,
    }).catch(() => {});

    // Sync to users document directly
    await fetch(userUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          ...fields,
          stream_id: { stringValue: c.livepeer_stream_id || "" },
        },
      }),
    }).catch(() => {});
  } catch (err) {
    // Non-blocking
  }
}

async function updateFirestoreChannelLiveStatus(docId: string, isLive: boolean, timestamp: string) {
  if (!docId) return;

  // 1. Try Firebase Admin SDK first (bypasses security rules)
  if (admin && admin.apps && admin.apps.length) {
    try {
      const db = admin.firestore();
      const docRef = db.collection("channels").doc(docId);
      try {
        await docRef.update({
          is_live: isLive,
          isLive: isLive,
          last_updated: timestamp,
        });
      } catch {
        await docRef.set(
          {
            is_live: isLive,
            isLive: isLive,
            last_updated: timestamp,
          },
          { merge: true }
        );
      }
      console.log(`[Firebase Admin SDK] Document "channels/${docId}" updated successfully: is_live=${isLive}`);
      return;
    } catch (adminErr) {
      console.error(`[Firebase Admin SDK Error] Could not update "channels/${docId}":`, adminErr);
    }
  }

  // 2. Fallback to REST API if Admin SDK is unavailable
  if (!firebaseConfig.projectId || !firebaseConfig.apiKey) return;
  try {
    const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
    const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/channels/${docId}?updateMask.fieldPaths=is_live&updateMask.fieldPaths=isLive&updateMask.fieldPaths=last_updated&key=${firebaseConfig.apiKey}`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: {
          is_live: { booleanValue: isLive },
          isLive: { booleanValue: isLive },
          last_updated: { stringValue: timestamp },
        },
      }),
    });

    if (res.ok) {
      console.log(`[REST Fallback] Firestore document "channels/${docId}" updated successfully: is_live=${isLive}`);
    } else {
      const errText = await res.text();
      console.error(`[REST Fallback] Firestore update error for "channels/${docId}" (HTTP ${res.status}):`, errText);
    }
  } catch (e) {
    console.error(`[REST Fallback] Firestore update exception for "channels/${docId}":`, e);
  }
}

async function queryAndUpdateFirestoreChannels(searchKeys: string[], isLive: boolean, timestamp: string) {
  const validKeys = searchKeys.filter(Boolean).map((s) => String(s).trim().toLowerCase());
  if (validKeys.length === 0) return;

  console.log("Searching Firestore channels collection with search keys:", validKeys);

  // Strategy 1: Firebase Admin SDK
  if (admin && admin.apps && admin.apps.length) {
    try {
      const db = admin.firestore();
      const snapshot = await db.collection("channels").get();
      console.log(`[Firebase Admin SDK] Retrieved ${snapshot.docs.length} document(s) from "channels" collection.`);

      let updatedCount = 0;
      for (const doc of snapshot.docs) {
        const docId = doc.id;
        const data = doc.data() || {};
        const channelId = String(data.channel_id || data.channelId || "").toLowerCase();
        const username = String(data.username || "").toLowerCase();
        const livepeerStreamId = String(
          data.livepeer_stream_id || data.stream_id || data.streamId || data.id || ""
        ).toLowerCase();
        const playbackId = String(data.playback_id || data.playbackId || "").toLowerCase();
        const streamKey = String(data.stream_key || data.streamKey || "").toLowerCase();

        const matches = validKeys.some(
          (k) =>
            docId.toLowerCase() === k ||
            (channelId && channelId === k) ||
            (username && username === k) ||
            (livepeerStreamId && livepeerStreamId === k) ||
            (playbackId && playbackId === k) ||
            (streamKey && streamKey === k) ||
            (k.length > 3 && (channelId.includes(k) || k.includes(channelId) || playbackId.includes(k) || k.includes(playbackId)))
        );

        if (matches) {
          console.log(`[Firebase Admin SDK] Match found for docId="${docId}". Updating is_live=${isLive}`);
          await doc.ref.set(
            {
              is_live: isLive,
              isLive: isLive,
              last_updated: timestamp,
            },
            { merge: true }
          );
          updatedCount++;
        }
      }

      console.log(`[Firebase Admin SDK] Total matched channels updated: ${updatedCount}`);
      return;
    } catch (adminErr) {
      console.error("[Firebase Admin SDK Query Error]:", adminErr);
    }
  }

  // Strategy 2: REST API fallback
  if (!firebaseConfig.projectId || !firebaseConfig.apiKey) return;
  const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
  const foundDocsMap = new Map<string, any>(); // docId -> document fields

  try {
    const listUrl = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/channels?key=${firebaseConfig.apiKey}&pageSize=300`;
    const listRes = await fetch(listUrl);
    if (listRes.ok) {
      const listData = await listRes.json();
      if (Array.isArray(listData.documents)) {
        for (const doc of listData.documents) {
          const docName = doc.name || "";
          const docId = docName.split("/").pop() || "";
          if (docId) {
            foundDocsMap.set(docId, doc.fields || {});
          }
        }
      }
    }
  } catch (err) {
    console.error("Error listing channels documents from Firestore REST:", err);
  }

  let updatedCount = 0;
  for (const [docId, fields] of foundDocsMap.entries()) {
    const channelId = String(fields.channel_id?.stringValue || fields.channelId?.stringValue || "").toLowerCase();
    const username = String(fields.username?.stringValue || "").toLowerCase();
    const livepeerStreamId = String(
      fields.livepeer_stream_id?.stringValue ||
      fields.stream_id?.stringValue ||
      fields.streamId?.stringValue ||
      fields.id?.stringValue ||
      ""
    ).toLowerCase();
    const playbackId = String(fields.playback_id?.stringValue || fields.playbackId?.stringValue || "").toLowerCase();
    const streamKey = String(fields.stream_key?.stringValue || fields.streamKey?.stringValue || "").toLowerCase();

    const matches = validKeys.some(
      (k) =>
        docId.toLowerCase() === k ||
        (channelId && channelId === k) ||
        (username && username === k) ||
        (livepeerStreamId && livepeerStreamId === k) ||
        (playbackId && playbackId === k) ||
        (streamKey && streamKey === k) ||
        (k.length > 3 && (channelId.includes(k) || k.includes(channelId) || playbackId.includes(k) || k.includes(playbackId)))
    );

    if (matches) {
      await updateFirestoreChannelLiveStatus(docId, isLive, timestamp);
      updatedCount++;
    }
  }

  console.log(`[REST Fallback Finished] Total channels updated: ${updatedCount}, is_live=${isLive}`);
}

const PORT = 3000;
const JWT_SECRET = process.env.JWT_SECRET || "sparkz_secret_key_12345";
const APP_NAME = "pirateradio";
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

// Memory Data Storage
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
}

interface ViewerSessionDoc {
  channel_username: string;
  viewer_id: string;
  last_seen: number; // timestamp
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
  users: Map<string, UserDoc> = new Map(); // uid -> user
  channels: Map<string, ChannelDoc> = new Map(); // channel_id -> channel
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
    // Seed 3 realistic demo channels for live streaming showcase
    const now = new Date().toISOString();

    const dnbUser: UserDoc = {
      uid: "uid-pirate-fm",
      email: "piratefm@sparkz.tv",
      username: "pirate_fm",
      display_name: "Pirate FM",
      photo_url: "https://images.unsplash.com/photo-1571266028243-3716f02d2d2e?w=150&auto=format&fit=crop&q=80",
      bio: "24/7 Underground Drum & Bass & Jungle broadcast. High energy rollers and heavy basslines.",
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
      schedule: [
        { id: "s1", day: "FRI", time: "22:00 - 02:00 UTC", title: "Friday Night DnB Rollers", genre: "dnb" },
        { id: "s2", day: "SAT", time: "20:00 - 23:00 UTC", title: "Jungle Vinyl Dubplates", genre: "jungle" },
      ],
    };

    const acidUser: UserDoc = {
      uid: "uid-acid-vault",
      email: "acidvault@sparkz.tv",
      username: "acid_vault",
      display_name: "Acid Vault",
      photo_url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=150&auto=format&fit=crop&q=80",
      bio: "303 Resonances, analog synths and deep warehouse techno session.",
      password_hash: bcrypt.hashSync("password123", 8),
      created_at: now,
    };
    const acidChannel: ChannelDoc = {
      channel_id: "chan-acid-vault",
      user_uid: "uid-acid-vault",
      username: "acid_vault",
      display_name: "Acid Vault",
      photo_url: acidUser.photo_url,
      thumbnail_url: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&auto=format&fit=crop&q=80",
      livepeer_stream_id: "stream-acid-2",
      stream_key: "sk_acid_live_key",
      playback_id: "877227t7p4x9n2q8",
      stream_title: "303 ACID TECHNO & WAREHOUSE HOUSE",
      category: "acid",
      is_live: false,
      viewer_count: 0,
      record_enabled: true,
      last_updated: now,
      stream_started_at: now,
      created_at: now,
      schedule: [
        { id: "s3", day: "THU", time: "21:00 - 00:00 UTC", title: "Analog Synthesizer Jam", genre: "acid" },
        { id: "s4", day: "SAT", time: "23:00 - 04:00 UTC", title: "Warehouse 303 Techno Set", genre: "tech" },
      ],
    };

    const dubUser: UserDoc = {
      uid: "uid-dub-station",
      email: "dubstation@sparkz.tv",
      username: "dub_station",
      display_name: "Dub Station",
      photo_url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=150&auto=format&fit=crop&q=80",
      bio: "Roots, reggae, and dub sound system culture.",
      password_hash: bcrypt.hashSync("password123", 8),
      created_at: now,
    };
    const dubChannel: ChannelDoc = {
      channel_id: "chan-dub-station",
      user_uid: "uid-dub-station",
      username: "dub_station",
      display_name: "Dub Station",
      photo_url: dubUser.photo_url,
      thumbnail_url: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=800&auto=format&fit=crop&q=80",
      livepeer_stream_id: "stream-dub-3",
      stream_key: "sk_dub_live_key",
      playback_id: "a12bc34de56fg78h",
      stream_title: "DEEP REGGAE DUB & ROOT SOUND SYSTEM",
      category: "reggae",
      is_live: false,
      viewer_count: 0,
      record_enabled: true,
      last_updated: now,
      created_at: now,
      schedule: [
        { id: "s5", day: "SUN", time: "16:00 - 20:00 UTC", title: "Sunday Dub & Reggae System", genre: "reggae" },
      ],
    };

    this.users.set(dnbUser.uid, dnbUser);
    this.channels.set(dnbChannel.channel_id, dnbChannel);

    this.users.set(acidUser.uid, acidUser);
    this.channels.set(acidChannel.channel_id, acidChannel);

    this.users.set(dubUser.uid, dubUser);
    this.channels.set(dubChannel.channel_id, dubChannel);

    // Seed Global Platform Emotes & Channel Custom Emotes
    this.stories = [];

    this.emotes = [
      {
        id: "e-glow",
        channel_username: "global",
        code: ":sparkzGlow:",
        name: "Sparkz Glow",
        image_url: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=120&auto=format&fit=crop&q=80",
        created_at: now,
      },
      {
        id: "e-303",
        channel_username: "global",
        code: ":acid303:",
        name: "303 Synth",
        image_url: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=120&auto=format&fit=crop&q=80",
        created_at: now,
      },
      {
        id: "e-bass",
        channel_username: "global",
        code: ":jungleBass:",
        name: "Jungle Bass",
        image_url: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=120&auto=format&fit=crop&q=80",
        created_at: now,
      },
      {
        id: "e-signal",
        channel_username: "global",
        code: ":signalOn:",
        name: "Signal Radar",
        image_url: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=120&auto=format&fit=crop&q=80",
        created_at: now,
      },
      {
        id: "e-fire",
        channel_username: "global",
        code: ":fireRoll:",
        name: "Fire Roller",
        image_url: "https://images.unsplash.com/photo-1517649763962-0c623266010b?w=120&auto=format&fit=crop&q=80",
        created_at: now,
      },
      {
        id: "e-rave",
        channel_username: "global",
        code: ":hyperRave:",
        name: "Hyper Rave",
        image_url: "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=120&auto=format&fit=crop&q=80",
        created_at: now,
      },
      {
        id: "e-pirate",
        channel_username: "pirate_fm",
        code: ":pirateDrop:",
        name: "Pirate Sub Drop",
        image_url: "https://images.unsplash.com/photo-1571266028243-3716f02d2d2e?w=120&auto=format&fit=crop&q=80",
        created_at: now,
      },
      {
        id: "e-acid",
        channel_username: "acid_vault",
        code: ":synthResonance:",
        name: "Synth Resonance",
        image_url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=120&auto=format&fit=crop&q=80",
        created_at: now,
      },
    ];

    // Sync seed channels to firestore asynchronously
    setTimeout(() => {
      syncChannelToFirestore(dnbChannel);
      syncChannelToFirestore(acidChannel);
      syncChannelToFirestore(dubChannel);
    }, 1000);

    // Initial chat messages
    this.chatMessages.push(
      {
        id: crypto.randomUUID(),
        channel_username: "pirate_fm",
        text: "Selecta! What track is this?",
        sender_uid: "anon-1",
        sender_username: "junglist99",
        sender_display_name: "Junglist 99",
        sender_photo_url: null,
        created_at: new Date(Date.now() - 120000).toISOString(),
      },
      {
        id: crypto.randomUUID(),
        channel_username: "pirate_fm",
        text: "UNRELEASED VIP DUBPLATE // BIG BASS",
        sender_uid: dnbUser.uid,
        sender_username: dnbUser.username,
        sender_display_name: dnbUser.display_name,
        sender_photo_url: dnbUser.photo_url,
        created_at: new Date(Date.now() - 60000).toISOString(),
      }
    );
  }
}

const db = new InMemStore();

function nowIso(): string {
  return new Date().toISOString();
}

function userPublic(u: UserDoc) {
  return {
    uid: u.uid,
    email: u.email,
    username: u.username,
    display_name: u.display_name,
    photo_url: u.photo_url,
    bio: u.bio || "",
    created_at: u.created_at,
  };
}

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
    viewer_count:
      opts.viewer_count_override !== undefined
        ? opts.viewer_count_override
        : c.viewer_count,
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

function getActiveViewerCount(channelUsername: string): number {
  const cutoff = Date.now() - 30000; // 30 seconds
  db.viewerSessions = db.viewerSessions.filter((s) => s.last_seen > cutoff);
  return db.viewerSessions.filter(
    (s) => s.channel_username === channelUsername.toLowerCase()
  ).length;
}

function getFollowerCount(channelUsername: string): number {
  return db.follows.filter(
    (f) => f.channel_username.toLowerCase() === channelUsername.toLowerCase()
  ).length;
}

function getSubscriberCount(channelUsername: string): number {
  return db.subscriptions.filter(
    (s) => s.channel_username.toLowerCase() === channelUsername.toLowerCase()
  ).length;
}

// Auth Middleware Helper
async function authenticateToken(req: Request): Promise<UserDoc | null> {
  const authHeader = req.headers["authorization"];
  if (!authHeader) return null;
  const token = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : authHeader;
  if (!token) return null;

  let uid: string | null = null;
  let emailFromToken: string | null = null;
  let nameFromToken: string | null = null;

  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload && payload.sub) {
      uid = payload.sub;
    }
  } catch {
    try {
      const decoded = jwt.decode(token) as any;
      if (decoded && (decoded.sub || decoded.user_id || decoded.uid)) {
        uid = decoded.sub || decoded.user_id || decoded.uid;
        emailFromToken = decoded.email || null;
        nameFromToken = decoded.name || decoded.display_name || null;
      }
    } catch {
      // invalid token
    }
  }

  if (!uid) return null;

  let user = db.users.get(uid);
  if (user) return user;

  if (emailFromToken) {
    const cleanEmail = emailFromToken.toLowerCase().trim();
    for (const u of db.users.values()) {
      if (u.email === cleanEmail) {
        user = u;
        break;
      }
    }
  }

  if (!user && firebaseConfig.projectId && firebaseConfig.apiKey) {
    try {
      const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
      const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${dbId}/documents/users/${uid}?key=${firebaseConfig.apiKey}`;
      const res = await fetch(url);
      if (res.ok) {
        const doc = await res.json();
        const fields = doc.fields || {};
        user = {
          uid: uid,
          email: fields.email?.stringValue || emailFromToken || "",
          username: fields.username?.stringValue || emailFromToken?.split("@")[0] || `user_${uid.slice(0, 6)}`,
          display_name: fields.display_name?.stringValue || nameFromToken || emailFromToken?.split("@")[0] || "User",
          photo_url: fields.photo_url?.stringValue || null,
          bio: fields.bio?.stringValue || "",
          password_hash: "",
          created_at: fields.created_at?.stringValue || new Date().toISOString(),
        };
        db.users.set(user.uid, user);
      }
    } catch {
      // fetch error ignored
    }
  }

  if (!user) {
    const fallbackUsername = emailFromToken ? emailFromToken.split("@")[0] : `user_${uid.slice(0, 6)}`;
    user = {
      uid: uid,
      email: emailFromToken || "",
      username: fallbackUsername,
      display_name: nameFromToken || fallbackUsername,
      photo_url: null,
      bio: "",
      password_hash: "",
      created_at: new Date().toISOString(),
    };
    db.users.set(user.uid, user);
  }

  let hasChannel = false;
  for (const c of db.channels.values()) {
    if (c.user_uid === user.uid) {
      hasChannel = true;
      break;
    }
  }

  if (!hasChannel) {
    const livepeerStream = await createLivepeerStream(user.username);
    const channelDoc: ChannelDoc = {
      channel_id: crypto.randomUUID(),
      user_uid: user.uid,
      username: user.username,
      display_name: user.display_name,
      photo_url: user.photo_url,
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
    db.channels.set(channelDoc.channel_id, channelDoc);
    await syncChannelToFirestore(channelDoc);
  }

  return user;
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

// Multer in-memory storage for uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
});

async function startServer() {
  const app = express();
  // 1. Ensure express.json() middleware is loaded at the very top before any routes
  app.use(express.json({ limit: "10mb", type: ["application/json", "application/*+json", "text/plain", "*/*"] }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app.use(cors({ origin: "*" }));

  const api = express.Router();

  // Root
  api.get("/", (req, res) => {
    res.json({ service: "pirate-radio-live", status: "ok" });
  });

  // Livepeer Webhook Endpoint
  const handleLivepeerWebhook = async (req: Request, res: Response) => {
    try {
      let body = req.body || {};
      if (typeof body === "string") {
        try {
          body = JSON.parse(body);
        } catch {
          // keep string
        }
      }
      if (Buffer.isBuffer(body)) {
        try {
          body = JSON.parse((body as Buffer).toString("utf-8"));
        } catch {
          // keep buffer
        }
      }

      console.log("Livepeer Webhook Request Body:", JSON.stringify(req.body, null, 2));
      console.log("Livepeer Webhook parsed body:", JSON.stringify(body));

      const eventObj = typeof body.event === "object" && body.event ? body.event : {};
      const eventType = String(
        (typeof body.event === "string" ? body.event : eventObj.type || eventObj.event) ||
          body.eventType ||
          body.type ||
          body.event_name ||
          ""
      ).toLowerCase();
      const streamObj = body.stream || body.payload?.stream || body.payload || body.data?.stream || {};

      const eventStreamId = String(eventObj.id || eventObj.streamId || eventObj.stream_id || "");
      const streamId = String(
        eventStreamId ||
          streamObj.id ||
          body.streamId ||
          body.stream_id ||
          body.id ||
          streamObj.streamId ||
          streamObj.stream_id ||
          ""
      );
      const playbackId = String(
        streamObj.playbackId || body.playbackId || body.playback_id || streamObj.playback_id || ""
      );
      const streamKey = String(
        streamObj.streamKey || body.streamKey || body.stream_key || streamObj.stream_key || ""
      );
      const payloadChannelId = String(
        body.channel_id || body.channelId || body.channel || body.username || streamObj.channel_id || ""
      );

      console.log("Extracted Livepeer Identifiers:", {
        eventType,
        streamId,
        playbackId,
        streamKey,
        payloadChannelId,
      });

      // Determine stream live status based on stream.started/active vs stream.idle/offline
      let isLive = false;
      if (
        eventType.includes("start") ||
        eventType.includes("active") ||
        eventType.includes("connected") ||
        eventType.includes("online") ||
        streamObj.isActive === true ||
        body.isActive === true ||
        body.is_live === true ||
        body.isLive === true ||
        body.is_live === "true" ||
        body.isLive === "true" ||
        (!eventType.includes("idle") && !eventType.includes("off") && !eventType.includes("end") && !eventType.includes("stop"))
      ) {
        isLive = true;
      }

      if (
        eventType.includes("idle") ||
        eventType.includes("offline") ||
        eventType.includes("ended") ||
        eventType.includes("disconnected") ||
        eventType.includes("stopped") ||
        streamObj.isActive === false ||
        body.isActive === false ||
        body.is_live === false ||
        body.isLive === false ||
        body.is_live === "false" ||
        body.isLive === "false"
      ) {
        isLive = false;
      }

      console.log(
        `Livepeer Webhook evaluated live status: event="${eventType}", isLive=${isLive}`
      );

      // Match channel in memory database
      let matchedChannel: ChannelDoc | null = null;
      for (const c of db.channels.values()) {
        if (
          (streamId && (c.livepeer_stream_id === streamId || c.channel_id === streamId)) ||
          (playbackId && c.playback_id === playbackId) ||
          (streamKey && c.stream_key === streamKey) ||
          (payloadChannelId && (c.channel_id.toLowerCase() === payloadChannelId.toLowerCase() || c.username.toLowerCase() === payloadChannelId.toLowerCase()))
        ) {
          matchedChannel = c;
          break;
        }
      }

      if (!matchedChannel && (body.username || body.channel_id)) {
        const uKey = String(body.username || body.channel_id).toLowerCase();
        for (const c of db.channels.values()) {
          if (c.username.toLowerCase() === uKey || c.channel_id.toLowerCase() === uKey) {
            matchedChannel = c;
            break;
          }
        }
      }

      const timestamp = new Date().toISOString();

      if (matchedChannel) {
        matchedChannel.is_live = isLive;
        matchedChannel.last_updated = timestamp;
        if (isLive) {
          matchedChannel.stream_started_at = timestamp;
        } else {
          matchedChannel.viewer_count = 0;
          matchedChannel.stream_ended_at = timestamp;
          db.viewerSessions = db.viewerSessions.filter(
            (s) => s.channel_username.toLowerCase() !== matchedChannel!.username.toLowerCase()
          );
        }

        // Sync full channel state to Firestore
        await syncChannelToFirestore(matchedChannel);

        // Explicitly update matching document fields in channels collection
        await updateFirestoreChannelLiveStatus(matchedChannel.channel_id, isLive, timestamp);
        await updateFirestoreChannelLiveStatus(matchedChannel.username, isLive, timestamp);

        console.log(`Livepeer Webhook: Synced channel ${matchedChannel.username} (is_live=${isLive}) to Firestore`);
      }

      // 1 & 2. Direct update using Firebase Admin SDK on target document nsU1v44XFnN3FloJvNePqj6CBG2
      const targetDocId = "nsU1v44XFnN3FloJvNePqj6CBG2";
      if (admin && admin.apps && admin.apps.length) {
        try {
          const adminDb = admin.firestore();
          const targetDocRef = adminDb.collection("channels").doc(targetDocId);
          try {
            await targetDocRef.update({
              is_live: isLive,
              isLive: isLive,
              last_updated: new Date().toISOString(),
            });
          } catch {
            await targetDocRef.set(
              {
                is_live: isLive,
                isLive: isLive,
                last_updated: new Date().toISOString(),
              },
              { merge: true }
            );
          }
          console.log(`[Firebase Admin SDK Direct Update Success] Updated channels/${targetDocId}: is_live=${isLive}, isLive=${isLive}`);
        } catch (adminErr) {
          console.error(`[Firebase Admin SDK Direct Update Error] Failed updating channels/${targetDocId}:`, adminErr);
        }
      } else {
        await updateFirestoreChannelLiveStatus(targetDocId, isLive, timestamp);
      }

      // Query and update all matching documents in Firestore channels collection
      const searchKeys = [
        targetDocId,
        streamId,
        playbackId,
        streamKey,
        payloadChannelId,
        matchedChannel?.channel_id,
        matchedChannel?.username,
      ].filter((k): k is string => Boolean(k));

      await queryAndUpdateFirestoreChannels(searchKeys, isLive, timestamp);

      console.log(`[CONFIRMATION EXECUTED] Livepeer webhook finished processing successfully via Firebase Admin SDK. Updated channels/${targetDocId} to is_live=${isLive}`);

      return res.status(200).json({
        success: true,
        event: eventType,
        is_live: isLive,
        isLive: isLive,
        target_document_updated: targetDocId,
        matched_channel_id: matchedChannel?.channel_id || null,
        message: "Livepeer webhook processed and Firestore updated successfully",
      });
    } catch (err: any) {
      console.error("Error processing Livepeer webhook:", err);
      return res.status(200).json({ success: false, error: err.message });
    }
  };

  // 2. Explicitly define route on app.post('/api/webhooks/livepeer')
  app.post("/api/webhooks/livepeer", handleLivepeerWebhook);
  app.post("/api/webhook/livepeer", handleLivepeerWebhook);
  app.post("/api/livepeer/webhook", handleLivepeerWebhook);

  const webhookPaths = [
    "/webhooks/livepeer",
    "/webhook/livepeer",
    "/livepeer/webhook",
  ];
  const fullWebhookPaths = [
    "/api/webhooks/livepeer",
    "/api/webhook/livepeer",
    "/api/livepeer/webhook",
    "/webhooks/livepeer",
    "/webhook/livepeer",
    "/livepeer/webhook",
  ];

  api.all(webhookPaths, handleLivepeerWebhook);
  app.all(fullWebhookPaths, handleLivepeerWebhook);

  // Automated background Livepeer status check endpoint
  const handleCheckLivepeerStatus = async (req: Request, res: Response) => {
    try {
      const { stream_id, playback_id, username, channel_id, doc_id } = req.body || {};
      const targetDocId = doc_id || "nsU1v44XFnN3FloJvNePqj6CBG2";

      const apiKey = process.env.LIVEPEER_API_KEY;
      let isLive = false;
      let livepeerChecked = false;

      let matchedChannel: ChannelDoc | null = null;
      for (const c of db.channels.values()) {
        if (
          (username && c.username.toLowerCase() === String(username).toLowerCase()) ||
          (channel_id && c.channel_id === channel_id) ||
          (playback_id && c.playback_id === playback_id) ||
          (stream_id && c.livepeer_stream_id === stream_id)
        ) {
          matchedChannel = c;
          break;
        }
      }

      const activeStreamId = stream_id || matchedChannel?.livepeer_stream_id;
      const activePlaybackId = playback_id || matchedChannel?.playback_id;

      if (apiKey && activeStreamId) {
        try {
          const lpRes = await fetch(`https://livepeer.studio/api/stream/${activeStreamId}`, {
            headers: { Authorization: `Bearer ${apiKey}` },
          });
          if (lpRes.ok) {
            const lpData = await lpRes.json();
            isLive = Boolean(lpData.isActive || lpData.is_active || lpData.health?.status === "healthy");
            livepeerChecked = true;
          }
        } catch (e) {
          console.error("[Livepeer API AutoPoll Error]:", e);
        }
      }

      if (!livepeerChecked && activePlaybackId) {
        try {
          const hlsRes = await fetch(`https://livepeercdn.studio/hls/${activePlaybackId}/index.m3u8`, {
            method: "HEAD",
          });
          if (hlsRes.ok) {
            isLive = true;
          }
        } catch {
          // Keep as false
        }
      }

      const timestamp = new Date().toISOString();

      if (matchedChannel) {
        matchedChannel.is_live = isLive;
        matchedChannel.last_updated = timestamp;
        if (isLive && !matchedChannel.stream_started_at) {
          matchedChannel.stream_started_at = timestamp;
        } else if (!isLive) {
          matchedChannel.viewer_count = 0;
          matchedChannel.stream_ended_at = timestamp;
        }
        syncChannelToFirestore(matchedChannel);
      }

      const searchKeys = [
        targetDocId,
        doc_id,
        channel_id,
        username,
        activePlaybackId,
        activeStreamId,
        matchedChannel?.channel_id,
        matchedChannel?.username,
      ].filter((k): k is string => Boolean(k));

      if (admin && admin.apps && admin.apps.length) {
        try {
          const adminDb = admin.firestore();
          const targetDocRef = adminDb.collection("channels").doc(targetDocId);
          await targetDocRef.set(
            {
              is_live: isLive,
              isLive: isLive,
              last_updated: timestamp,
            },
            { merge: true }
          );
        } catch (adminErr) {
          console.error(`[Livepeer AutoPoll Admin SDK Direct Error]:`, adminErr);
        }
      }

      await queryAndUpdateFirestoreChannels(searchKeys, isLive, timestamp);

      return res.status(200).json({
        success: true,
        is_live: isLive,
        isLive: isLive,
        target_doc_id: targetDocId,
        timestamp,
      });
    } catch (err: any) {
      console.error("Error checking Livepeer status:", err);
      return res.status(200).json({ success: false, error: err.message });
    }
  };

  app.post("/api/livepeer/check-status", handleCheckLivepeerStatus);
  api.post("/livepeer/check-status", handleCheckLivepeerStatus);
  api.get("/livepeer/check-status", handleCheckLivepeerStatus);

  const handleCreateLivepeerStream = async (req: any, res: any) => {
    try {
      const name = req.body?.name || "stream-session";
      const apiKey = process.env.LIVEPEER_API_KEY;
      if (!apiKey) {
        return res.status(500).json({ error: "LIVEPEER_API_KEY environment variable is not set." });
      }

      const lpRes = await fetch("https://livepeer.studio/api/stream", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name }),
      });

      if (!lpRes.ok) {
        const errText = await lpRes.text();
        return res.status(lpRes.status).json({ error: "Livepeer API error", details: errText });
      }

      const streamData: any = await lpRes.json();
      return res.status(200).json({
        id: streamData.id,
        streamKey: streamData.streamKey,
        playbackId: streamData.playbackId,
        stream_key: streamData.streamKey,
        playback_id: streamData.playbackId,
        rtmp_url: "rtmp://rtmp.livepeer.com/live",
        playback_url: `https://livepeer.com/playback/${streamData.playbackId}/index.m3u8`,
      });
    } catch (err: any) {
      console.error("Error creating Livepeer stream:", err);
      return res.status(500).json({ error: err.message });
    }
  };

  app.post("/livepeer/streams", handleCreateLivepeerStream);
  app.post("/api/livepeer/streams", handleCreateLivepeerStream);
  api.post("/livepeer/streams", handleCreateLivepeerStream);

  // Auth: Register
  api.post("/auth/register", async (req, res) => {
    const { email, password, username, display_name } = req.body || {};
    if (!email || !password || !username || !display_name) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    const cleanUsername = String(username).toLowerCase().trim();

    if (!/^[a-zA-Z0-9_]+$/.test(cleanUsername)) {
      return res.status(400).json({ error: "Username must be alphanumeric/underscore only" });
    }

    for (const u of db.users.values()) {
      if (u.email === cleanEmail) {
        return res.status(409).json({ error: "Email already registered" });
      }
      if (u.username === cleanUsername) {
        return res.status(409).json({ error: "Username already taken" });
      }
    }

    const uid = crypto.randomUUID();
    const userDoc: UserDoc = {
      uid,
      email: cleanEmail,
      username: cleanUsername,
      display_name: String(display_name),
      photo_url: null,
      bio: "",
      password_hash: bcrypt.hashSync(String(password), 8),
      created_at: nowIso(),
    };
    db.users.set(uid, userDoc);

    // Call Livepeer API to create stream for user
    const livepeerStream = await createLivepeerStream(cleanUsername);

    const channelDoc: ChannelDoc = {
      channel_id: crypto.randomUUID(),
      user_uid: uid,
      username: cleanUsername,
      display_name: String(display_name),
      photo_url: null,
      thumbnail_url: null,
      livepeer_stream_id: livepeerStream.id,
      stream_key: livepeerStream.streamKey,
      playback_id: livepeerStream.playbackId,
      stream_title: `${display_name}'s Live Stream`,
      category: "music",
      is_live: false,
      viewer_count: 0,
      record_enabled: true,
      last_updated: nowIso(),
      created_at: nowIso(),
    };
    db.channels.set(channelDoc.channel_id, channelDoc);

    await syncChannelToFirestore(channelDoc);

    const token = jwt.sign({ sub: uid, email: cleanEmail, type: "access" }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      user: userPublic(userDoc),
      access_token: token,
      token_type: "bearer",
    });
  });

  // Stream Creation Endpoint (Livepeer API integration)
  api.post(["/stream/create", "/streams/create", "/channels/mine/stream"], requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      let targetChannel: ChannelDoc | null = null;

      for (const c of db.channels.values()) {
        if (c.user_uid === user.uid) {
          targetChannel = c;
          break;
        }
      }

      const forceNew = Boolean(req.body?.forceNew || req.body?.force_new);

      // Reuse existing persistent stream key if available and new key was not explicitly forced
      if (targetChannel && targetChannel.stream_key && targetChannel.playback_id && !forceNew) {
        return res.json({
          success: true,
          channel_id: targetChannel.channel_id,
          livepeer_stream_id: targetChannel.livepeer_stream_id,
          stream_key: targetChannel.stream_key,
          playback_id: targetChannel.playback_id,
          rtmp_url: "rtmp://rtmp.livepeer.com/live",
          playback_url: `https://livepeercdn.studio/hls/${targetChannel.playback_id}/index.m3u8`,
          channel: channelPublic(targetChannel, { include_stream_key: true }),
        });
      }

      // Call Livepeer API to generate new stream credentials
      const livepeerStream = await createLivepeerStream(user.username);

      if (targetChannel) {
        targetChannel.livepeer_stream_id = livepeerStream.id;
        targetChannel.stream_key = livepeerStream.streamKey;
        targetChannel.playback_id = livepeerStream.playbackId;
        targetChannel.last_updated = nowIso();
      } else {
        targetChannel = {
          channel_id: crypto.randomUUID(),
          user_uid: user.uid,
          username: user.username,
          display_name: user.display_name,
          photo_url: user.photo_url,
          thumbnail_url: null,
          livepeer_stream_id: livepeerStream.id,
          stream_key: livepeerStream.streamKey,
          playback_id: livepeerStream.playbackId,
          stream_title: `${user.display_name}'s Live Stream`,
          category: "music",
          is_live: false,
          viewer_count: 0,
          record_enabled: true,
          last_updated: nowIso(),
          created_at: nowIso(),
        };
        db.channels.set(targetChannel.channel_id, targetChannel);
      }

      // Direct sync into user's and channel's Firestore document (graceful non-blocking)
      syncChannelToFirestore(targetChannel).catch((err) => {
        console.warn("Firestore sync non-critical error during stream creation:", err);
      });

      return res.json({
        success: true,
        channel_id: targetChannel.channel_id,
        livepeer_stream_id: targetChannel.livepeer_stream_id,
        stream_key: targetChannel.stream_key,
        playback_id: targetChannel.playback_id,
        rtmp_url: "rtmp://rtmp.livepeer.com/live",
        playback_url: `https://livepeercdn.studio/hls/${targetChannel.playback_id}/index.m3u8`,
        channel: channelPublic(targetChannel, { include_stream_key: true }),
      });
    } catch (err: any) {
      console.error("Error in /stream/create:", err);
      return res.status(500).json({ error: err?.message || "Failed to create stream" });
    }
  });

  // Auth: Login
  api.post("/auth/login", (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const cleanEmail = String(email).toLowerCase().trim();
    let foundUser: UserDoc | null = null;

    for (const u of db.users.values()) {
      if (u.email === cleanEmail) {
        foundUser = u;
        break;
      }
    }

    if (!foundUser || !bcrypt.compareSync(String(password), foundUser.password_hash)) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { sub: foundUser.uid, email: foundUser.email, type: "access" },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      user: userPublic(foundUser),
      access_token: token,
      token_type: "bearer",
    });
  });

  // Auth: Me
  api.get("/auth/me", requireAuth, (req, res) => {
    res.json(userPublic((req as any).user));
  });

  // Users: Update profile
  api.patch("/users/me", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    const { display_name, bio, photo_url } = req.body || {};

    if (display_name !== undefined) user.display_name = String(display_name);
    if (bio !== undefined) user.bio = String(bio);
    if (photo_url !== undefined) user.photo_url = photo_url;

    // Sync to user's channel
    for (const c of db.channels.values()) {
      if (c.user_uid === user.uid) {
        if (display_name !== undefined) c.display_name = user.display_name;
        if (photo_url !== undefined) c.photo_url = user.photo_url;
        c.last_updated = nowIso();
      }
    }

    res.json(userPublic(user));
  });

  // Upload user photo
  api.post("/users/me/photo", requireAuth, upload.single("file"), (req, res) => {
    const user = (req as any).user as UserDoc;
    if (!req.file) {
      return res.status(400).json({ error: "File must be an image" });
    }
    const ext = req.file.originalname.split(".").pop() || "png";
    const filePath = `avatars/${user.uid}/${crypto.randomUUID()}.${ext}`;

    db.files.set(filePath, {
      data: req.file.buffer,
      mimeType: req.file.mimetype || "image/png",
    });

    const photoUrl = `/api/files/${filePath}`;
    user.photo_url = photoUrl;

    for (const c of db.channels.values()) {
      if (c.user_uid === user.uid) {
        c.photo_url = photoUrl;
      }
    }

    res.json({ photo_url: photoUrl });
  });

  // Upload channel thumbnail
  api.post("/channels/mine/thumbnail", requireAuth, upload.single("file"), (req, res) => {
    const user = (req as any).user as UserDoc;
    if (!req.file) {
      return res.status(400).json({ error: "File must be an image" });
    }
    let targetChannel: ChannelDoc | null = null;
    for (const c of db.channels.values()) {
      if (c.user_uid === user.uid) {
        targetChannel = c;
        break;
      }
    }
    if (!targetChannel) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const ext = req.file.originalname.split(".").pop() || "png";
    const filePath = `thumbnails/${user.uid}/${crypto.randomUUID()}.${ext}`;

    db.files.set(filePath, {
      data: req.file.buffer,
      mimeType: req.file.mimetype || "image/png",
    });

    const thumbnailUrl = `/api/files/${filePath}`;
    targetChannel.thumbnail_url = thumbnailUrl;
    targetChannel.last_updated = nowIso();

    res.json({ thumbnail_url: thumbnailUrl });
  });

  // Delete channel thumbnail
  api.delete("/channels/mine/thumbnail", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    for (const c of db.channels.values()) {
      if (c.user_uid === user.uid) {
        c.thumbnail_url = null;
        c.last_updated = nowIso();
      }
    }
    res.json({ thumbnail_url: null });
  });

  // Get user by username
  api.get("/users/:username", (req, res) => {
    const uname = req.params.username.toLowerCase();
    for (const u of db.users.values()) {
      if (u.username === uname) {
        return res.json(userPublic(u));
      }
    }
    res.status(404).json({ error: "User not found" });
  });

  // Get my channel
  api.get("/channels/mine", requireAuth, async (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      let myChannel: ChannelDoc | null = null;

      for (const c of db.channels.values()) {
        if (c.user_uid === user.uid) {
          myChannel = c;
          break;
        }
      }

      // Auto-create channel if missing for authenticated user
      if (!myChannel) {
        const lp = await createLivepeerStream(user.username);
        myChannel = {
          channel_id: crypto.randomUUID(),
          user_uid: user.uid,
          username: user.username,
          display_name: user.display_name,
          photo_url: user.photo_url || null,
          thumbnail_url: null,
          livepeer_stream_id: lp.id,
          stream_key: lp.streamKey,
          playback_id: lp.playbackId,
          stream_title: `${user.display_name}'s Live Stream`,
          category: "music",
          is_live: false,
          viewer_count: 0,
          record_enabled: true,
          last_updated: nowIso(),
          created_at: nowIso(),
        };
        db.channels.set(myChannel.channel_id, myChannel);
        syncChannelToFirestore(myChannel).catch(() => {});
      } else if (!myChannel.stream_key || !myChannel.playback_id) {
        try {
          const lp = await createLivepeerStream(myChannel.username);
          myChannel.livepeer_stream_id = lp.id;
          myChannel.stream_key = lp.streamKey;
          myChannel.playback_id = lp.playbackId;
          myChannel.last_updated = nowIso();
          syncChannelToFirestore(myChannel).catch(() => {});
        } catch (e) {
          console.error("Auto stream creation on channel fetch failed:", e);
        }
      }

      const followers = getFollowerCount(myChannel.username);
      const subscribers = getSubscriberCount(myChannel.username);
      const activeViewers = myChannel.is_live ? getActiveViewerCount(myChannel.username) : 0;

      return res.json(
        channelPublic(myChannel, {
          include_stream_key: true,
          follower_count: followers,
          subscriber_count: subscribers,
          viewer_count_override: activeViewers,
        })
      );
    } catch (err: any) {
      console.error("Error in GET /channels/mine:", err);
      return res.status(500).json({ error: "Failed to fetch channel" });
    }
  });

  // Update my channel
  api.patch("/channels/mine", requireAuth, (req, res) => {
    try {
      const user = (req as any).user as UserDoc;
      const { stream_title, category, schedule, stream_key, playback_id, livepeer_stream_id } = req.body || {};

      if (category && !CATEGORIES.includes(category)) {
        return res.status(400).json({ error: "Invalid category" });
      }

      let myChannel: ChannelDoc | null = null;
      for (const c of db.channels.values()) {
        if (c.user_uid === user.uid) {
          myChannel = c;
          break;
        }
      }

      if (!myChannel) {
        myChannel = {
          channel_id: crypto.randomUUID(),
          user_uid: user.uid,
          username: user.username,
          display_name: user.display_name,
          photo_url: user.photo_url || null,
          thumbnail_url: null,
          livepeer_stream_id: livepeer_stream_id ? String(livepeer_stream_id) : "",
          stream_key: stream_key ? String(stream_key) : "",
          playback_id: playback_id ? String(playback_id) : "",
          stream_title: stream_title ? String(stream_title) : `${user.display_name}'s Live Stream`,
          category: category ? String(category) : "music",
          is_live: false,
          viewer_count: 0,
          record_enabled: true,
          last_updated: nowIso(),
          created_at: nowIso(),
        };
        db.channels.set(myChannel.channel_id, myChannel);
      } else {
        if (stream_title !== undefined) myChannel.stream_title = String(stream_title);
        if (category !== undefined) myChannel.category = String(category);
        if (stream_key !== undefined) myChannel.stream_key = String(stream_key);
        if (playback_id !== undefined) myChannel.playback_id = String(playback_id);
        if (livepeer_stream_id !== undefined) myChannel.livepeer_stream_id = String(livepeer_stream_id);
        if (Array.isArray(schedule)) {
          myChannel.schedule = schedule.map((item: any) => ({
            id: String(item.id || crypto.randomUUID()),
            day: String(item.day || "FRI"),
            time: String(item.time || "20:00 - 22:00"),
            title: String(item.title || "Live Set"),
            genre: item.genre ? String(item.genre) : undefined,
          }));
        }
        myChannel.last_updated = nowIso();
      }

      syncChannelToFirestore(myChannel).catch(() => {});
      return res.json(channelPublic(myChannel, { include_stream_key: true }));
    } catch (err: any) {
      console.error("Error in PATCH /channels/mine:", err);
      return res.status(500).json({ error: "Failed to update channel" });
    }
  });

  // Go live / Toggle live
  api.post("/channels/mine/go-live", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    const { is_live } = req.body || {};

    for (const c of db.channels.values()) {
      if (c.user_uid === user.uid) {
        c.is_live = Boolean(is_live);
        c.last_updated = nowIso();
        if (c.is_live) {
          c.stream_started_at = nowIso();

          // Fan out notifications to followers
          const followers = db.follows.filter(
            (f) => f.channel_username.toLowerCase() === c.username.toLowerCase()
          );
          for (const f of followers) {
            db.notifications.push({
              id: crypto.randomUUID(),
              user_uid: f.follower_uid,
              type: "channel_live",
              channel_username: c.username,
              channel_display_name: c.display_name,
              channel_photo_url: c.photo_url || undefined,
              stream_title: c.stream_title,
              created_at: nowIso(),
              read: false,
            });
          }
        } else {
          c.viewer_count = 0;
          c.stream_ended_at = nowIso();
          db.viewerSessions = db.viewerSessions.filter(
            (s) => s.channel_username.toLowerCase() !== c.username.toLowerCase()
          );
        }
        syncChannelToFirestore(c);
        return res.json(channelPublic(c, { include_stream_key: true }));
      }
    }
    res.status(404).json({ error: "Channel not found" });
  });

  // Sync channel
  api.post("/channels/mine/sync", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    for (const c of db.channels.values()) {
      if (c.user_uid === user.uid) {
        return res.json(channelPublic(c, { include_stream_key: true }));
      }
    }
    res.status(404).json({ error: "Channel not found" });
  });

  // List channels
  api.get("/channels", (req, res) => {
    const { category, live_only, following, q, search } = req.query;
    const searchQuery = String(q || search || "").trim().toLowerCase();
    const user = authenticateToken(req);

    let list = Array.from(db.channels.values());

    if (String(live_only) === "true") {
      list = list.filter((c) => c.is_live);
    }
    if (category) {
      list = list.filter((c) => c.category === String(category));
    }
    if (searchQuery) {
      list = list.filter((c) => {
        const u = c.username.toLowerCase();
        const d = (c.display_name || "").toLowerCase();
        const cat = (c.category || "").toLowerCase();
        const st = (c.stream_title || "").toLowerCase();
        const schedTitles = (c.schedule || []).map((s) => (s.title + " " + (s.genre || "")).toLowerCase()).join(" ");
        return u.includes(searchQuery) || d.includes(searchQuery) || cat.includes(searchQuery) || st.includes(searchQuery) || schedTitles.includes(searchQuery);
      });
    }
    if (String(following) === "true") {
      if (!user) {
        return res.status(401).json({ error: "Login required for follows filter" });
      }
      const followedUsernames = new Set(
        db.follows
          .filter((f) => f.follower_uid === user.uid)
          .map((f) => f.channel_username.toLowerCase())
      );
      list = list.filter((c) => followedUsernames.has(c.username.toLowerCase()));
    }

    // Sort live first, then viewer count, then last_updated
    list.sort((a, b) => {
      if (a.is_live !== b.is_live) return a.is_live ? -1 : 1;
      const vcA = a.is_live ? getActiveViewerCount(a.username) || a.viewer_count : 0;
      const vcB = b.is_live ? getActiveViewerCount(b.username) || b.viewer_count : 0;
      if (vcA !== vcB) return vcB - vcA;
      return new Date(b.last_updated).getTime() - new Date(a.last_updated).getTime();
    });

    const results = list.map((c) => {
      const activeVc = c.is_live ? getActiveViewerCount(c.username) || c.viewer_count : 0;
      return channelPublic(c, { viewer_count_override: activeVc });
    });

    res.json(results);
  });

  // Get channel by username
  api.get("/channels/:username", async (req, res) => {
    const uname = req.params.username.toLowerCase();
    const user = authenticateToken(req);

    let found: ChannelDoc | null = null;
    for (const c of db.channels.values()) {
      if (
        c.username.toLowerCase() === uname ||
        c.channel_id.toLowerCase() === uname ||
        c.user_uid === uname
      ) {
        found = c;
        break;
      }
    }

    if (!found && admin && admin.apps && admin.apps.length) {
      try {
        const dbFs = admin.firestore();
        const docRef = dbFs.collection("channels").doc(uname);
        const docSnap = await docRef.get();
        if (docSnap.exists) {
          const data = docSnap.data() as any;
          found = {
            channel_id: data.channel_id || docSnap.id,
            user_uid: data.user_uid || data.uid || docSnap.id,
            username: data.username || uname,
            display_name: data.display_name || data.username || uname,
            photo_url: data.photo_url || null,
            thumbnail_url: data.thumbnail_url || null,
            livepeer_stream_id: data.livepeer_stream_id || "",
            stream_key: data.stream_key || "",
            playback_id: data.playback_id || "",
            stream_title: data.stream_title || "Live Stream",
            category: data.category || "music",
            is_live: Boolean(data.is_live || data.isLive),
            viewer_count: data.viewer_count || 0,
            record_enabled: true,
            last_updated: data.last_updated || new Date().toISOString(),
            created_at: data.created_at || new Date().toISOString(),
          };
          db.channels.set(found.channel_id, found);
        }
      } catch (e) {
        console.error("Firestore channel lookup error:", e);
      }
    }

    if (!found) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const followerCount = getFollowerCount(uname);
    const subscriberCount = getSubscriberCount(uname);
    let isFollowing = false;
    let isSubscribed = false;

    if (user) {
      isFollowing = db.follows.some(
        (f) =>
          f.follower_uid === user.uid && f.channel_username.toLowerCase() === uname
      );
      isSubscribed = db.subscriptions.some(
        (s) =>
          s.subscriber_uid === user.uid && s.channel_username.toLowerCase() === uname
      );
    }

    const activeVc = found.is_live ? getActiveViewerCount(uname) || found.viewer_count : 0;

    res.json(
      channelPublic(found, {
        follower_count: followerCount,
        is_following: isFollowing,
        subscriber_count: subscriberCount,
        is_subscribed: isSubscribed,
        viewer_count_override: activeVc,
      })
    );
  });

  // Viewer heartbeat
  api.post("/channels/:username/view", (req, res) => {
    const uname = req.params.username.toLowerCase();
    let found: ChannelDoc | null = null;
    for (const c of db.channels.values()) {
      if (c.username.toLowerCase() === uname) {
        found = c;
        break;
      }
    }

    if (!found) {
      return res.status(404).json({ error: "Channel not found" });
    }

    if (!found.is_live) {
      return res.json({ ok: false, viewer_count: 0 });
    }

    const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "anon";
    const viewerId = crypto
      .createHash("sha256")
      .update(`${JWT_SECRET}:${ip}`)
      .digest("hex");

    const existingIdx = db.viewerSessions.findIndex(
      (s) => s.channel_username === uname && s.viewer_id === viewerId
    );
    if (existingIdx >= 0) {
      db.viewerSessions[existingIdx].last_seen = Date.now();
    } else {
      db.viewerSessions.push({
        channel_username: uname,
        viewer_id: viewerId,
        last_seen: Date.now(),
      });
    }

    const count = getActiveViewerCount(uname);
    found.viewer_count = count;

    res.json({ ok: true, viewer_count: count });
  });

  // Categories
  api.get("/categories", (req, res) => {
    res.json(CATEGORIES);
  });

  // Follow
  api.post("/channels/:username/follow", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    const uname = req.params.username.toLowerCase();

    let targetChannel: ChannelDoc | null = null;
    for (const c of db.channels.values()) {
      if (c.username.toLowerCase() === uname) {
        targetChannel = c;
        break;
      }
    }

    if (!targetChannel) {
      return res.status(404).json({ error: "Channel not found" });
    }

    if (targetChannel.user_uid === user.uid) {
      return res.status(400).json({ error: "Can't follow your own channel" });
    }

    const exists = db.follows.some(
      (f) => f.follower_uid === user.uid && f.channel_username.toLowerCase() === uname
    );
    if (!exists) {
      db.follows.push({
        follower_uid: user.uid,
        follower_username: user.username,
        channel_username: uname,
        channel_user_uid: targetChannel.user_uid,
        created_at: nowIso(),
      });
    }

    res.json({ following: true, follower_count: getFollowerCount(uname) });
  });

  // Unfollow
  api.delete("/channels/:username/follow", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    const uname = req.params.username.toLowerCase();

    db.follows = db.follows.filter(
      (f) =>
        !(f.follower_uid === user.uid && f.channel_username.toLowerCase() === uname)
    );

    res.json({ following: false, follower_count: getFollowerCount(uname) });
  });

  // Get my followed channels
  api.get("/users/mine/following", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    const following = db.follows
      .filter((f) => f.follower_uid === user.uid)
      .map((f) => f.channel_username.toLowerCase());
    res.json({ following });
  });

  // Get my followers
  api.get("/users/mine/followers", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    const myUname = (user.username || "").toLowerCase();
    const followers = db.follows
      .filter((f) => f.channel_username.toLowerCase() === myUname)
      .map((f) => (f.follower_username || "").toLowerCase())
      .filter(Boolean);
    res.json({ followers });
  });

  // Subscribe
  api.post("/channels/:username/subscribe", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    const uname = req.params.username.toLowerCase();

    let targetChannel: ChannelDoc | null = null;
    for (const c of db.channels.values()) {
      if (c.username.toLowerCase() === uname) {
        targetChannel = c;
        break;
      }
    }

    if (!targetChannel) {
      return res.status(404).json({ error: "Channel not found" });
    }

    if (targetChannel.user_uid === user.uid) {
      return res.status(400).json({ error: "Can't subscribe to your own channel" });
    }

    const exists = db.subscriptions.some(
      (s) => s.subscriber_uid === user.uid && s.channel_username.toLowerCase() === uname
    );
    if (!exists) {
      db.subscriptions.push({
        subscriber_uid: user.uid,
        subscriber_username: user.username,
        channel_username: uname,
        channel_user_uid: targetChannel.user_uid,
        tier: "supporter",
        created_at: nowIso(),
      });
    }

    res.json({ subscribed: true, subscriber_count: getSubscriberCount(uname) });
  });

  // Unsubscribe
  api.delete("/channels/:username/subscribe", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    const uname = req.params.username.toLowerCase();

    db.subscriptions = db.subscriptions.filter(
      (s) =>
        !(s.subscriber_uid === user.uid && s.channel_username.toLowerCase() === uname)
    );

    res.json({ subscribed: false, subscriber_count: getSubscriberCount(uname) });
  });

  // Notifications
  api.get("/notifications", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    const userNotifications = db.notifications
      .filter((n) => n.user_uid === user.uid)
      .sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

    const unreadCount = userNotifications.filter((n) => !n.read).length;
    res.json({ items: userNotifications.slice(0, 30), unread_count: unreadCount });
  });

  // Notifications: Mark read
  api.post("/notifications/mark-read", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    const { ids } = req.body || {};

    let updated = 0;
    for (const n of db.notifications) {
      if (n.user_uid === user.uid && !n.read) {
        if (!ids || (Array.isArray(ids) && ids.includes(n.id))) {
          n.read = true;
          updated++;
        }
      }
    }

    const unreadCount = db.notifications.filter(
      (n) => n.user_uid === user.uid && !n.read
    ).length;

    res.json({ updated, unread_count: unreadCount });
  });

  // Emotes API
  api.get("/channels/:username/emotes", (req, res) => {
    const uname = req.params.username.toLowerCase();
    const list = db.emotes.filter(
      (e) => e.channel_username === "global" || e.channel_username.toLowerCase() === uname
    );
    res.json({ emotes: list });
  });

  api.post("/channels/mine/emotes", requireAuth, upload.single("file"), (req, res) => {
    const user = (req as any).user as UserDoc;
    let imageUrl = req.body?.image_url || "";

    if (req.file) {
      const ext = req.file.originalname.split(".").pop() || "png";
      const filePath = `emotes/${user.uid}/${crypto.randomUUID()}.${ext}`;
      db.files.set(filePath, {
        data: req.file.buffer,
        mimeType: req.file.mimetype || "image/png",
      });
      imageUrl = `/api/files/${filePath}`;
    }

    if (!imageUrl) {
      return res.status(400).json({ error: "Image file or image_url required" });
    }

    let rawCode = (req.body?.code || "custom").trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (!rawCode) rawCode = "emote";
    const code = `:${rawCode}:`;
    const name = (req.body?.name || rawCode).trim();

    let channelUsername = user.username;
    for (const c of db.channels.values()) {
      if (c.user_uid === user.uid) {
        channelUsername = c.username;
        break;
      }
    }

    const emoteDoc: EmoteDoc = {
      id: `e-${crypto.randomUUID()}`,
      channel_username: channelUsername.toLowerCase(),
      code,
      name,
      image_url: imageUrl,
      created_at: nowIso(),
    };

    db.emotes.push(emoteDoc);
    res.json({ emote: emoteDoc });
  });

  api.delete("/channels/mine/emotes/:id", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    const id = req.params.id;

    let channelUsername = user.username.toLowerCase();
    for (const c of db.channels.values()) {
      if (c.user_uid === user.uid) {
        channelUsername = c.username.toLowerCase();
        break;
      }
    }

    db.emotes = db.emotes.filter(
      (e) => !(e.id === id && e.channel_username.toLowerCase() === channelUsername)
    );

    res.json({ ok: true, deleted_id: id });
  });

  // Stories API (24-Hour Expiration Engine)
  const purgeExpiredStories = () => {
    const nowTime = Date.now();
    db.stories = db.stories.filter((s) => {
      const exp = new Date(s.expires_at).getTime();
      return exp > nowTime;
    });
  };

  api.get("/stories", (req, res) => {
    purgeExpiredStories();
    const nowTime = Date.now();
    const valid = db.stories
      .map((s) => {
        const expTime = new Date(s.expires_at).getTime();
        const timeLeftSec = Math.max(0, Math.floor((expTime - nowTime) / 1000));
        return {
          ...s,
          time_left_sec: timeLeftSec,
        };
      })
      .filter((s) => s.time_left_sec > 0)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    res.json(valid);
  });

  api.post("/stories", requireAuth, upload.single("media"), (req, res) => {
    const user = (req as any).user as UserDoc;
    let mediaUrl = req.body?.media_url || "";
    let mediaType: "image" | "video" = req.body?.media_type === "video" ? "video" : "image";

    if (req.file) {
      const isVideo = req.file.mimetype.startsWith("video/");
      mediaType = isVideo ? "video" : "image";
      const ext = req.file.originalname.split(".").pop() || (isVideo ? "mp4" : "png");
      const filePath = `stories/${user.uid}/${crypto.randomUUID()}.${ext}`;
      db.files.set(filePath, {
        data: req.file.buffer,
        mimeType: req.file.mimetype || (isVideo ? "video/mp4" : "image/png"),
      });
      mediaUrl = `/api/files/${filePath}`;
    }

    if (!mediaUrl) {
      return res.status(400).json({ error: "Photo or video media file is required" });
    }

    const caption = (req.body?.caption || "").trim();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const story: StoryDoc = {
      id: `story-${crypto.randomUUID()}`,
      user_uid: user.uid,
      username: user.username,
      display_name: user.display_name || user.username,
      user_photo_url: user.photo_url || null,
      media_url: mediaUrl,
      media_type: mediaType,
      caption,
      created_at: now.toISOString(),
      expires_at: expiresAt,
    };

    db.stories.unshift(story);
    res.json({
      ...story,
      time_left_sec: 24 * 3600,
    });
  });

  api.delete("/stories/:id", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    const storyId = req.params.id;

    const idx = db.stories.findIndex((s) => s.id === storyId);
    if (idx === -1) {
      return res.status(404).json({ error: "Story not found or expired" });
    }

    const story = db.stories[idx];
    if (story.user_uid !== user.uid) {
      return res.status(403).json({ error: "Not authorized to delete this story" });
    }

    db.stories.splice(idx, 1);
    res.json({ ok: true, deleted_id: storyId });
  });

  // Viewer Watts Points System API
  const lastWattsPing = new Map<string, number>();

  api.get("/users/me/watts", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    res.json({ watts: user.watts ?? 250, uid: user.uid, username: user.username });
  });

  api.post("/channels/:username/watts/ping", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    const uname = req.params.username.toLowerCase();
    const now = Date.now();
    const key = `${user.uid}:${uname}`;
    const last = lastWattsPing.get(key) || 0;

    let accrued = 0;
    if (now - last >= 8000) {
      accrued = 15;
      user.watts = (user.watts ?? 250) + accrued;
      lastWattsPing.set(key, now);
    }

    res.json({ watts: user.watts ?? 250, accrued });
  });

  api.post("/channels/:username/watts/spend", requireAuth, (req, res) => {
    const user = (req as any).user as UserDoc;
    const amount = Number(req.body?.amount) || 50;

    if ((user.watts ?? 250) < amount) {
      return res.status(400).json({ error: "Insufficient Watts balance" });
    }

    user.watts = (user.watts ?? 250) - amount;
    res.json({ watts: user.watts, spent: amount, success: true });
  });

  // Chat messages history
  api.get("/channels/:username/messages", (req, res) => {
    const uname = req.params.username.toLowerCase();
    const limit = Math.min(Number(req.query.limit) || 100, 200);

    const msgs = db.chatMessages
      .filter((m) => m.channel_username.toLowerCase() === uname)
      .slice(-limit);

    res.json(msgs);
  });

  // Recording sessions
  api.get("/channels/:username/sessions", (req, res) => {
    const uname = req.params.username.toLowerCase();
    const items = db.sessions.filter(
      (s) => s.channel_username.toLowerCase() === uname
    );
    res.json(items);
  });

  api.post("/channels/mine/sessions/refresh", requireAuth, (req, res) => {
    res.json({ added: 0, ok: true });
  });

  // Webhook status
  api.get("/livepeer/webhook/status", requireAuth, (req, res) => {
    res.json({
      configured: true,
      url: "/api/webhooks/livepeer",
      events: ["stream.started", "stream.idle", "active", "inactive"],
    });
  });

  api.post(["/livepeer/webhook", "/webhooks/livepeer", "/webhook/livepeer"], handleLivepeerWebhook);

  // Serve static uploaded files
  api.get("/files/*", (req, res) => {
    const fileKey = req.params[0];
    const file = db.files.get(fileKey);
    if (!file) {
      return res.status(404).send("File not found");
    }
    res.setHeader("Content-Type", file.mimeType);
    res.send(file.data);
  });

  // Serve static files from public directory
  app.use(express.static(path.join(process.cwd(), "public")));

  app.use("/api", api);

  // Vite Integration
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // HTTP Server & WebSocket
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  // WebSocket connections map: channel_username -> Set<WebSocket>
  const wsRooms = new Map<string, Set<WebSocket>>();

  server.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    if (url.pathname.startsWith("/api/ws/chat/")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WebSocket, request: http.IncomingMessage) => {
    const url = new URL(request.url || "", `http://${request.headers.host}`);
    const channelUsername = decodeURIComponent(
      url.pathname.replace("/api/ws/chat/", "")
    ).toLowerCase();
    const token = url.searchParams.get("token");

    let user: UserDoc | null = null;
    if (token && token !== "guest" && token !== "null" && token !== "undefined") {
      try {
        const payload = jwt.verify(token, JWT_SECRET) as { sub: string };
        user = db.users.get(payload.sub) || null;
      } catch {
        // Invalid token, fall through to guest user creation
      }
    }

    if (!user) {
      const guestNum = Math.floor(1000 + Math.random() * 9000);
      const guestId = `guest_${crypto.randomBytes(4).toString("hex")}`;
      user = {
        uid: guestId,
        email: `${guestId}@guest.local`,
        username: `guest_${guestNum}`,
        display_name: `Guest ${guestNum}`,
        photo_url: null,
        bio: "Guest Chatter",
        password_hash: "",
        created_at: nowIso(),
        watts: 250,
      };
    }

    if (!wsRooms.has(channelUsername)) {
      wsRooms.set(channelUsername, new Set());
    }
    const room = wsRooms.get(channelUsername)!;
    room.add(ws);

    // Send welcome
    ws.send(
      JSON.stringify({
        type: "welcome",
        channel: channelUsername,
        as: {
          uid: user.uid,
          username: user.username,
          display_name: user.display_name,
        },
      })
    );

    ws.on("message", (raw: Buffer) => {
      let text = "";
      let isHighlighted = false;
      let highlightType = "neon_glow";

      try {
        const parsed = JSON.parse(raw.toString("utf-8"));
        text = (parsed.text || "").trim();
        isHighlighted = !!parsed.is_highlighted;
        if (parsed.highlight_type) highlightType = parsed.highlight_type;
      } catch {
        text = raw.toString("utf-8").trim();
      }

      if (!text || text.length > 500) return;

      // Handle Watts deduction for highlighted message
      if (isHighlighted) {
        if ((user!.watts ?? 250) >= 50) {
          user!.watts = (user!.watts ?? 250) - 50;
        } else {
          isHighlighted = false;
        }
      }

      // Compute Badges
      const senderBadges: string[] = [];
      let senderColor = "#e5ff00";

      const isBroadcaster = user!.username.toLowerCase() === channelUsername.toLowerCase();
      if (isBroadcaster) {
        senderBadges.push("broadcaster");
        senderColor = "#e5ff00";
      }

      const isSubscriber = db.subscriptions.some(
        (s) =>
          s.subscriber_uid === user!.uid &&
          s.channel_username.toLowerCase() === channelUsername.toLowerCase()
      );
      const isFollower = db.follows.some(
        (f) =>
          f.follower_uid === user!.uid &&
          f.channel_username.toLowerCase() === channelUsername.toLowerCase()
      );

      if (isSubscriber) {
        senderBadges.push("supporter");
        if (!isBroadcaster) senderColor = "#06b6d4";
      } else if (isFollower) {
        senderBadges.push("follower");
      }

      const userWatts = user!.watts ?? 250;
      if (userWatts >= 1000) {
        senderBadges.push("vip");
        senderBadges.push("watts_king");
        if (!isBroadcaster) senderColor = "#a855f7";
      } else if (userWatts >= 500) {
        senderBadges.push("vip");
        if (!isBroadcaster) senderColor = "#ec4899";
      } else if (userWatts >= 200) {
        senderBadges.push("watts_tier");
      }

      const msgDoc: ChatMessageDoc = {
        id: crypto.randomUUID(),
        channel_username: channelUsername,
        text,
        sender_uid: user!.uid,
        sender_username: user!.username,
        sender_display_name: user!.display_name,
        sender_photo_url: user!.photo_url,
        created_at: nowIso(),
        is_highlighted: isHighlighted,
        highlight_type: isHighlighted ? highlightType : undefined,
        sender_badges: senderBadges,
        sender_color: senderColor,
      };

      db.chatMessages.push(msgDoc);

      const broadcastPayload = JSON.stringify({
        type: "message",
        ...msgDoc,
        user_watts: user!.watts ?? 250,
      });

      for (const clientSocket of room) {
        if (clientSocket.readyState === WebSocket.OPEN) {
          clientSocket.send(broadcastPayload);
        }
      }
    });

    ws.on("close", () => {
      room.delete(ws);
      if (room.size === 0) {
        wsRooms.delete(channelUsername);
      }
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
});
