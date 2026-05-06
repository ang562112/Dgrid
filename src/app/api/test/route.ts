import { generateText } from 'ai';
import { dgrid } from '@/lib/dgrid';

export async function GET() {
  const { text } = await generateText({
    model: dgrid.chatModel('openai/gpt-5.1'),
    prompt: 'Say hello in one short sentence.',
  });
  return Response.json({ text });
}
