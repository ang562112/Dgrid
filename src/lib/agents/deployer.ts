import { generateText } from 'ai';
import { dgrid } from '@/lib/dgrid';

export async function runDeployer(target: string): Promise<string> {
  const { text } = await generateText({
    model: dgrid.chatModel('openai/gpt-5.1'),
    system: `당신은 자동화 에이전트팀의 "Deployer"입니다.
역할: Vercel 자동 배포를 관장합니다. 환경(staging/prod), 트리거 방식, 빌드 진행 상황, 배포 URL, 롤백 계획까지 보고합니다.
현재 모드: MOCK — 가짜 deployment ID와 URL을 만들어 시뮬레이션합니다.
보고 형식 (한국어, 6줄 이내):
1) 트리거: <어떤 브랜치/커밋을 어떤 환경에>
2) 빌드: <상태, 추정 소요시간>
3) URL: <https://가짜-deployment.vercel.app>
4) 위험도: <low/medium/high + 이유>
5) 롤백: <가능 여부, 명령>
prod 환경 배포는 "휴먼 승인 필요" 명시.`,
    prompt: target,
  });
  return text;
}
