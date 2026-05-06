/**
 * npm registry public search. No API key required.
 */

type NPMSearchEntry = {
  package: {
    name: string;
    version?: string;
    description?: string;
    keywords?: string[];
    publisher?: { username?: string };
    links?: { npm?: string; homepage?: string };
  };
  score?: { final?: number };
};

export type NpmSearchResult =
  | {
      ok: true;
      items: Array<{
        name: string;
        version: string;
        description: string;
        score: number;
        url: string;
      }>;
    }
  | { ok: false; error: string };

export async function searchPackages(query: string, limit = 5): Promise<NpmSearchResult> {
  try {
    const url = `https://registry.npmjs.org/-/v1/search?text=${encodeURIComponent(query)}&size=${limit}`;
    const res = await fetch(url);
    if (!res.ok) return { ok: false, error: `npm HTTP ${res.status}` };
    const data = (await res.json()) as { objects: NPMSearchEntry[] };
    return {
      ok: true,
      items: (data.objects ?? []).slice(0, limit).map((o) => ({
        name: o.package.name,
        version: o.package.version ?? '',
        description: o.package.description ?? '',
        score: o.score?.final ?? 0,
        url: o.package.links?.npm ?? `https://npmjs.com/package/${o.package.name}`,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
