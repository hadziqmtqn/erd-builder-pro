import dns from "node:dns/promises";
import net from "node:net";

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

function isPrivateIp(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (net.isIPv4(normalized)) return isPrivateIpv4(normalized);
  if (!net.isIPv6(normalized)) return false;

  if (normalized.startsWith("::ffff:")) {
    return isPrivateIpv4(normalized.slice(7));
  }

  return normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") ||
    normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
    normalized.startsWith("fea") || normalized.startsWith("feb");
}

/** Validate an AI endpoint before the server sends credentials to it. */
export async function safeAiBaseUrl(value: string | undefined, fallback: string): Promise<string> {
  const raw = (value || fallback).trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Invalid AI provider URL");
  }

  if (!/^https?:$/.test(url.protocol) || url.username || url.password || !url.hostname) {
    throw new Error("Invalid AI provider URL");
  }

  if (process.env.AI_ALLOW_PRIVATE_BASE_URL !== "true") {
    const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
    if (hostname === "localhost" || hostname.endsWith(".localhost") || isPrivateIp(hostname)) {
      throw new Error("Private AI provider URLs are disabled");
    }

    try {
      const addresses = await dns.lookup(hostname, { all: true });
      if (addresses.some(({ address }) => isPrivateIp(address))) {
        throw new Error("Private AI provider URLs are disabled");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "Private AI provider URLs are disabled") throw error;
      throw new Error("AI provider host could not be resolved");
    }
  }

  return url.toString().replace(/\/+$/, "");
}
