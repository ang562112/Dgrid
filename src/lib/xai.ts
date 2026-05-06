const XAI_BASE = 'https://api.x.ai/v1';

export type GrokImageResult = { url: string } | { error: string };

type ImageGenResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
};

export async function generateGrokImage(prompt: string): Promise<GrokImageResult> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return { error: 'XAI_API_KEY가 설정되지 않음' };

  const model = process.env.XAI_IMAGE_MODEL || 'grok-2-image';

  try {
    const res = await fetch(`${XAI_BASE}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        response_format: 'url',
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      let detail = `HTTP ${res.status}`;
      try {
        const parsed = JSON.parse(body) as { error?: unknown; message?: unknown };
        if (typeof parsed.error === 'string') detail = parsed.error;
        else if (typeof parsed.message === 'string' && parsed.message) detail = parsed.message;
      } catch {
        if (body) detail = `${detail}: ${body.slice(0, 200)}`;
      }
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
