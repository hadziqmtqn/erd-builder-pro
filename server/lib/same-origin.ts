/** True when a browser Origin names the scheme and host the request was sent to, so the request is not cross-origin. */
export function isSameHostOrigin(origin: string | undefined, host: string | undefined, protocol: string): boolean {
  if (!origin || !host) return false;
  try {
    const url = new URL(origin);
    if (url.host.toLowerCase() !== host.toLowerCase()) return false;
    // An https page is trusted even when a TLS-terminating proxy (nginx by default) sends no X-Forwarded-Proto.
    return url.protocol === `${protocol}:` || url.protocol === "https:";
  } catch {
    return false;
  }
}
