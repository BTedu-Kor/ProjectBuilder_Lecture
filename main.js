const resultsEl = document.getElementById("results");
const metaEl = document.getElementById("meta");
const generateBtn = document.getElementById("generateBtn");
const copyBtn = document.getElementById("copyBtn");
const resetBtn = document.getElementById("resetBtn");
const setCountEl = document.getElementById("setCount");
const sortModeEl = document.getElementById("sortMode");
const dupModeEl = document.getElementById("dupMode");

const MIN = 1;
const MAX = 45;
const PICK = 6;

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

function render(sets) {
  resultsEl.innerHTML = "";
  sets.forEach((nums, idx) => {
    const card = document.createElement("div");
    card.className = "result-card";

    const head = document.createElement("div");
    head.className = "result-head";
    head.textContent = `세트 ${idx + 1}`;

    const balls = document.createElement("div");
    balls.className = "balls";
    nums.forEach((n) => balls.appendChild(createPill(n)));

    const raw = document.createElement("div");
    raw.className = "raw";
    raw.textContent = formatSet(nums);

    card.appendChild(head);
    card.appendChild(balls);
    card.appendChild(raw);
    resultsEl.appendChild(card);
  });

  const now = new Date();
  metaEl.textContent = `${now.toLocaleString("ko-KR")} · ${sets.length}세트`;
  copyBtn.disabled = sets.length === 0;
}

function clampCount(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return 1;
  return Math.min(10, Math.max(1, Math.floor(n)));
}

function generate() {
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

  render(sets);
  resultsEl.dataset.lastSets = JSON.stringify(sets);
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

reset();
