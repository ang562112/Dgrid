const XAI_BASE = 'https://api.x.ai/v1';

type ImageGenResponse = {
  data?: Array<{ url?: string; b64_json?: string }>;
};

export async function generateGrokImage(prompt: string): Promise<string | null> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) return null;

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
      console.warn('[xai image] HTTP', res.status, await res.text().catch(() => ''));
      return null;
    }

    const data: ImageGenResponse = await res.json();
    const first = data.data?.[0];
    if (first?.url) return first.url;
    if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
    return null;
  } catch (err) {
    console.warn('[xai image] error', err);
    return null;
  }
}
