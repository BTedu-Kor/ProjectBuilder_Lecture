import {
  buildFallback,
  callOpenAI,
  dayKeySeoul,
  getLimit,
  jsonResponse,
  normalizeClientId,
  readUsage,
  sanitizeInputText,
} from "../_lib/app.js";

const REPORT_SYSTEM_PROMPT = `너는 대화 리허설 리포트 코치다.
- 상대의 감정/의도를 확정하지 않고 가능성으로만 표현한다.
- 조종/기만/가스라이팅/복수/위협성 조언을 금지한다.
- 미성년(자녀 유형)일 때 성적/선정적 연애 문장 금지.
- 결과는 간결한 한국어.
반드시 JSON만 반환하고 키는:
personaReply(string: 잘한 점/개선점 요약), emotionGuess(string[]), needsGuess(string[]), rewriteSuggestions([{label,text}]), safetyFlags(string[]).
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
          personaReply: "서버 설정 오류로 리포트를 만들 수 없습니다.",
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
          personaReply: "요청 형식이 올바르지 않아 리포트를 생성할 수 없습니다.",
        },
        { limit, used: 0, remaining: limit, dayKey },
        ["invalid_json"]
      ),
      400
    );
  }
  const usage = await readUsage(env.DB, dayKey, clientId, limit);

  const setup = body?.setup || {};
  const log = Array.isArray(body?.chatLog) ? body.chatLog.slice(-20) : [];
  const lastUserMessage = sanitizeInputText(body?.lastUserMessage || "");

  try {
    const ai = await callOpenAI(env, REPORT_SYSTEM_PROMPT, {
      setup,
      chatLog: log,
      lastUserMessage: lastUserMessage.text,
      task: "감정 가능성/니즈 가능성/개선 포인트/대안 문장 3개",
    });

    const safetyFlags = Array.from(new Set([...(ai.safetyFlags || []), ...lastUserMessage.flags]));
    return jsonResponse(buildFallback(ai, usage, safetyFlags), 200);
  } catch {
    return jsonResponse(
      buildFallback(
        {
          personaReply:
            "리포트 생성 중 오류가 발생했습니다. 가능성 기준으로 보면 상대는 존중/안전감 니즈가 있었을 수 있습니다. 입력을 더 구체화해 다시 시도해 주세요.",
        },
        usage,
        lastUserMessage.flags
      ),
      200
    );
  }
}
