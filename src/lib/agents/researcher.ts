import { generateText, tool, stepCountIs, type ToolSet } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/dgrid';
import * as github from '@/lib/integrations/github';
import * as tavily from '@/lib/integrations/tavily';

export async function runResearcher(query: string): Promise<string> {
  const tools: ToolSet = {
    github_repo_search: tool({
      description:
        'GitHub에서 인기 repo를 검색합니다. 라이브러리·도구·예제 코드를 찾을 때 사용. 결과: 이름·설명·별·언어·URL.',
      inputSchema: z.object({
        query: z.string().describe('검색어 (예: "next.js auth middleware", "puppeteer alternative")'),
      }),
      execute: async ({ query: q }) => github.searchRepos(q, 5),
    }),
    github_repo_readme: tool({
      description: '특정 GitHub repo의 README를 가져옵니다 (최대 4000자).',
      inputSchema: z.object({
        owner: z.string().describe('GitHub owner 이름 (예: "vercel")'),
        repo: z.string().describe('repo 이름 (예: "next.js")'),
      }),
      execute: async ({ owner, repo }) => github.getRepoReadme(owner, repo, 4000),
    }),
  };

  if (tavily.isTavilyEnabled()) {
    tools.web_search = tool({
      description:
        '실시간 웹 검색 (Tavily). 최신 뉴스·트렌드·블로그·공식 문서를 찾을 때 사용. answer 필드에 요약된 답이, results에 출처가 들어옵니다.',
      inputSchema: z.object({
        query: z.string().describe('검색 쿼리'),
      }),
      execute: async ({ query: q }) => tavily.webSearch(q, 5),
    });
  }

  const { text } = await generateText({
    model: dgrid.chatModel('openai/gpt-5.1'),
    system: `당신은 자동화 에이전시의 "Researcher"입니다.
역할: 주어진 주제에 대해 벤치마킹·사례·베스트 프랙티스·주의사항을 짧고 구조적으로 보고합니다.

[도구 사용 원칙]
- ${tavily.isTavilyEnabled() ? 'web_search: 최신 정보·실제 사례·트렌드가 필요하면 우선 호출.' : 'web_search: 환경에 활성화되지 않음 (TAVILY_API_KEY 미설정).'}
- github_repo_search: 라이브러리·도구·구현 예제 비교 시 사용. 별 수와 최근 활동성을 비교 근거로.
- github_repo_readme: 특정 repo의 실제 사용법·차별점이 궁금하면 호출.
- 도구 호출 1~3회로 충분한 정보 모이면 종합. 무한히 호출하지 말 것.

[출력 형식]
한국어, 5~7줄. 도구로 얻은 사실을 인용하되 출처 URL은 괄호로 짧게.
"사례 / 추천 접근 / 주의 / (선택) 출처 1~2개" 압축형.
장식 마크다운(**굵게**, ## 헤더, --- 구분선) 사용 자제.`,
    prompt: query,
    tools,
    stopWhen: stepCountIs(4),
  });

  return text;
}
