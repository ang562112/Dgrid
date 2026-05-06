import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

export const dgrid = createOpenAICompatible({
  name: 'dgrid',
  baseURL: 'https://api.dgrid.ai/v1',
  apiKey: process.env.DGRID_API_KEY,
});
