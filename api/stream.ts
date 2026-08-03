import { app, setupPromise } from "../server.js";

export default async function handler(req: any, res: any) {
  // Direct CORS and method-allow headers
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization"
  );

  // Prevent Vercel's edge network from blocking preflight options
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Warm up and await server routes setup
  await setupPromise;

  // Process through express app router
  return app(req, res);
}
