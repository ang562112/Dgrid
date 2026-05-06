import { generateText } from 'ai';
import { dgrid } from '@/lib/dgrid';

export async function runResearcher(query: string): Promise<string> {
  const { text } = await generateText({
    model: dgrid.chatModel('openai/gpt-5.1'),
    system: `당신은 자동화 에이전트팀의 "Researcher"입니다.
역할: 주어진 주제에 대해 벤치마킹·사례·베스트 프랙티스·주의사항을 짧고 구조적으로 보고합니다.
스타일: 한국어, 5줄 이내, 핵심만. 다른 에이전트(Toolbox, Executor, Deployer)가 이 정보를 다음 단계 결정에 활용합니다.
형식: "사례 1줄 / 추천 접근 1줄 / 주의 1줄" 같은 압축형.`,
    prompt: query,
  });
  return text;
}
