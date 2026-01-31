const resultsEl = document.getElementById("results");
const metaEl = document.getElementById("meta");
const generateBtn = document.getElementById("generateBtn");
const copyBtn = document.getElementById("copyBtn");
const resetBtn = document.getElementById("resetBtn");
const setCountEl = document.getElementById("setCount");
const sortModeEl = document.getElementById("sortMode");
const dupModeEl = document.getElementById("dupMode");
const themeToggle = document.getElementById("themeToggle");

const MIN = 1;
const MAX = 45;
const PICK = 6;
const DRAW_DELAY = 520;
const ROLL_DELAY = 320;

let isDrawing = false;

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function generateSet(allowDupes) {
  const nums = [];
  const used = new Set();

  while (nums.length < PICK) {
    const n = randInt(MIN, MAX);
    if (allowDupes || !used.has(n)) {
      nums.push(n);
      used.add(n);
    }
  }

  return nums;
}

function formatSet(nums) {
  return nums.map((n) => String(n).padStart(2, "0")).join(" · ");
}

function createPill(num) {
  const pill = document.createElement("span");
  pill.className = "ball";
  pill.textContent = String(num).padStart(2, "0");
  return pill;
}

function createRollingPill() {
  const pill = document.createElement("span");
  pill.className = "ball rolling";
  pill.textContent = "??";
  return pill;
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function clampCount(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return 1;
  return Math.min(10, Math.max(1, Math.floor(n)));
}

function lockControls(locked) {
  isDrawing = locked;
  generateBtn.disabled = locked;
  copyBtn.disabled = locked;
  resetBtn.disabled = locked;
  setCountEl.disabled = locked;
  sortModeEl.disabled = locked;
  dupModeEl.disabled = locked;
}

function updateThemeButton(theme) {
  const icon = theme === "dark" ? "🌙" : "☀️";
  const label = theme === "dark" ? "Dark" : "Light";
  themeToggle.querySelector(".theme-icon").textContent = icon;
  themeToggle.querySelector(".theme-label").textContent = label;
  themeToggle.setAttribute("aria-label", `${label} 모드`);
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  localStorage.setItem("theme", theme);
  updateThemeButton(theme);
}

function initTheme() {
  const stored = localStorage.getItem("theme");
  const preferDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  const theme = stored || (preferDark ? "dark" : "light");
  applyTheme(theme);
}

async function generate() {
  if (isDrawing) return;
  const count = clampCount(setCountEl.value);
  setCountEl.value = count;

  const allowDupes = dupModeEl.value === "yes";
  const sortMode = sortModeEl.value;

  const sets = [];
  for (let i = 0; i < count; i += 1) {
    const nums = generateSet(allowDupes);
    if (sortMode === "asc") nums.sort((a, b) => a - b);
    sets.push(nums);
  }

  resultsEl.innerHTML = "";
  resultsEl.dataset.lastSets = "";
  const now = new Date();
  metaEl.textContent = `${now.toLocaleString("ko-KR")} · ${sets.length}세트 생성 중...`;
  lockControls(true);

  for (let i = 0; i < sets.length; i += 1) {
    const nums = sets[i];
    const card = document.createElement("div");
    card.className = "result-card";

    const head = document.createElement("div");
    head.className = "result-head";
    head.textContent = `세트 ${i + 1}`;

    const balls = document.createElement("div");
    balls.className = "balls";

    const raw = document.createElement("div");
    raw.className = "raw";
    raw.textContent = "추첨 중...";

    card.appendChild(head);
    card.appendChild(balls);
    card.appendChild(raw);
    resultsEl.appendChild(card);

    for (let j = 0; j < nums.length; j += 1) {
      const rolling = createRollingPill();
      balls.appendChild(rolling);
      await sleep(ROLL_DELAY);
      rolling.classList.remove("rolling");
      rolling.classList.add("reveal");
      rolling.textContent = String(nums[j]).padStart(2, "0");
      await sleep(DRAW_DELAY - ROLL_DELAY);
    }
    raw.textContent = formatSet(nums);
  }

  resultsEl.dataset.lastSets = JSON.stringify(sets);
  metaEl.textContent = `${now.toLocaleString("ko-KR")} · ${sets.length}세트`;
  lockControls(false);
}

function reset() {
  resultsEl.innerHTML = "";
  resultsEl.dataset.lastSets = "";
  metaEl.textContent = "아직 생성된 번호가 없습니다.";
  copyBtn.disabled = true;
}

function copyToClipboard() {
  const raw = resultsEl.dataset.lastSets;
  if (!raw) return;
  const sets = JSON.parse(raw);
  const lines = sets.map((nums, idx) => `세트 ${idx + 1}: ${formatSet(nums)}`);

  navigator.clipboard
    .writeText(lines.join("\n"))
    .then(() => {
      copyBtn.textContent = "복사됨!";
      setTimeout(() => {
        copyBtn.textContent = "복사";
      }, 1200);
    })
    .catch(() => {
      alert("복사에 실패했습니다. 브라우저 권한을 확인해 주세요.");
    });
}

generateBtn.addEventListener("click", generate);
resetBtn.addEventListener("click", reset);
copyBtn.addEventListener("click", copyToClipboard);
themeToggle.addEventListener("click", () => {
  const next = document.body.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
});

initTheme();
reset();
