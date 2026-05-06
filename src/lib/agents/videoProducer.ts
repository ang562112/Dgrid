import { generateText } from 'ai';
import { dgrid } from '@/lib/dgrid';
import { generateGrokImage, generateGrokVideo } from '@/lib/xai';

export type VideoProducerResult = {
  text: string;
  previewImageUrl?: string;
  imageError?: string;
  previewVideoUrl?: string;
  videoError?: string;
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
[Preview Prompt] 한 문장 영문 프롬프트 — 스토리보드 대표 프레임을 묘사하는 정적 이미지 프롬프트 (xAI Grok 이미지 생성용)
[Video Prompt] (선택) 한 문장 영문 프롬프트 — 짧은 모션 묘사 포함, 6~10초 분량의 시네마틱 클립용 (xAI Grok 비디오 생성용)

[Video Prompt 라인을 포함할지 결정 — 매우 중요]
사용자 brief에 "영상", "video", "비디오", "광고", "릴스", "쇼츠", "유튜브", "튜토리얼", "모션", "movie", "clip", "트레일러", "프로모", "광고영상" 같은 키워드가 하나라도 있으면 **반드시** [Video Prompt] 라인을 포함하세요. 영상 요청인데 [Video Prompt]를 빠뜨리면 비디오 생성이 안 됩니다.
단순 이미지·일러스트·그림 요청(예: "고양이 그림", "로고 디자인")에는 [Video Prompt] 생략 (비용/시간 절약).
[Video Prompt] 형식: 6~10초짜리 시네마틱 모션을 묘사한 영문 한 문장. 예: "Cinematic 8-second close-up: a brass nameplate gleaming on dark walnut, slow zoom-in, warm lamplight."

[단일 이미지 요청 처리]
사용자가 영상이 아니라 단일 이미지/그림만 요청한 경우(예: "고양이 그려줘", "사무실 사진 만들어줘"), 위 영상 형식 대신 다음 형식으로 짧게 응답:
[이미지 컨셉] 한 문장
[Preview Prompt] 영문 한 문장 — 사용자가 원한 이미지를 충실히 묘사
이때 Script/Storyboard/Edit/Narration 섹션과 [Video Prompt]는 생략.

스타일: 한국어, 14줄 이내, 압축적. Preview Prompt와 Video Prompt만 영문. [Preview Prompt] 라인은 거의 항상 포함 (이미지 자동 생성에 사용). [Video Prompt]는 영상 키워드가 있을 때만.`,
    prompt: brief,
  });

  const previewMatch = text.match(/\[Preview Prompt\]\s*(.+?)(?:\n|$)/i);
  const videoMatch = text.match(/\[Video Prompt\]\s*(.+?)(?:\n|$)/i);
  const imagePrompt = previewMatch?.[1]?.trim();
  const videoPrompt = videoMatch?.[1]?.trim();

  const [imageResult, videoResult] = await Promise.all([
    imagePrompt
      ? generateGrokImage(imagePrompt)
      : Promise.resolve<null>(null),
    videoPrompt
      ? generateGrokVideo(videoPrompt)
      : Promise.resolve<null>(null),
  ]);

  let previewImageUrl: string | undefined;
  let imageError: string | undefined;
  let previewVideoUrl: string | undefined;
  let videoError: string | undefined;

  if (imageResult === null) {
    if (imagePrompt === undefined) {
      imageError = 'VideoProducer가 [Preview Prompt] 라인을 출력하지 않아 이미지 생성을 건너뜀';
    }
  } else if ('url' in imageResult) {
    previewImageUrl = imageResult.url;
  } else {
    imageError = imageResult.error;
  }

  if (videoResult !== null) {
    if ('url' in videoResult) {
      previewVideoUrl = videoResult.url;
    } else {
      videoError = videoResult.error;
    }
  }

  return { text, previewImageUrl, imageError, previewVideoUrl, videoError };
}
