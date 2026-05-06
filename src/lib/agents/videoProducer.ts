import { generateText } from 'ai';
import { dgrid } from '@/lib/dgrid';
import { generateGrokImage } from '@/lib/xai';

export type VideoProducerResult = {
  text: string;
  previewImageUrl?: string;
  imageError?: string;
};

export async function runVideoProducer(brief: string): Promise<VideoProducerResult> {
  const { text } = await generateText({
    model: dgrid.chatModel('openai/gpt-5.1'),
    system: `당신은 자동화 에이전시의 "영상제작팀(VideoProducer)" 팀장입니다.
4명의 내부 팀원을 통솔하고, 그들의 산출물을 한 응답에 통합 보고합니다:
- 📝 Scriptwriter: 시나리오·내레이션 텍스트
- 🎨 Storyboarder: 컷별 시각 구성 (와이드/클로즈업/카메라 무브 등)
- ✂️ Editor: 편집 흐름·BPM·전환·길이
- 🎙️ Narrator: 톤·페이스·발음 가이드

브리프(목적·타겟·플랫폼·길이 등)를 받으면 아래 형식으로 보고:
[기획 컨셉] 한 문장
📝 Script: 후크 1줄 + 핵심 메시지 2줄
🎨 Storyboard: C1~C4 컷 묘사 (각 컷 1줄)
✂️ Edit: 길이/BPM/주요 전환 1줄
🎙️ Narration: 톤·페이스 1줄
[권장] 플랫폼·해상도·예상 제작 일정 1줄
[Preview Prompt] 한 문장 영문 프롬프트 (스토리보드 대표 프레임을 묘사하는 시각 프롬프트, X/Grok 이미지 생성용)

[단일 이미지 요청 처리]
사용자가 영상이 아니라 단일 이미지/그림만 요청한 경우(예: "고양이 그려줘", "사무실 사진 만들어줘"), 위 영상 형식 대신 다음 형식으로 짧게 응답:
[이미지 컨셉] 한 문장
[Preview Prompt] 영문 한 문장 — 사용자가 원한 이미지를 충실히 묘사
이때 Script/Storyboard/Edit/Narration 섹션은 생략 가능.

스타일: 한국어, 14줄 이내, 압축적. Preview Prompt만 영문. [Preview Prompt] 라인은 반드시 포함 (이미지 자동 생성에 사용).`,
    prompt: brief,
  });

  const previewMatch = text.match(/\[Preview Prompt\]\s*(.+?)(?:\n|$)/i);
  const imagePrompt = previewMatch?.[1]?.trim();

  let previewImageUrl: string | undefined;
  let imageError: string | undefined;

  if (!imagePrompt) {
    imageError = 'VideoProducer가 [Preview Prompt] 라인을 출력하지 않아 이미지 생성을 건너뜀';
  } else {
    const result = await generateGrokImage(imagePrompt);
    if ('url' in result) {
      previewImageUrl = result.url;
    } else {
      imageError = result.error;
    }
  }

  return { text, previewImageUrl, imageError };
}
