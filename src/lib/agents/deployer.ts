import { generateText, tool, stepCountIs, type ToolSet } from 'ai';
import { z } from 'zod';
import { dgrid } from '@/lib/dgrid';
import * as vercel from '@/lib/integrations/vercel';

export async function runDeployer(target: string): Promise<string> {
  if (!vercel.isVercelEnabled()) {
    return runMockDeployer(target);
  }

  const tools: ToolSet = {
    list_projects: tool({
      description: '사용자 Vercel 계정의 프로젝트 목록 (최근 10개).',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(20).optional().describe('가져올 개수 (기본 10)'),
      }),
      execute: async ({ limit }) => vercel.listProjects(limit ?? 10),
    }),
    list_deployments: tool({
      description: '최근 배포 목록 (모든 프로젝트, 최신 순).',
      inputSchema: z.object({
        limit: z.number().int().min(1).max(20).optional(),
      }),
      execute: async ({ limit }) => vercel.listDeployments(limit ?? 10),
    }),
    get_deployment: tool({
      description: '특정 배포의 상세 상태 (빌드 에러 시각·readyState 등).',
      inputSchema: z.object({
        idOrUrl: z.string().describe('deployment uid (예: "dpl_xxx") 또는 URL'),
      }),
      execute: async ({ idOrUrl }) => vercel.getDeployment(idOrUrl),
    }),
  };

  const { text } = await generateText({
    model: dgrid.chatModel('openai/gpt-5.1'),
    system: `당신은 자동화 에이전시의 "Deployer"입니다.
역할: Vercel 배포를 관리합니다. 현재 환경에 VERCEL_TOKEN이 설정되어 진짜 API에 read 권한이 있습니다.

[안전 원칙 — 매우 중요]
- 현재 destructive 도구(새 배포·삭제·롤백)는 등록되어 있지 않습니다. 휴먼 승인 게이트가 없는 한 추가하지 않음.
- 사용자가 "배포해줘"라고 해도 직접 트리거하지 말 것. 대신 "현재 상태"·"최근 배포 결과"·"수동 트리거 방법" 안내.
- prod 배포·롤백 같은 destructive 작업이 필요한 경우 "휴먼 승인 필요"로 명시하고 Vercel 대시보드 URL 제시.

[도구 사용 원칙]
- list_projects: 어떤 프로젝트가 있는지 조회.
- list_deployments: 최근 배포 흐름·실패 여부 확인.
- get_deployment: 특정 배포 디버깅 (빌드 실패 원인 등).
- 1~3회 호출로 충분한 정보 모으면 보고.

[출력 형식 — 한국어, 6~8줄]
1) 조회 결과 (어떤 프로젝트·배포 상태)
2) 빌드/배포 상태 요약 (READY / ERROR / BUILDING)
3) URL 1~2개 평문
4) (필요시) 다음 권장 액션 + 휴먼 승인 안내
장식 마크다운 자제.`,
    prompt: target,
    tools,
    stopWhen: stepCountIs(4),
  });

  return text;
}

async function runMockDeployer(target: string): Promise<string> {
  const { text } = await generateText({
    model: dgrid.chatModel('openai/gpt-5.1'),
    system: `당신은 자동화 에이전시의 "Deployer"입니다.
현재 모드: MOCK — VERCEL_TOKEN이 설정되지 않아 실제 API 호출 불가.
가짜 deployment ID와 URL을 만들어 시뮬레이션합니다.

보고 형식 (한국어, 6줄 이내):
1) 트리거: <어떤 브랜치/커밋을 어떤 환경에>
2) 빌드: <상태, 추정 소요시간>
3) URL: <https://가짜-deployment.vercel.app>
4) 위험도: <low/medium/high + 이유>
5) 롤백: <가능 여부, 명령>
6) 안내: "실제 Vercel API 활성화하려면 .env.local에 VERCEL_TOKEN 추가하세요"
prod 환경 배포는 "휴먼 승인 필요" 명시.
장식 마크다운 자제.`,
    prompt: target,
  });
  return text;
}
