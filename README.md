# Dgrid
Vercel AI SDK v6와 DGrid AI Gateway를 OpenAI 호환 인터페이스로 연결한 Next.js 16(App Router) + Tailwind 챗봇 스타터. createOpenAICompatible로 단일 API 키에서 OpenAI·Anthropic 등 다중 모델을 라우팅하고, streamText와 useChat 훅으로 토큰 단위 스트리밍을 처리합니다. /api/test에서 연결 헬스체크, /api/chat에서 멀티턴 대화 엔드포인트를 노출하며 모델 ID 한 줄 변경으로 공급사 전환이 가능합니다. 도구 호출, MCP 클라이언트, 멀티 에이전트 오케스트레이터,.
