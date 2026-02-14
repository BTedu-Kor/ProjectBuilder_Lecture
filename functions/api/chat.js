import {
  buildLocalChatFallback,
  buildFallback,
  callOpenAI,
  classifyOpenAIError,
  dayKeySeoul,
  getLimit,
  increaseUsage,
  jsonResponse,
  normalizeClientId,
  readUsage,
  sanitizeInputText,
} from "../_lib/app.js";

const CHAT_SYSTEM_PROMPT = `너는 대화 리허설 코치다.
- 절대 상대의 마음/의도를 확정하지 말고, 가능성/가정 표현만 사용한다.
- 조종, 기만, 가스라이팅, 복수, 협박을 돕는 조언을 금지한다.
- 미성년(자녀 유형)일 때 성적/선정적/연애 유도 문장을 생성하지 않는다.
- 개인정보를 요구하거나 유도하지 않는다.
- 한국어로 답한다.
반드시 JSON으로만 응답하고 키는 아래를 사용:
personaReply(string), emotionGuess(string[]), needsGuess(string[]), rewriteSuggestions([{label,text}]), safetyFlags(string[]).
rewriteSuggestions는 label을 반드시 공감형/단호형/짧게 3개로 반환.`;

export async function onRequestPost(context) {
  const { env, request } = context;
  const limit = getLimit(env);
  const dayKey = dayKeySeoul();
  const clientId = normalizeClientId(request.headers.get("x-client-id"));

  if (!env.DB) {
    return jsonResponse(
      buildFallback(
        {
          personaReply: "서버 설정 오류로 응답을 만들 수 없습니다.",
        },
        { limit, used: 0, remaining: limit, dayKey },
        ["server_config_error"]
      ),
      500
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      buildFallback(
        {
          personaReply: "요청 형식이 올바르지 않습니다.",
        },
        { limit, used: 0, remaining: limit, dayKey },
        ["invalid_json"]
      ),
      400
    );
  }

  const currentUsage = await readUsage(env.DB, dayKey, clientId, limit);
  if (currentUsage.used >= limit) {
    return jsonResponse(
      buildFallback(
        {
          personaReply: "오늘 무료 턴이 소진되었습니다. 리포트를 확인하거나 내일 다시 시도해 주세요.",
          safetyFlags: ["daily_limit_reached"],
        },
        { ...currentUsage, remaining: 0 },
        ["daily_limit_reached"]
      ),
      429
    );
  }

  const setup = body?.setup || {};
  const message = sanitizeInputText(body?.message || "");
  const log = Array.isArray(body?.chatLog) ? body.chatLog.slice(-12) : [];

  const openAiPayload = {
    setup: {
      conversationType: setup.conversationType || "child",
      ageGroup: setup.ageGroup || "20대",
      gender: setup.gender || "",
      mbti: setup.mbti || "",
      personaPreset: setup.personaPreset || "예민",
    },
    message: message.text,
    chatLog: log,
    policy: "확정 금지, 가능성 기반 리허설 톤 유지",
  };

  try {
    const ai = await callOpenAI(env, CHAT_SYSTEM_PROMPT, openAiPayload);
    await increaseUsage(env.DB, dayKey, clientId);
    const usage = await readUsage(env.DB, dayKey, clientId, limit);
    const safetyFlags = Array.from(new Set([...(ai.safetyFlags || []), ...message.flags]));
    return jsonResponse(buildFallback(ai, usage, safetyFlags), 200);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("[api/chat] OpenAI call failed", detail);
    const classified = classifyOpenAIError(detail);
    const usage = currentUsage;
    const safetyFlags = Array.from(new Set([...message.flags, classified.flag]));

    if (classified.flag === "upstream_quota_error") {
      return jsonResponse(
        buildFallback(
          buildLocalChatFallback(message.text),
          usage,
          Array.from(new Set([...safetyFlags, "local_fallback_active"]))
        ),
        200
      );
    }

    return jsonResponse(
      buildFallback(
        {
          personaReply: classified.message,
        },
        usage,
        safetyFlags
      ),
      classified.status
    );
  }
}
