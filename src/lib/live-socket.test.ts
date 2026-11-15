import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./api", () => ({ getApiBaseUrl: () => "" }));

class FakeSocket {
  static all: FakeSocket[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((message: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(public url: string) { FakeSocket.all.push(this); }
  close() {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }
}

const { openLiveSocket } = await import("./live-socket");

describe("openLiveSocket (CLD-006, NOT-001.5)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.all = [];
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("document", { hidden: false, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    vi.stubGlobal("window", {
      location: { origin: "https://app.test" },
      setTimeout,
      clearTimeout,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("opens a wss URL for the path and passes parsed events on, ignoring anything that is not JSON", () => {
    const onEvent = vi.fn();
    const close = openLiveSocket("/api/notifications/live", {}, { onEvent, onReconnect: vi.fn() });
    const [socket] = FakeSocket.all;

    socket.onmessage?.({ data: "not json" });
    socket.onmessage?.({ data: JSON.stringify({ eventType: "notification.created", revision: "r1" }) });

    expect(socket.url).toBe("wss://app.test/api/notifications/live");
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith({ eventType: "notification.created", revision: "r1" });
    close();
  });

  it("reconnects after the server closes and reports the reconnect once the new socket opens", () => {
    const onReconnect = vi.fn();
    const close = openLiveSocket("/api/cloud/live-sync", { team_id: "team-1" }, { onEvent: vi.fn(), onReconnect });
    const first = FakeSocket.all[0];
    first.onopen?.();

    first.close();
    vi.advanceTimersByTime(999);
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    FakeSocket.all[1].onopen?.();

    expect(first.url).toBe("wss://app.test/api/cloud/live-sync?team_id=team-1");
    expect(onReconnect).toHaveBeenCalledTimes(1);
    close();
  });

  it("closes the socket and stops reconnecting on cleanup", () => {
    const close = openLiveSocket("/api/notifications/live", {}, { onEvent: vi.fn(), onReconnect: vi.fn() });

    close();
    vi.advanceTimersByTime(60_000);

    expect(FakeSocket.all).toHaveLength(1);
    expect(FakeSocket.all[0].closed).toBe(true);
  });
});
