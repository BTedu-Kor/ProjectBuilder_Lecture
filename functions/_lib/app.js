const DEFAULT_LIMIT = 20;

export function dayKeySeoul(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
}

export function getLimit(env) {
  const raw = Number(env.FREE_TURN_LIMIT);
  if (Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return DEFAULT_LIMIT;
}

export function normalizeClientId(value) {
  if (!value) return "anonymous";
  return String(value).trim().slice(0, 120) || "anonymous";
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function readUsage(db, dayKey, clientId, limit) {
  const row = await db
    .prepare("SELECT count FROM usage_daily WHERE day = ? AND client_id = ?")
    .bind(dayKey, clientId)
    .first();

  const used = Number(row?.count || 0);
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    dayKey,
  };
}

export async function increaseUsage(db, dayKey, clientId) {
  const nowTs = Math.floor(Date.now() / 1000);
  await db
    .prepare(
      `INSERT INTO usage_daily(day, client_id, count, updated_at)
       VALUES (?, ?, 1, ?)
       ON CONFLICT(day, client_id) DO UPDATE SET
         count = count + 1,
         updated_at = excluded.updated_at`
    )
    .bind(dayKey, clientId, nowTs)
    .run();
}

export function buildFallback(payload, usage, safetyFlags = []) {
  return {
    personaReply:
      payload.personaReply ||
      "가능성 기반 리허설 답변을 생성하지 못했습니다. 입력을 더 구체적으로 적어 다시 시도해 주세요.",
    emotionGuess: Array.isArray(payload.emotionGuess) ? payload.emotionGuess.slice(0, 5) : ["혼란", "방어적"],
    needsGuess: Array.isArray(payload.needsGuess) ? payload.needsGuess.slice(0, 5) : ["존중", "안전감"],
    rewriteSuggestions: normalizeRewrites(payload.rewriteSuggestions),
    safetyFlags,
    usage,
  };
}

export function normalizeRewrites(items) {
  const map = new Map((items || []).map((x) => [x?.label, x?.text]));
  return [
    { label: "공감형", text: map.get("공감형") || "네 마음이 힘들 수 있겠다고 느껴. 내 의도도 차분히 설명해볼게." },
    { label: "단호형", text: map.get("단호형") || "서로 존중은 필요해. 이 선은 지키고 이야기하고 싶어." },
    { label: "짧게", text: map.get("짧게") || "지금은 감정 정리 후 다시 말하자." },
  ];
}

export function sanitizeInputText(text) {
  let value = String(text || "").slice(0, 1200);
  const flags = [];

  const piiPatterns = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    /\b01[0-9][-\s]?\d{3,4}[-\s]?\d{4}\b/g,
    /\b\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}\b/g,
    /(실명|학교|연락처|주소|카카오톡|인스타|instagram)/gi,
  ];

  piiPatterns.forEach((p) => {
    if (p.test(value)) {
      flags.push("possible_pii");
      value = value.replace(p, "[마스킹됨]");
    }
  });

  const manipulation = /(가스라이팅|복수|협박|조종|기만)/g;
  if (manipulation.test(value)) {
    flags.push("manipulation_risk");
  }

  return { text: value, flags: Array.from(new Set(flags)) };
}

