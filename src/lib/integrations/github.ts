/**
 * GitHub public API integration. Works without a token (60 req/hour),
 * better with GITHUB_TOKEN (5000 req/hour).
 */

type GHSearchRepoItem = {
  full_name: string;
  description: string | null;
  stargazers_count: number;
  html_url: string;
  language: string | null;
  updated_at: string;
};

function ghHeaders(): HeadersInit {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

export type RepoSearchResult =
  | { ok: true; items: Array<{ name: string; description: string; stars: number; lang: string; url: string }> }
  | { ok: false; error: string };

export async function searchRepos(query: string, limit = 5): Promise<RepoSearchResult> {
  try {
    const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=${limit}`;
    const res = await fetch(url, { headers: ghHeaders() });
    if (!res.ok) return { ok: false, error: `GitHub HTTP ${res.status}` };
    const data = (await res.json()) as { items: GHSearchRepoItem[] };
    return {
      ok: true,
      items: (data.items ?? []).slice(0, limit).map((r) => ({
        name: r.full_name,
        description: r.description ?? '',
        stars: r.stargazers_count ?? 0,
        lang: r.language ?? '',
        url: r.html_url,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type RepoReadmeResult =
  | { ok: true; content: string; truncated: boolean }
  | { ok: false; error: string };

export async function getRepoReadme(owner: string, repo: string, maxChars = 4000): Promise<RepoReadmeResult> {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/readme`;
    const res = await fetch(url, {
      headers: { ...ghHeaders(), Accept: 'application/vnd.github.raw' },
    });
    if (!res.ok) return { ok: false, error: `GitHub HTTP ${res.status}` };
    const text = await res.text();
    const truncated = text.length > maxChars;
    return { ok: true, content: text.slice(0, maxChars), truncated };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
