import serverPromise from "../server.ts";

export default async (req, res) => {
  const app = await serverPromise;
  return app(req, res);
};
