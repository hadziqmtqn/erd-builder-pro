import { ADMIN_EMAIL } from "./lib/edge-config";

export const config = {
  runtime: "edge",
};

export default async function handler() {
  return new Response(JSON.stringify({ adminEmail: ADMIN_EMAIL }), {
    status: 200,
    headers: {
      "content-type": "application/json",
    },
  });
}