export function classifyOpenAIError(detail) {
  const text = String(detail || "");
  if (text.includes("OPENAI_API_KEY is missing") || /\b401\b/.test(text) || /invalid_api_key/i.test(text)) {
    return {
      status: 500,
      flag: "server_config_error",
      message: "서버 API 키 설정 오류로 응답을 생성할 수 없습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (/\b429\b/.test(text) || /quota|rate limit|insufficient_quota/i.test(text)) {
    return {
      status: 502,
      flag: "upstream_quota_error",
      message: "AI 서버 사용량 한도에 도달했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  if (/\b404\b/.test(text) || /model.*(not found|does not exist)|invalid model/i.test(text)) {
    return {
      status: 500,
      flag: "model_config_error",
      message: "서버 모델 설정 오류로 응답을 생성할 수 없습니다. 관리자 설정을 확인해 주세요.",
    };
  }

  if (/\b400\b/.test(text) && /response_format|json_object/i.test(text)) {
    return {
      status: 502,
      flag: "upstream_request_error",
      message: "AI 응답 형식 협상 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }

  return {
    status: 502,
    flag: "upstream_error",
    message: "가능성 기반 리허설 응답 생성 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  };
}

function inferEmotionNeeds(text) {
  const value = String(text || "");
  if (/(미안|죄송|잘못|실수)/.test(value)) {
    return { emotionGuess: ["후회", "불안"], needsGuess: ["이해", "관계회복"] };
  }
  if (/(화나|짜증|열받|빡쳐|분노)/.test(value)) {
    return { emotionGuess: ["분노", "답답함"], needsGuess: ["존중", "경계"] };
  }
  if (/(걱정|불안|무서|두려|긴장)/.test(value)) {
    return { emotionGuess: ["불안", "긴장"], needsGuess: ["안전감", "예측가능성"] };
  }
  return { emotionGuess: ["혼란", "방어적"], needsGuess: ["존중", "안전감"] };
}

export function buildLocalChatFallback(messageText) {
  const inferred = inferEmotionNeeds(messageText);
  return {
    personaReply:
      "지금은 AI 서버 한도로 임시 코칭을 제공합니다. 상대는 불편함이나 방어감을 느꼈을 가능성이 있으니, 단정 대신 확인 질문으로 대화를 여세요. 예: \"내 말 중에 가장 불편했던 지점이 뭐였는지 알려줄래?\"",
    emotionGuess: inferred.emotionGuess,
    needsGuess: inferred.needsGuess,
    rewriteSuggestions: [
      { label: "공감형", text: "그렇게 느꼈을 수 있겠다고 생각해. 네가 불편했던 지점을 먼저 듣고 싶어." },
      { label: "단호형", text: "비난 없이 사실과 감정을 나눠서 말해줘. 나는 그 기준에서 대화하고 싶어." },
      { label: "짧게", text: "지금 감정이 올라와서, 핵심 한 가지부터 맞춰보자." },
    ],
    safetyFlags: ["local_fallback_active"],
  };
}

export function buildLocalReportFallback(chatLog, lastUserMessage) {
  const inferred = inferEmotionNeeds(lastUserMessage);
  const turnCount = Array.isArray(chatLog) ? chatLog.length : 0;
  return {
    personaReply:
      `AI 서버 한도로 임시 리포트를 제공합니다. 현재까지 ${turnCount}턴 대화 기준으로, 상대 반응을 단정하기보다 확인 질문을 먼저 두는 흐름이 더 안전합니다.`,
    emotionGuess: inferred.emotionGuess,
    needsGuess: inferred.needsGuess,
    rewriteSuggestions: [
      { label: "공감형", text: "내가 놓친 지점이 있었을 수 있어. 너 입장에서 가장 힘들었던 부분부터 듣고 싶어." },
      { label: "단호형", text: "서로 존중하는 표현으로만 이야기하자. 그 선 안에서 문제를 정리해보자." },
      { label: "짧게", text: "감정이 큰 상태라서, 핵심 한 문장씩만 말해보자." },
    ],
    safetyFlags: ["local_fallback_active"],
  };
}

export async function callOpenAI(env, systemPrompt, userPayload) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const requestedModel = String(env.OPENAI_MODEL || "").trim();
  const modelCandidates = Array.from(new Set([requestedModel || "gpt-4.1-mini", "gpt-4.1-mini", "gpt-4o-mini"]));
  const baseMessages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: JSON.stringify(userPayload) },
  ];
  let lastError = "unknown_openai_error";

  for (const model of modelCandidates) {
    const bodyWithJsonFormat = {
      model,
      temperature: 0.5,
      response_format: { type: "json_object" },
      messages: baseMessages,
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(bodyWithJsonFormat),
    });

    if (response.ok) {
      const data = await response.json();
      const raw = data?.choices?.[0]?.message?.content || "{}";
      if (typeof raw === "string") {
        try {
          return JSON.parse(raw);
        } catch {
          return {};
        }
      }
      return raw && typeof raw === "object" ? raw : {};
    }

    const detail = await response.text();
    lastError = `OpenAI error: ${response.status} ${detail}`;

    const canRetryWithoutJsonFormat =
      response.status === 400 && /response_format|json_object|unsupported/i.test(detail);
    if (!canRetryWithoutJsonFormat) {
      continue;
    }

    const bodyWithoutJsonFormat = {
      model,
      temperature: 0.5,
      messages: baseMessages,
    };

    const fallbackResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify(bodyWithoutJsonFormat),
    });

    if (fallbackResponse.ok) {
      const data = await fallbackResponse.json();
      const raw = data?.choices?.[0]?.message?.content || "{}";
      if (typeof raw === "string") {
        try {
          return JSON.parse(raw);
        } catch {
          return {};
        }
      }
      return raw && typeof raw === "object" ? raw : {};
    }

    const fallbackDetail = await fallbackResponse.text();
    lastError = `OpenAI error: ${fallbackResponse.status} ${fallbackDetail}`;
  }

  throw new Error(lastError);
}
