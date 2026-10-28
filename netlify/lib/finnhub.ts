// Thin Finnhub REST client. The API key lives only in a Netlify env var.
const BASE = "https://finnhub.io/api/v1";

export class FinnhubError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

function apiKey(): string {
  const key =
    (globalThis as any).Netlify?.env?.get("FINNHUB_API_KEY") ?? process.env.FINNHUB_API_KEY;
  if (!key) throw new FinnhubError("FINNHUB_API_KEY is not set on the server.");
  return key;
}

export async function finnhub<T = unknown>(
  path: string,
  params: Record<string, string | undefined> = {},
): Promise<T> {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") url.searchParams.set(k, v);

  const res = await fetch(url, {
    headers: { "X-Finnhub-Token": apiKey() },
    signal: AbortSignal.timeout(8000),
  });

  if (res.status === 429) throw new FinnhubError("Finnhub rate limit hit (free tier: ~60 calls/min). Try again shortly.", 429);
  if (res.status === 401 || res.status === 403)
    throw new FinnhubError(`Finnhub refused the request (${res.status}). The key may be invalid, or this endpoint needs a paid plan.`, res.status);
  if (!res.ok) throw new FinnhubError(`Finnhub error ${res.status}: ${(await res.text()).slice(0, 200)}`, res.status);

  return (await res.json()) as T;
}

/** Unix seconds -> { utc ISO, JST human string } */
export function ts(sec: number | null | undefined) {
  if (!sec) return null;
  const d = new Date(sec * 1000);
  return {
    utc: d.toISOString(),
    jst: d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", hour12: false }),
  };
}

export const ymd = (d: Date) => d.toISOString().slice(0, 10);
