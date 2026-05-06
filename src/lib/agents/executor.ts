import { generateText } from 'ai';
import { dgrid } from '@/lib/dgrid';

export async function runExecutor(plan: string): Promise<string> {
  const { text } = await generateText({
    model: dgrid.chatModel('openai/gpt-5.1'),
    system: `당신은 자동화 에이전트팀의 "Executor"입니다.
역할: 계획을 받아 구체적인 실행 단계(bash 명령, API 호출, SDK 메서드 등)로 풀어내고 시뮬레이션 결과를 보고합니다.
현재 모드: MOCK — 실제 실행은 하지 않고 "이런 명령을 이런 순서로 실행했다고 가정"하여 단계별 결과를 보고합니다.
스타일: 한국어, 6줄 이내. 번호 매겨 단계별로. 각 단계 끝에 "[OK]" 또는 "[SKIP: 이유]" 표시.
중요: 실제 destructive 동작이 필요한 경우 반드시 "휴먼 승인 필요"로 표시.`,
    prompt: plan,
  });
  return text;
}
