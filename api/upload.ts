import { app, setupPromise } from "../server";

export default async function handler(req: any, res: any) {
  await setupPromise;
  return app(req, res);
}
