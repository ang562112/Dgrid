/**
 * Vercel REST API integration. Requires VERCEL_TOKEN environment variable
 * (https://vercel.com/account/tokens). Read-only operations only — destructive
 * actions are intentionally omitted until a human-approval gate exists.
 */

const VERCEL_BASE = 'https://api.vercel.com';

function vercelHeaders(): HeadersInit {
  return {
    Authorization: `Bearer ${process.env.VERCEL_TOKEN ?? ''}`,
    'Content-Type': 'application/json',
  };
}

export function isVercelEnabled(): boolean {
  return Boolean(process.env.VERCEL_TOKEN);
}

export type DeploymentSummary = {
  uid: string;
  name: string;
  url: string;
  state: string;
  target: string | null;
  created: number;
  source: string | null;
};

export type ListDeploymentsResult =
  | { ok: true; items: DeploymentSummary[] }
  | { ok: false; error: string };

export async function listDeployments(limit = 10): Promise<ListDeploymentsResult> {
  if (!isVercelEnabled()) return { ok: false, error: 'VERCEL_TOKEN 미설정' };
  try {
    const teamParam = process.env.VERCEL_TEAM_ID ? `&teamId=${process.env.VERCEL_TEAM_ID}` : '';
    const res = await fetch(`${VERCEL_BASE}/v6/deployments?limit=${limit}${teamParam}`, {
      headers: vercelHeaders(),
    });
    if (!res.ok) return { ok: false, error: `Vercel HTTP ${res.status}: ${await res.text().catch(() => '')}` };
    const data = (await res.json()) as {
      deployments: Array<{
        uid: string;
        name: string;
        url: string;
        state: string;
        target?: string | null;
        created: number;
        source?: string | null;
      }>;
    };
    return {
      ok: true,
      items: (data.deployments ?? []).map((d) => ({
        uid: d.uid,
        name: d.name,
        url: d.url,
        state: d.state,
        target: d.target ?? null,
        created: d.created,
        source: d.source ?? null,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type GetDeploymentResult =
  | {
      ok: true;
      deployment: {
        uid: string;
        name: string;
        url: string;
        state: string;
        target: string | null;
        readyState: string;
        buildErrorAt?: number;
        createdAt: number;
      };
    }
  | { ok: false; error: string };

export async function getDeployment(idOrUrl: string): Promise<GetDeploymentResult> {
  if (!isVercelEnabled()) return { ok: false, error: 'VERCEL_TOKEN 미설정' };
  try {
    const teamParam = process.env.VERCEL_TEAM_ID ? `?teamId=${process.env.VERCEL_TEAM_ID}` : '';
    const res = await fetch(`${VERCEL_BASE}/v13/deployments/${encodeURIComponent(idOrUrl)}${teamParam}`, {
      headers: vercelHeaders(),
    });
    if (!res.ok) return { ok: false, error: `Vercel HTTP ${res.status}` };
    const d = (await res.json()) as {
      uid: string;
      name: string;
      url: string;
      state?: string;
      target?: string | null;
      readyState?: string;
      buildErrorAt?: number;
      createdAt?: number;
    };
    return {
      ok: true,
      deployment: {
        uid: d.uid,
        name: d.name,
        url: d.url,
        state: d.state ?? d.readyState ?? 'UNKNOWN',
        target: d.target ?? null,
        readyState: d.readyState ?? '',
        buildErrorAt: d.buildErrorAt,
        createdAt: d.createdAt ?? Date.now(),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export type ListProjectsResult =
  | { ok: true; items: Array<{ id: string; name: string; framework: string | null; updatedAt: number }> }
  | { ok: false; error: string };

export async function listProjects(limit = 10): Promise<ListProjectsResult> {
  if (!isVercelEnabled()) return { ok: false, error: 'VERCEL_TOKEN 미설정' };
  try {
    const teamParam = process.env.VERCEL_TEAM_ID ? `&teamId=${process.env.VERCEL_TEAM_ID}` : '';
    const res = await fetch(`${VERCEL_BASE}/v9/projects?limit=${limit}${teamParam}`, {
      headers: vercelHeaders(),
    });
    if (!res.ok) return { ok: false, error: `Vercel HTTP ${res.status}` };
    const data = (await res.json()) as {
      projects: Array<{ id: string; name: string; framework?: string | null; updatedAt?: number }>;
    };
    return {
      ok: true,
      items: (data.projects ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        framework: p.framework ?? null,
        updatedAt: p.updatedAt ?? 0,
      })),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
