import { API_BASE_URL } from "./api";
import type { StreamEvent } from "./types";

type Handlers = {
  onEvent: (event: StreamEvent) => void;
  onOpen?: () => void;
  onError?: (message: string) => void;
};

const DEFAULT_TYPES = [
  "task.created",
  "task.updated",
  "task.status_changed",
  "comment.created",
  "document.created",
  "activity.created",
  "activity_log.created",
  "agent.liveness"
];

function streamUrl(): string {
  const base = API_BASE_URL || window.location.origin;
  const url = new URL("/api/stream", base);
  url.searchParams.set("types", DEFAULT_TYPES.join(","));
  return url.toString();
}

export function connectStream(handlers: Handlers): () => void {
  let closed = false;
  let source: EventSource | null = null;
  let retries = 0;

  const open = () => {
    if (closed) {
      return;
    }

    source = new EventSource(streamUrl());

    source.onopen = () => {
      retries = 0;
      handlers.onOpen?.();
    };

    source.onerror = () => {
      source?.close();
      source = null;
      if (closed) {
        return;
      }

      const delayMs = Math.min(1000 * 2 ** retries, 10000);
      retries += 1;
      handlers.onError?.(`SSE disconnected; reconnecting in ${delayMs}ms`);
      window.setTimeout(open, delayMs);
    };

    for (const type of [...DEFAULT_TYPES, "keepalive"]) {
      source.addEventListener(type, (raw) => {
        const event = raw as MessageEvent<string>;
        try {
          const parsed = JSON.parse(event.data) as Record<string, unknown>;
          if (type === "keepalive") {
            handlers.onEvent({
              type: "keepalive",
              ts: typeof parsed.ts === "string" ? parsed.ts : new Date().toISOString(),
              payload: {}
            });
            return;
          }
          handlers.onEvent({
            type: typeof parsed.type === "string" ? parsed.type : type,
            ts: typeof parsed.ts === "string" ? parsed.ts : new Date().toISOString(),
            payload: (parsed.payload ?? {}) as Record<string, unknown>
          });
        } catch {
          handlers.onError?.(`Failed to parse SSE payload for ${type}`);
        }
      });
    }
  };

  open();

  return () => {
    closed = true;
    source?.close();
    source = null;
  };
}
