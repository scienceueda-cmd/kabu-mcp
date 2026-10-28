import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { finnhub, FinnhubError, ts, ymd } from "./finnhub.js";

type Quote = { c: number; d: number | null; dp: number | null; h: number; l: number; o: number; pc: number; t: number };
type News = { datetime: number; headline: string; source: string; summary: string; url: string };
type Earnings = {
  earningsCalendar: {
    date: string; hour: string; symbol: string; year: number; quarter: number;
    epsEstimate: number | null; epsActual: number | null;
    revenueEstimate: number | null; revenueActual: number | null;
  }[];
};
type MarketStatus = { exchange: string; isOpen: boolean; session: string | null; holiday: string | null; t: number; timezone: string };

const json = (data: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }] });

async function safe(fn: () => Promise<ReturnType<typeof json>>) {
  try {
    return await fn();
  } catch (e) {
    const msg = e instanceof FinnhubError ? e.message : `Unexpected error: ${(e as Error).message}`;
    console.error("[stock-mcp]", msg);
    return { content: [{ type: "text" as const, text: msg }], isError: true };
  }
}

const symbol = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9.\-:]{1,15}$/, "US ticker like INTC, ARM, META")
  .describe("US stock ticker, e.g. INTC, ARM, META, NVDA");

export function buildServer() {
  const server = new McpServer({ name: "stock-mcp", version: "0.1.0" });

  server.registerTool(
    "get_quotes",
    {
      title: "Stock quotes",
      description:
        "Latest price for up to 10 US stocks via Finnhub: current price (USD), change vs previous close, % change, day open/high/low, previous close, and the quote time in UTC and JST. Read-only. Outside US trading hours the price is the last trade (usually the close).",
      inputSchema: { symbols: z.array(symbol).min(1).max(10).describe("Tickers to quote") },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ symbols }) =>
      safe(async () => {
        const rows = await Promise.all(
          symbols.map(async (s) => {
            const q = await finnhub<Quote>("/quote", { symbol: s });
            if (!q || (!q.c && !q.t)) return { symbol: s, error: "No data (unknown ticker or not covered)" };
            return {
              symbol: s,
              price: q.c,
              change: q.d,
              changePercent: q.dp,
              open: q.o,
              high: q.h,
              low: q.l,
              previousClose: q.pc,
              time: ts(q.t),
            };
          }),
        );
        return json({ source: "Finnhub /quote", quotes: rows });
      }),
  );

  server.registerTool(
    "get_company_news",
    {
      title: "Company news",
      description:
        "Recent news headlines for one US stock (newest first) with source, time (JST) and link. Use to explain why a stock moved. Read-only.",
      inputSchema: {
        symbol,
        days: z.number().int().min(1).max(14).default(3).describe("How many days back to search (1-14)"),
        limit: z.number().int().min(1).max(20).default(8).describe("Max headlines to return"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ symbol, days, limit }) =>
      safe(async () => {
        const to = new Date();
        const from = new Date(to.getTime() - days * 86400_000);
        const news = await finnhub<News[]>("/company-news", { symbol, from: ymd(from), to: ymd(to) });
        const items = (news ?? [])
          .sort((a, b) => b.datetime - a.datetime)
          .slice(0, limit)
          .map((n) => ({
            time: ts(n.datetime)?.jst,
            headline: n.headline,
            source: n.source,
            summary: n.summary?.slice(0, 300),
            url: n.url,
          }));
        return json({ symbol, from: ymd(from), to: ymd(to), count: items.length, news: items });
      }),
  );

  server.registerTool(
    "get_earnings_calendar",
    {
      title: "Earnings calendar",
      description:
        "Upcoming (or recent) earnings dates with EPS/revenue estimates and, once reported, actuals. hour: 'bmo' = before US open, 'amc' = after US close (next morning in Japan). Give a symbol to filter; defaults to today..+45 days. Read-only.",
      inputSchema: {
        symbol: symbol.optional(),
        from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("Start date YYYY-MM-DD (default: today)"),
        to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe("End date YYYY-MM-DD (default: +45 days)"),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async ({ symbol, from, to }) =>
      safe(async () => {
        const now = new Date();
        const f = from ?? ymd(now);
        const t = to ?? ymd(new Date(now.getTime() + 45 * 86400_000));
        const data = await finnhub<Earnings>("/calendar/earnings", { symbol, from: f, to: t });
        const rows = (data?.earningsCalendar ?? [])
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(0, 50);
        return json({ from: f, to: t, count: rows.length, earnings: rows });
      }),
  );

  server.registerTool(
    "get_market_status",
    {
      title: "US market status",
      description: "Whether the US stock market is open right now, which session (pre-market, regular, post-market) and any holiday. Read-only.",
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    async () =>
      safe(async () => {
        const s = await finnhub<MarketStatus>("/stock/market-status", { exchange: "US" });
        return json({ ...s, time: ts(s.t) });
      }),
  );

  return server;
}
