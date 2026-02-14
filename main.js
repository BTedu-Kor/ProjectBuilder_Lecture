const routes = ["setup", "chat", "report"];

const state = {
  clientId: "",
  setup: {
    conversationType: "child",
    ageGroup: "20대",
    gender: "",
    mbti: "",
    personaPreset: "예민",
  },
  chatLog: [],
  lastUserMessage: "",
  lastResponse: null,
  usage: {
    limit: 20,
    used: 0,
    remaining: 20,
    dayKey: "-",
  },
};

const elements = {
  setupSection: document.getElementById("setup"),
  chatSection: document.getElementById("chat"),
  reportSection: document.getElementById("report"),
  conversationType: document.getElementById("conversationType"),
  ageGroup: document.getElementById("ageGroup"),
  gender: document.getElementById("gender"),
  mbti: document.getElementById("mbti"),
  personaPreset: document.getElementById("personaPreset"),
  startChatBtn: document.getElementById("startChatBtn"),
  chatLog: document.getElementById("chatLog"),
  userInput: document.getElementById("userInput"),
  sendBtn: document.getElementById("sendBtn"),
  goReportBtn: document.getElementById("goReportBtn"),
  usageBadge: document.getElementById("usageBadge"),
  rewriteResult: document.getElementById("rewriteResult"),
  rewriteButtons: Array.from(document.querySelectorAll(".rewrite-btn")),
  reportContent: document.getElementById("reportContent"),
  createReportBtn: document.getElementById("createReportBtn"),
};

