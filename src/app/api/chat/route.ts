import {
  streamText,
  UIMessage,
  convertToModelMessages,
  tool,
  stepCountIs,
} from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/dgrid';
import { runResearcher } from '@/lib/agents/researcher';
import { runToolbox } from '@/lib/agents/toolbox';
import { runExecutor } from '@/lib/agents/executor';
import { runDeployer } from '@/lib/agents/deployer';
import { runVideoProducer } from '@/lib/agents/videoProducer';

type AgentRunner = (input: string) => Promise<string>;

async function timed(agent: string, runner: AgentRunner, input: string) {
  const start = Date.now();
  const output = await runner(input);
  return {
    agent,
    input,
    output,
    durationMs: Date.now() - start,
  };
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: dgrid.chatModel('anthropic/claude-sonnet-4.5'),
    system: `당신은 자동화 에이전시의 "Orchestrator"입니다.
5명의 sub-agent를 도구로 호출해 협업을 조율합니다:
- research: 벤치마킹·사례 조사
- toolbox: 작업에 적합한 도구·MCP·라이브러리 추천
- execute: 실행 단계 시뮬레이션 (현재 mock)
- deploy: Vercel 배포 관리 (현재 mock)
- video: 영상제작팀에게 시나리오·스토리보드·편집 가이드 제작 위임

원칙:
1) 사용자 요청을 받으면 어떤 에이전트(들)이 필요한지 한 줄 계획을 먼저 말한다.
2) 일반 자동화: research → toolbox → execute → deploy 순서가 디폴트, 불필요한 단계는 건너뛴다.
3) 영상 작업이 포함되면 video 에이전트에게 위임. 광고·튜토리얼·홍보영상은 자동으로 video 호출.
4) 각 도구 호출 후 결과를 다음 도구의 입력으로 활용 (예: video 결과를 deploy의 페이로드로 첨부).
5) prod 배포·destructive 작업은 반드시 휴먼 승인을 명시한다.
6) 모든 위임이 끝나면 한국어로 종합 보고를 마지막 메시지로 출력한다.

스타일: 한국어, 간결. 사용자가 에이전트들의 협업을 단계별로 볼 수 있도록 도구를 순차 호출하라.`,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(10),
    tools: {
      research: tool({
        description: '벤치마킹·리서치 에이전트(Researcher)에게 자료 조사를 위임합니다.',
        inputSchema: z.object({
          query: z.string().describe('조사할 주제·질문 (한 문장 이상의 컨텍스트 포함)'),
        }),
        execute: async ({ query }) => timed('researcher', runResearcher, query),
      }),
      toolbox: tool({
        description: '도구 추천 에이전트(Toolbox)에게 작업에 맞는 도구·라이브러리 추천을 요청합니다.',
        inputSchema: z.object({
          task: z.string().describe('도구가 필요한 작업 설명'),
        }),
        execute: async ({ task }) => timed('toolbox', runToolbox, task),
      }),
      execute: tool({
        description: '실행 에이전트(Executor)에게 자동화 실행 계획을 전달해 시뮬레이션을 실행합니다.',
        inputSchema: z.object({
          plan: z.string().describe('실행 단계가 포함된 구체적 계획 (Toolbox의 결과를 반영)'),
        }),
        execute: async ({ plan }) => timed('executor', runExecutor, plan),
      }),
      deploy: tool({
        description: '배포 에이전트(Deployer)에게 Vercel 배포 작업을 위임합니다.',
        inputSchema: z.object({
          target: z
            .string()
            .describe('배포 대상·환경 (예: "main 브랜치를 staging으로", "v1.2.0 태그를 prod로")'),
        }),
        execute: async ({ target }) => timed('deployer', runDeployer, target),
      }),
      video: tool({
        description:
          '영상제작팀(VideoProducer)에게 영상 콘텐츠 기획·제작을 위임합니다. 시나리오·스토리보드·편집·내레이션 가이드를 포함한 통합 보고를 받습니다.',
        inputSchema: z.object({
          brief: z
            .string()
            .describe('영상 브리프 (목적, 타겟, 플랫폼, 길이, 핵심 메시지 등)'),
        }),
        execute: async ({ brief }) => timed('videoProducer', runVideoProducer, brief),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
