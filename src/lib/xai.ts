import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

const XAI_BASE = 'https://api.x.ai/v1';

/* ─────────── Chat provider (OpenAI-compatible) ─────────── */

export const xai = createOpenAICompatible({
  name: 'xai',
  baseURL: XAI_BASE,
  apiKey: process.env.XAI_API_KEY,
});

/* ─────────── Image generation ─────────── */

export type GrokImageResult = { url: string } | { error: string };

type ImageGenResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
};

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${process.env.XAI_API_KEY ?? ''}`,
  };
}

function parseError(status: number, body: string): string {
  let detail = `HTTP ${status}`;
  try {
    const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
    if (typeof parsed.error === 'string') detail = parsed.error;
    else if (typeof parsed.message === 'string' && parsed.message) detail = parsed.message;
  } catch {
    if (body) detail = `${detail}: ${body.slice(0, 200)}`;
  }
  return detail;
}

export async function generateGrokImage(prompt: string): Promise<GrokImageResult> {
  if (!process.env.XAI_API_KEY) return { error: 'XAI_API_KEY가 설정되지 않음' };

  const model = process.env.XAI_IMAGE_MODEL || 'grok-imagine-image';

  try {
    const res = await fetch(`${XAI_BASE}/images/generations`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ model, prompt, n: 1, response_format: 'url' }),
    });

    if (!res.ok) {
      const detail = parseError(res.status, await res.text().catch(() => ''));
      console.warn('[xai image]', detail);
      return { error: `xAI 이미지 생성 실패 — ${detail}` };
    }

    const data: ImageGenResponse = await res.json();
    const first = data.data?.[0];
    if (first?.url) return { url: first.url };
    if (first?.b64_json) return { url: `data:image/png;base64,${first.b64_json}` };
    return { error: 'xAI가 이미지 데이터를 반환하지 않음' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[xai image]', msg);
    return { error: `네트워크 오류: ${msg}` };
  }
}

/* ─────────── Video generation (async, polling) ─────────── */

export type GrokVideoResult = { url: string; durationSec?: number } | { error: string };

type VideoStartResponse = { request_id?: string };
type VideoStatusResponse = {
  status?: 'pending' | 'done' | 'failed' | string;
  progress?: number;
  video?: { url?: string; duration?: number };
  url?: string;
  data?: Array<{ url?: string }>;
  error?: string;
  message?: string;
};

const VIDEO_POLL_INTERVAL_MS = 5_000;
const VIDEO_POLL_TIMEOUT_MS = 240_000; // 4 minutes

function extractVideoUrl(data: VideoStatusResponse): string | null {
  if (data.video?.url) return data.video.url;
  if (data.url) return data.url;
  if (data.data?.[0]?.url) return data.data[0].url;
  return null;
}

export async function generateGrokVideo(prompt: string): Promise<GrokVideoResult> {
  if (!process.env.XAI_API_KEY) return { error: 'XAI_API_KEY가 설정되지 않음' };

  const model = process.env.XAI_VIDEO_MODEL || 'grok-imagine-video';

  // Step 1: submit job
  let requestId: string;
  try {
    const res = await fetch(`${XAI_BASE}/videos/generations`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ model, prompt, n: 1 }),
    });
    if (!res.ok) {
      const detail = parseError(res.status, await res.text().catch(() => ''));
      console.warn('[xai video submit]', detail);
      return { error: `xAI 비디오 작업 시작 실패 — ${detail}` };
    }
    const submitted: VideoStartResponse = await res.json();
    if (!submitted.request_id) return { error: 'xAI가 request_id를 반환하지 않음' };
    requestId = submitted.request_id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `비디오 작업 시작 네트워크 오류: ${msg}` };
  }

  // Step 2: poll until status === 'done' (or terminal failure)
  const deadline = Date.now() + VIDEO_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, VIDEO_POLL_INTERVAL_MS));
    try {
      const res = await fetch(`${XAI_BASE}/videos/${requestId}`, {
        method: 'GET',
        headers: authHeaders(),
      });
      if (res.status === 202) continue; // still working
      if (!res.ok) {
        const detail = parseError(res.status, await res.text().catch(() => ''));
        return { error: `xAI 비디오 폴링 실패 — ${detail}` };
      }
      const data: VideoStatusResponse = await res.json();

      if (data.status === 'failed') {
        const reason = data.error ?? data.message ?? 'unknown';
        return { error: `xAI 비디오 생성 실패 — ${reason}` };
      }

      const url = extractVideoUrl(data);
      if (data.status === 'done' && url) {
        return { url, durationSec: data.video?.duration };
      }
      if (url) {
        // Some shapes return URL without explicit status — accept anyway
        return { url, durationSec: data.video?.duration };
      }
      // pending / unknown payload — keep polling
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[xai video poll]', msg);
    }
  }

  return { error: `xAI 비디오 생성 타임아웃 (${VIDEO_POLL_TIMEOUT_MS / 1000}s, request_id=${requestId})` };
}
