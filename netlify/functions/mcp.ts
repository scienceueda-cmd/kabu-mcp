import type { Config, Context } from "@netlify/functions";
import { timingSafeEqual } from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { buildServer } from "../lib/server.js";

// Auth: claude.ai custom connectors can't send a static Authorization header,
// so the shared secret is carried in the URL path: /mcp/<MCP_PATH_SECRET>.
// A Bearer header with the same secret is also accepted (for Claude Code etc.).
function safeEq(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function authorized(req: Request, pathSecret: string | undefined): boolean {
  const expected = (globalThis as any).Netlify?.env?.get("MCP_PATH_SECRET") ?? process.env.MCP_PATH_SECRET;
  if (!expected || expected.length < 24) return false; // refuse to run with a weak/missing secret
  if (pathSecret && safeEq(pathSecret, expected)) return true;
  const bearer = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  return !!bearer && safeEq(bearer, expected);
}

export default async (req: Request, context: Context) => {
  if (!authorized(req, context.params?.secret)) return new Response("Not found", { status: 404 });

  // Stateless JSON-only server: GET would open an SSE stream a function can't hold.
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const server = buildServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(req);
};

export const config: Config = {
  path: ["/mcp/:secret", "/mcp"],
  rateLimit: { windowSize: 60, windowLimit: 60, aggregateBy: ["ip", "domain"] },
};
