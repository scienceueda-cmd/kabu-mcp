process.env.MCP_PATH_SECRET = "a".repeat(32);
process.env.FINNHUB_API_KEY = "test-key";
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const u = new URL(String(input));
  if (u.hostname !== "finnhub.io") return realFetch(input, init);
  if (init?.headers?.["X-Finnhub-Token"] !== "test-key") return new Response("no", { status: 401 });
  const p = u.pathname.replace("/api/v1", "");
  const body: any = {
    "/quote": u.searchParams.get("symbol") === "ZZZZ" ? { c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0 }
      : { c: 93.65, d: 3.18, dp: 3.52, h: 94.1, l: 90.2, o: 90.6, pc: 90.47, t: 1761595200 },
    "/company-news": [{ datetime: 1761590000, headline: "Intel upgraded", source: "X", summary: "s", url: "https://e.com" }],
    "/calendar/earnings": { earningsCalendar: [{ date: "2026-10-29", hour: "amc", symbol: "INTC", year: 2026, quarter: 3, epsEstimate: 0.4, epsActual: null, revenueEstimate: 16.5e9, revenueActual: null }] },
    "/stock/market-status": { exchange: "US", isOpen: false, session: "pre-market", holiday: null, t: 1761595200, timezone: "America/New_York" },
  }[p];
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}) as any;

const { default: handler } = await import("../netlify/functions/mcp.ts");
const H = { "content-type": "application/json", accept: "application/json, text/event-stream" };
let id = 0;
async function rpc(method: string, params: any, secret: string | undefined = "a".repeat(32), headers: any = {}) {
  const req = new Request("https://x/mcp", { method: "POST", headers: { ...H, ...headers }, body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) });
  const res = await handler(req, { params: secret ? { secret } : {} } as any);
  return { status: res.status, body: res.status === 200 ? await res.json() : await res.text() };
}
const out = (l: string, v: any) => console.log(`--- ${l}\n`, typeof v === "string" ? v : JSON.stringify(v).slice(0, 700));
out("init", await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } }));
out("list", (await rpc("tools/list", {})).body.result.tools.map((t: any) => t.name));
out("quotes", await rpc("tools/call", { name: "get_quotes", arguments: { symbols: ["intc", "ZZZZ"] } }));
out("news", await rpc("tools/call", { name: "get_company_news", arguments: { symbol: "INTC" } }));
out("earnings", await rpc("tools/call", { name: "get_earnings_calendar", arguments: { symbol: "INTC" } }));
out("status", await rpc("tools/call", { name: "get_market_status", arguments: {} }));
out("bad input", await rpc("tools/call", { name: "get_quotes", arguments: { symbols: ["bad ticker!"] } }));
out("wrong secret", await rpc("tools/list", {}, "b".repeat(32)));
out("no secret", await rpc("tools/list", {}, ""));
out("bearer ok", (await rpc("tools/list", {}, "", { authorization: "Bearer " + "a".repeat(32) })).status);
process.env.FINNHUB_API_KEY = "wrong";
out("bad key", await rpc("tools/call", { name: "get_quotes", arguments: { symbols: ["INTC"] } }));
const g = await handler(new Request("https://x/mcp", { method: "GET" }), { params: { secret: "a".repeat(32) } } as any);
out("GET", g.status);