function getOrCreateClientId() {
  const key = "clientId";
  const stored = localStorage.getItem(key);
  if (stored) return stored;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

function currentRoute() {
  const hash = window.location.hash || "#/setup";
  const name = hash.replace("#/", "");
  return routes.includes(name) ? name : "setup";
}

function renderRoute() {
  const route = currentRoute();
  elements.setupSection.hidden = route !== "setup";
  elements.chatSection.hidden = route !== "chat";
  elements.reportSection.hidden = route !== "report";
}

function updateSetupState() {
  state.setup.conversationType = elements.conversationType.value;
  state.setup.ageGroup = elements.ageGroup.value;
  state.setup.gender = elements.gender.value;
  state.setup.mbti = (elements.mbti.value || "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  state.setup.personaPreset = elements.personaPreset.value;
  elements.mbti.value = state.setup.mbti;
}

function maskPersonalInfo(text) {
  let masked = text;
  let detected = false;

  const patterns = [
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
    /\b01[0-9][-\s]?\d{3,4}[-\s]?\d{4}\b/g,
    /\b\d{2,3}[-\s]?\d{3,4}[-\s]?\d{4}\b/g,
    /(주소|학교|연락처|전화번호|실명|카톡|인스타|instagram|kakao)/gi,
  ];

  patterns.forEach((pattern) => {
    if (pattern.test(masked)) {
      detected = true;
      masked = masked.replace(pattern, "[마스킹됨]");
    }
  });

  return { masked, detected };
}

function addMessage(role, text) {
  const item = document.createElement("div");
  item.className = `msg ${role}`;
  item.textContent = text;
  elements.chatLog.appendChild(item);
  elements.chatLog.scrollTop = elements.chatLog.scrollHeight;
}

function updateUsageBadge() {
  const u = state.usage;
  elements.usageBadge.textContent = `오늘 남은 무료 턴: ${u.remaining} (사용 ${u.used}/${u.limit}, 기준일 ${u.dayKey})`;
}

function renderRewriteSuggestions(data) {
  const lines = (data.rewriteSuggestions || [])
    .map((x) => `${x.label}: ${x.text}`)
    .join("\n");
  elements.rewriteResult.textContent = lines || "재작성 제안이 아직 없습니다.";
}

function renderReport(data) {
  const emotion = (data.emotionGuess || []).join(", ") || "-";
  const needs = (data.needsGuess || []).join(", ") || "-";
  const rewrites = (data.rewriteSuggestions || []).map((x) => `<li><strong>${x.label}</strong>: ${escapeHtml(x.text)}</li>`).join("");
  const flags = (data.safetyFlags || []).length
    ? `<p><strong>안전 플래그:</strong> ${escapeHtml(data.safetyFlags.join(", "))}</p>`
    : "";

  elements.reportContent.innerHTML = `
    <div class="report-block"><strong>감정 가능성</strong><p>${escapeHtml(emotion)}</p></div>
    <div class="report-block"><strong>니즈 가능성</strong><p>${escapeHtml(needs)}</p></div>
    <div class="report-block"><strong>잘한 점 / 개선점</strong><p>${escapeHtml(data.personaReply || "-")}</p></div>
    <div class="report-block"><strong>추천 대안문장 3개</strong><ul>${rewrites}</ul></div>
    ${flags}
  `;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-client-id": state.clientId,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  return { response, data };
}

async function sendChat() {
  updateSetupState();
  const rawText = elements.userInput.value.trim();
  if (!rawText) return;

  const { masked, detected } = maskPersonalInfo(rawText);
  if (detected) {
    alert("개인정보로 보이는 내용이 감지되어 일부가 [마스킹됨] 처리되었습니다.");
  }

  state.lastUserMessage = masked;
  state.chatLog.push({ role: "user", text: masked });
  addMessage("user", masked);
  elements.userInput.value = "";
  elements.sendBtn.disabled = true;

  try {
    const { response, data } = await postJson("/api/chat", {
      setup: state.setup,
      message: masked,
      chatLog: state.chatLog,
    });

    if (data.usage) {
      state.usage = data.usage;
      updateUsageBadge();
    }

    if (response.status === 429) {
      addMessage("assistant", "오늘 무료 턴이 소진되었습니다. 리포트를 확인하거나 내일 다시 시도해 주세요.");
      window.location.hash = "#/report";
      return;
    }

    if (!response.ok) {
      addMessage("assistant", "응답 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    state.lastResponse = data;
    const reply = data.personaReply || "(응답 없음)";
    state.chatLog.push({ role: "assistant", text: reply });
    addMessage("assistant", reply);
    renderRewriteSuggestions(data);
  } catch (error) {
    addMessage("assistant", "네트워크 오류가 발생했습니다.");
  } finally {
    elements.sendBtn.disabled = false;
  }
}

function applyRewrite(label) {
  if (!state.lastResponse?.rewriteSuggestions) {
    elements.rewriteResult.textContent = "먼저 대화를 보내면 재작성 제안을 받을 수 있습니다.";
    return;
  }
  const picked = state.lastResponse.rewriteSuggestions.find((x) => x.label === label);
  if (!picked) return;
  elements.rewriteResult.textContent = `${picked.label}: ${picked.text}`;
}

async function createReport() {
  if (!state.chatLog.length) {
    elements.reportContent.textContent = "대화 로그가 없어 리포트를 생성할 수 없습니다.";
    return;
  }

  elements.createReportBtn.disabled = true;
  try {
    const { response, data } = await postJson("/api/report", {
      setup: state.setup,
      chatLog: state.chatLog,
      lastUserMessage: state.lastUserMessage,
    });

    if (!response.ok) {
      elements.reportContent.textContent = "리포트 생성에 실패했습니다.";
      return;
    }

    if (data.usage) {
      state.usage = data.usage;
      updateUsageBadge();
    }

    renderReport(data);
  } catch (error) {
    elements.reportContent.textContent = "네트워크 오류가 발생했습니다.";
  } finally {
    elements.createReportBtn.disabled = false;
  }
}

function bindEvents() {
  window.addEventListener("hashchange", renderRoute);

  elements.startChatBtn.addEventListener("click", () => {
    updateSetupState();
    window.location.hash = "#/chat";
  });

  elements.sendBtn.addEventListener("click", sendChat);
  elements.goReportBtn.addEventListener("click", () => {
    window.location.hash = "#/report";
  });

  elements.rewriteButtons.forEach((button) => {
    button.addEventListener("click", () => {
      applyRewrite(button.dataset.rewrite || "");
    });
  });

  elements.createReportBtn.addEventListener("click", createReport);
}

function init() {
  state.clientId = getOrCreateClientId();
  bindEvents();
  if (!window.location.hash) {
    window.location.hash = "#/setup";
  }
  renderRoute();
  updateUsageBadge();
}

init();
