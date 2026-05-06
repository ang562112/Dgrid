/**
 * Tavily web search integration. Requires TAVILY_API_KEY
 * (https://app.tavily.com — 1000 free searches/month).
 */

export type TavilySearchResult =
  | {
      ok: true;
      answer: string;
      results: Array<{ title: string; url: string; snippet: string; score: number }>;
    }
  | { ok: false; error: string };

export function isTavilyEnabled(): boolean {
  return Boolean(process.env.TAVILY_API_KEY);
}

export async function webSearch(query: string, limit = 5): Promise<TavilySearchResult> {
  if (!isTavilyEnabled()) return { ok: false, error: 'TAVILY_API_KEY 미설정' };
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: process.env.TAVILY_API_KEY,
        query,
        max_results: limit,
        include_answer: true,
        search_depth: 'basic',
      }),
    });
    if (!res.ok) return { ok: false, error: `Tavily HTTP ${res.status}` };
    const data = (await res.json()) as {
      answer?: string;
      results?: Array<{ title: string; url: string; content: string; score: number }>;
    };
    return {
      ok: true,
      answer: data.answer ?? '',
      results: (data.results ?? []).slice(0, limit).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content,
        score: r.score,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
