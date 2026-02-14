import { callOpenAI, classifyOpenAIError, jsonResponse } from "../_lib/app.js";

function isAuthorized(request, env) {
  const token = String(env.HEALTHCHECK_TOKEN || "").trim();
  if (!token) return true;
  const url = new URL(request.url);
  const provided = request.headers.get("x-health-token") || url.searchParams.get("token") || "";
  return provided === token;
}

export async function onRequestGet(context) {
  const { env, request } = context;

  if (!isAuthorized(request, env)) {
    return jsonResponse(
      {
        ok: false,
        error: "unauthorized",
      },
      401
    );
  }

  const checks = {
    db: { ok: false },
    openai: { ok: false, model: String(env.OPENAI_MODEL || "gpt-4.1-mini") },
  };

  if (!env.DB) {
    checks.db = {
      ok: false,
      error: "missing_db_binding",
    };
  } else {
    try {
      await env.DB.prepare("SELECT 1 as ok").first();
      checks.db = { ok: true };
    } catch (error) {
      checks.db = {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (!env.OPENAI_API_KEY) {
    checks.openai = {
      ok: false,
      model: checks.openai.model,
      error: "OPENAI_API_KEY is missing",
      flag: "server_config_error",
    };
  } else {
    try {
      await callOpenAI(
        env,
        "health check: return JSON object only with keys ok(boolean), provider(string).",
        { ping: true, ts: Date.now() }
      );
      checks.openai = {
        ok: true,
        model: checks.openai.model,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      const classified = classifyOpenAIError(detail);
      checks.openai = {
        ok: false,
        model: checks.openai.model,
        error: classified.message,
        flag: classified.flag,
      };
    }
  }

  const ok = checks.db.ok && checks.openai.ok;
  return jsonResponse(
    {
      ok,
      timestamp: new Date().toISOString(),
      checks,
    },
    ok ? 200 : 503
  );
}
