import type { FastifyInstance } from "fastify";
import { getCurrentItem, getQueueItems } from "../db/queue.repo.js";

let currentDjStatus: "idle" | "thinking" | "speaking" | "playing" = "idle";

export function setDjStatus(status: "idle" | "thinking" | "speaking" | "playing") {
  currentDjStatus = status;
}

export function getDjStatus() {
  return currentDjStatus;
}

export function getCurrentState() {
  return {
    nowPlaying: getCurrentItem() ?? null,
    queue: getQueueItems(),
    scene: "default",
    djStatus: currentDjStatus,
  };
}

export async function nowRoutes(app: FastifyInstance) {
  app.get("/api/now", async () => {
    return getCurrentState();
  });
}
