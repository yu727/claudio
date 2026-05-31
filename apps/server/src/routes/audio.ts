import type { FastifyInstance } from "fastify";

export async function audioRoutes(app: FastifyInstance) {
  const ncmBaseUrl = process.env.NCM_API_BASE_URL || "http://localhost:3000";

  app.get("/api/audio", async (request, reply) => {
    const { id, title, artist, br } = request.query as {
      id?: string;
      title?: string;
      artist?: string;
      br?: string;
    };

    if (!id) {
      return reply.code(400).send({ error: "Missing song id" });
    }

    const params = new URLSearchParams({ id });
    if (title) params.set("title", title);
    if (artist) params.set("artist", artist);
    if (br) params.set("br", br);

    try {
      const ncmRes = await fetch(`${ncmBaseUrl}/audio?${params.toString()}`, {
        signal: AbortSignal.timeout(60000),
      });

      if (!ncmRes.ok) {
        return reply.code(ncmRes.status).send({ error: `NCM returned ${ncmRes.status}` });
      }

      // Stream audio directly to client (no buffering)
      const contentType = ncmRes.headers.get("content-type") || "audio/mpeg";
      const contentLength = ncmRes.headers.get("content-length");

      reply.header("Content-Type", contentType);
      reply.header("Access-Control-Allow-Origin", "*");
      reply.header("Accept-Ranges", "bytes");
      reply.header("Cache-Control", "public, max-age=3600");
      if (contentLength) {
        reply.header("Content-Length", contentLength);
      }

      // Pipe the response body directly
      if (ncmRes.body) {
        const reader = ncmRes.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            reply.raw.write(value);
          }
          reply.raw.end();
        };
        await pump();
      } else {
        return reply.code(500).send({ error: "No response body" });
      }
    } catch (err) {
      request.log.error(err, "Audio proxy error");
      return reply.code(500).send({ error: "Audio proxy failed" });
    }
  });
}
