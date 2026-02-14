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

export async function callOpenAI(env, systemPrompt, userPayload) {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is missing");
  }

  const body = {
    model: env.OPENAI_MODEL || "gpt-4.1-mini",
    temperature: 0.5,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify(userPayload) },
    ],
  };

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${detail}`);
  }

  const data = await response.json();
  const raw = data?.choices?.[0]?.message?.content || "{}";

  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}
