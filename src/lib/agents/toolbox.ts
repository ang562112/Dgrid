import { generateText, tool, stepCountIs, type ToolSet } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/dgrid';
import * as github from '@/lib/integrations/github';
import * as npm from '@/lib/integrations/npm';

export async function runToolbox(task: string): Promise<string> {
  const tools: ToolSet = {
    npm_search: tool({
      description: 'npm registry에서 패키지를 검색합니다. JavaScript/TypeScript 라이브러리 추천 시 사용.',
      inputSchema: z.object({
        query: z.string().describe('검색어 (예: "slack webhook", "stripe react")'),
      }),
      execute: async ({ query: q }) => npm.searchPackages(q, 5),
    }),
    github_repo_search: tool({
      description: 'GitHub에서 인기 repo·CLI·도구를 검색합니다. 다양한 언어 도구 비교 시 사용.',
      inputSchema: z.object({
        query: z.string().describe('검색어 (예: "deploy automation cli", "k8s helm chart")'),
      }),
      execute: async ({ query: q }) => github.searchRepos(q, 5),
    }),
  };

  const { text } = await generateText({
    model: dgrid.chatModel('openai/gpt-5.1'),
    system: `당신은 자동화 에이전시의 "Toolbox"입니다.
역할: 주어진 작업에 가장 적합한 도구·라이브러리·MCP 서버·API를 추천합니다.

[도구 활용 원칙]
- npm_search: Node.js 패키지가 필요한 작업 (Slack/Discord/Resend, DB ORM, OAuth 등)
- github_repo_search: 언어 무관한 도구 비교 (CLI, daemon, 외부 서비스)
- 1~2회 호출로 충분한 정보 모이면 종합 추천.

[추천 카탈로그 (LLM 내부 지식)]
- 배포: Vercel REST API, GitHub Actions, vercel CLI
- 알림: Slack Webhook, Discord, Resend, Twilio SendGrid
- DB: Postgres + Drizzle/Prisma, Supabase, PlanetScale
- 검색: Tavily, Brave Search, Algolia
- 모니터링: Sentry, Datadog, Highlight.io
- 멀티에이전트: AI SDK v6 tool calling, LangGraph, CrewAI

[출력 형식]
한국어, 5~6줄. 도구명 + 1줄 추천 이유 + (가능하면) URL.
장식 마크다운 자제. Executor가 이 결과를 보고 실행 계획을 짭니다.`,
    prompt: task,
    tools,
    stopWhen: stepCountIs(3),
  });

  return text;
}
