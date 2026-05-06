import {
  streamText,
  UIMessage,
  convertToModelMessages,
  tool,
  stepCountIs,
} from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/dgrid';
import { xai } from '@/lib/xai';

// Allow up to 5 minutes for slow video generation polling
export const maxDuration = 300;
import { runResearcher } from '@/lib/agents/researcher';
import { runToolbox } from '@/lib/agents/toolbox';
import { runExecutor } from '@/lib/agents/executor';
import { runDeployer } from '@/lib/agents/deployer';
import { runVideoProducer } from '@/lib/agents/videoProducer';
import { runHumanizer } from '@/lib/agents/humanizer';

async function timed<T>(agent: string, input: string, run: () => Promise<T>) {
  const start = Date.now();
  const output = await run();
  return {
    agent,
    input,
    output,
    durationMs: Date.now() - start,
  };
}

export async function POST(req: Request) {
  const body = (await req.json()) as { messages: UIMessage[]; memory?: string[] };
  const messages = body.messages;
  const memoryFacts = Array.isArray(body.memory) ? body.memory.filter((f): f is string => typeof f === 'string') : [];

  const memoryBlock = memoryFacts.length === 0
    ? ''
    : `

[USER MEMORY — 사용자에 대한 장기 기억]
이전 대화에서 저장된 사실들 (자연스럽게 활용하되, "기억하고 있어요" 같은 메타 발언 자제):
${memoryFacts.map((f, i) => `${i + 1}. ${f}`).join('\n')}
`;

  const result = streamText({
    model: xai.chatModel(process.env.ORCHESTRATOR_MODEL || 'grok-4-fast-reasoning'),
    system: `당신은 자동화 에이전시의 "Orchestrator"입니다.
6명의 sub-agent를 도구로 호출해 협업을 조율합니다:
- research: 벤치마킹·사례 조사
- toolbox: 작업에 적합한 도구·MCP·라이브러리 추천
- execute: 실행 단계 시뮬레이션 (현재 mock)
- deploy: Vercel 배포 관리 (현재 mock)
- video: 영상제작팀(VideoProducer). 시나리오·스토리보드·편집 가이드를 작성하고, **xAI Grok 이미지 API**를 호출해 스토리보드 미리보기 이미지 1장도 자동 생성합니다. **사용자가 "이미지 만들어줘", "그림 그려줘", "GROK으로 이미지", "스토리보드", "시각 자료" 같은 요청을 하면 항상 video 도구로 위임하세요.** (별도의 직접 이미지 도구는 없습니다 — 모든 이미지 생성은 video 도구를 거칩니다.)
- humanize: AI 티·마크다운 제거하여 한국어 텍스트를 자연스럽게 다듬기

[중요 — 거절·hallucinate 금지]
1) 사용자가 위 6개 도구로 처리 가능한 작업을 요청했을 때 절대 "직접 할 수 없습니다", "API에 접근할 수 없습니다", "시스템 환경의 제약" 같은 거절 문구를 사용하지 마세요. 등록된 도구를 즉시 호출하면 됩니다.
2) video 도구의 출력은 { text, previewImageUrl?, imageError?, previewVideoUrl?, videoError? } 형태입니다.
   - previewImageUrl이 있으면: 사용자 화면에 이미지가 이미 카드 안에 렌더링되었습니다. "이미지를 표시할 수 없다" 같은 거짓말 금지.
   - previewVideoUrl이 있으면: 사용자 화면에 비디오가 이미 재생 가능하게 렌더링되었습니다.
   - imageError / videoError가 있으면: 그 에러 메시지 원문을 사용자에게 그대로 전달하세요. 변명·일반화 금지.
   - 비디오는 1~3분 걸리는 비동기 작업이라 응답이 늦어질 수 있음. 비디오 키워드(영상/광고/릴스/유튜브 등)가 있을 때만 비디오 생성됨.
3) 도구가 실제로 실패한 경우에만 사실 그대로 보고하세요(가짜 사과 X). 성공한 경우 결과를 신뢰하세요.

원칙:
1) 사용자 요청을 받으면 어떤 에이전트(들)이 필요한지 한 줄 계획을 먼저 말한다.
2) 일반 자동화: research → toolbox → execute → deploy 순서가 디폴트, 불필요한 단계는 건너뛴다.
3) 영상·이미지·스토리보드·GROK 관련 시각 작업은 모두 video 도구에 위임.
4) 글·기사·블로그·공지·SNS 카피·콘텐츠 작성이 산출물에 포함된 경우, 작성이 끝난 뒤 반드시 humanize에 그 텍스트를 넘겨 다듬은 결과를 사용자에게 노출한다.
5) 각 도구 호출 후 결과를 다음 도구의 입력으로 활용 (예: video 결과를 deploy의 페이로드로 첨부, 작성 결과를 humanize의 입력으로).
6) prod 배포·destructive 작업은 반드시 휴먼 승인을 명시한다.
7) 모든 위임이 끝나면 한국어로 종합 보고를 마지막 메시지로 출력한다.

[출력 스타일 규칙 — 매우 중요]
- 사용자에게 노출되는 본인의 종합 보고는 마크다운 표기 사용 금지: **굵게**, ## 헤더, --- 구분선, 불릿(- *), 표(|...|) 모두 쓰지 않는다.
- 자연스러운 한국어 단락으로 작성. 짧은 문장, 빈 줄로 단락 구분.
- 번역체("~를 통해", "결론적으로", "주목할 만합니다") 자제.
- 사용자가 콘텐츠 작성을 요청한 경우, 콘텐츠 본문은 humanize 도구를 거친 결과를 그대로 인용한다.

[멀티모달 입력]
사용자가 이미지를 첨부하면 그 이미지를 직접 보고 의도를 파악하라.
- "이런 디자인을 비슷하게 만들어줘" → 이미지 분석 후 video 도구에 시각 묘사를 풍부히 전달
- "이 사진 분석해줘" → 직접 분석 결과를 종합 보고에 포함
- "이 화면의 문제점은?" → 시각적 디테일 기반으로 답변
이미지 정보가 sub-agent 작업에 도움될 경우, 도구 호출 input에 이미지 묘사를 텍스트로 풀어서 전달 (sub-agent들은 이미지를 직접 보지 못하므로 텍스트로 변환해 넘긴다).

[장기 기억 활용]
사용자에 대해 새로 알게 된 중요한 사실(이름·역할·진행 중 프로젝트·결정사항·선호 도구·연락 채널 등)이 향후 대화에서 활용 가치 있으면 memorize 도구로 한 문장씩 저장하라. 단순 일회성·임시 정보는 저장하지 말 것. 같은 사실을 중복 저장 금지.

스타일: 한국어, 간결. 사용자가 에이전트들의 협업을 단계별로 볼 수 있도록 도구를 순차 호출하라.${memoryBlock}`,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(10),
    tools: {
      research: tool({
        description: '벤치마킹·리서치 에이전트(Researcher)에게 자료 조사를 위임합니다.',
        inputSchema: z.object({
          query: z.string().describe('조사할 주제·질문 (한 문장 이상의 컨텍스트 포함)'),
        }),
        execute: async ({ query }) => timed('researcher', query, () => runResearcher(query)),
      }),
      toolbox: tool({
        description: '도구 추천 에이전트(Toolbox)에게 작업에 맞는 도구·라이브러리 추천을 요청합니다.',
        inputSchema: z.object({
          task: z.string().describe('도구가 필요한 작업 설명'),
        }),
        execute: async ({ task }) => timed('toolbox', task, () => runToolbox(task)),
      }),
      execute: tool({
        description: '실행 에이전트(Executor)에게 자동화 실행 계획을 전달해 시뮬레이션을 실행합니다.',
        inputSchema: z.object({
          plan: z.string().describe('실행 단계가 포함된 구체적 계획 (Toolbox의 결과를 반영)'),
        }),
        execute: async ({ plan }) => timed('executor', plan, () => runExecutor(plan)),
      }),
      deploy: tool({
        description: '배포 에이전트(Deployer)에게 Vercel 배포 작업을 위임합니다.',
        inputSchema: z.object({
          target: z
            .string()
            .describe('배포 대상·환경 (예: "main 브랜치를 staging으로", "v1.2.0 태그를 prod로")'),
        }),
        execute: async ({ target }) => timed('deployer', target, () => runDeployer(target)),
      }),
      video: tool({
        description:
          '영상제작팀(VideoProducer)에게 영상 콘텐츠 기획·제작을 위임합니다. 시나리오·스토리보드·편집·내레이션 가이드를 포함한 통합 보고를 받습니다.',
        inputSchema: z.object({
          brief: z
            .string()
            .describe('영상 브리프 (목적, 타겟, 플랫폼, 길이, 핵심 메시지 등)'),
        }),
        execute: async ({ brief }) => timed('videoProducer', brief, () => runVideoProducer(brief)),
      }),
      humanize: tool({
        description:
          '교열 에이전트(Humanizer)에게 텍스트를 넘겨 AI 티와 마크다운 표기를 제거한 자연스러운 한국어로 다듬게 합니다. 글·기사·블로그·공지·SNS 카피 등 사람에게 노출될 콘텐츠가 있을 때 마지막 단계로 호출하세요.',
        inputSchema: z.object({
          text: z.string().describe('AI 티와 마크다운을 제거할 한국어 원본 텍스트'),
        }),
        execute: async ({ text }) => {
          const briefSummary = text.length > 80 ? `${text.slice(0, 80)}…` : text;
          return timed('humanizer', briefSummary, () => runHumanizer(text));
        },
      }),
      memorize: tool({
        description:
          '사용자에 대해 알게 된 새로운 사실을 장기 기억에 저장합니다. 향후 대화에서 활용할 만한 사실(이름·역할·프로젝트·선호·결정사항)만 저장. 단순 일회성 정보 금지. 한 번에 한 사실씩.',
        inputSchema: z.object({
          fact: z
            .string()
            .describe('저장할 사실 한 문장 (예: "사용자 GitHub 아이디는 ang562112", "Vercel 자동 배포 프로젝트 진행 중")'),
        }),
        execute: async ({ fact }) => ({
          agent: 'memory',
          input: fact,
          output: `📌 기억 저장: ${fact}`,
          fact,
        }),
      }),
    },
  });

  return result.toUIMessageStreamResponse();
}
