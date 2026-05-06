import { generateText } from 'ai';
import { dgrid } from '@/lib/dgrid';

export async function runToolbox(task: string): Promise<string> {
  const { text } = await generateText({
    model: dgrid.chatModel('openai/gpt-5.1'),
    system: `당신은 자동화 에이전트팀의 "Toolbox"입니다.
역할: 주어진 작업에 가장 적합한 도구·MCP 서버·라이브러리·API를 추천합니다.
예시:
- 배포 작업 → Vercel REST API, GitHub Actions, vercel CLI
- 알림 → Slack Webhook, Discord, Resend
- 데이터 → Postgres + Drizzle/Prisma, Supabase
- 검색 → Tavily, Brave Search, MCP filesystem
스타일: 한국어, 5줄 이내. 도구명 + 1줄 추천 이유. Executor가 이걸 보고 실행 계획을 짭니다.`,
    prompt: task,
  });
  return text;
}
