"use strict";

// 試験ガイドのブループリント（分野・スキルと配点比率）
const DOMAINS = {
  AW: { name: "エージェントとワークフロー", weight: 14.7 },
  AI: { name: "アプリケーションと統合", weight: 33.1 },
  CC: { name: "Claude Code", weight: 3.1 },
  ET: { name: "評価、テスト、デバッグ", weight: 2.6 },
  MS: { name: "モデルの選択と最適化", weight: 16.8 },
  PC: { name: "プロンプトとコンテキストのエンジニアリング", weight: 11.0 },
  SS: { name: "セキュリティと安全性", weight: 8.1 },
  TM: { name: "ツールとMCP", weight: 10.6 }
};
const SKILLS = {
  AW1: { name: "エージェントアーキテクチャ", weight: 4.5 },
  AW2: { name: "Claudeによるエージェントの構築", weight: 5.3 },
  AW3: { name: "エージェントのパターンとフレームワーク", weight: 4.9 },
  AI1: { name: "Claudeアプリケーションの設計", weight: 8.6 },
  AI2: { name: "ソフトウェアエンジニアリングの基礎", weight: 7.4 },
  AI3: { name: "Claude APIの仕組み", weight: 6.8 },
  AI4: { name: "構成管理", weight: 4.1 },
  AI5: { name: "要件の理解", weight: 3.4 },
  AI6: { name: "システムライフサイクル", weight: 2.8 },
  CC1: { name: "Claude Codeの操作", weight: 3.1 },
  ET1: { name: "デバッグとエラー処理", weight: 2.6 },
  MS1: { name: "技術的な基礎", weight: 6.1 },
  MS2: { name: "LLMの基礎", weight: 5.2 },
  MS3: { name: "コストとトークンの管理", weight: 2.8 },
  MS4: { name: "モデルの選択とトレードオフ", weight: 2.7 },
  PC1: { name: "プロンプトエンジニアリング", weight: 4.6 },
  PC2: { name: "コンテキストエンジニアリング", weight: 3.8 },
  PC3: { name: "出力の処理", weight: 2.6 },
  SS1: { name: "AIアプリケーションのセキュリティ", weight: 3.2 },
  SS2: { name: "ガードレールと安全なデプロイ", weight: 2.3 },
  SS3: { name: "ID、シークレット、キーの管理", weight: 1.6 },
  SS4: { name: "Claudeのフック", weight: 1.0 },
  TM1: { name: "ツールの実装", weight: 4.4 },
  TM2: { name: "エージェントのカスタマイズ", weight: 4.1 },
  TM3: { name: "MCPサーバーの開発", weight: 2.1 }
};
const LETTERS = ["A", "B", "C", "D"];
const PASS_RATE = 0.72; // スケールスコア720/1000に相当するわけではない、あくまで目安
const STORAGE_KEY = "ccdvf-quiz-v1";

// ---------- データの準備 ----------
const byId = {};
const setOf = {};
for (const set of QUESTION_SETS) {
  // 分野が偏らないよう、セットごとに固定シードで出題順を混ぜる（番号は常に同じになる）
  set.order = seededShuffle(set.questions.map(q => q.id), hashString(set.id));
  for (const q of set.questions) {
    byId[q.id] = q;
    setOf[q.id] = set;
  }
}

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function seededShuffle(arr, seed) {
  const a = arr.slice();
  let t = seed;
  const rand = () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const domainOf = q => q.s.slice(0, 2);

// ---------- 保存 ----------
let store = { answers: {}, bookmarks: {}, pos: {} };
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) store = Object.assign(store, JSON.parse(raw));
} catch (e) { /* 保存できない環境でも動作させる */ }
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) { /* ignore */ }
}
const isBookmarked = id => !!store.bookmarks[id];
const answerOf = id => store.answers[id];
const isCorrect = id => answerOf(id) === byId[id].a;

// ---------- 画面の状態 ----------
// session: { mode, title, ids, idx }
let session = null;
let view = "home";

const app = document.getElementById("app");
document.getElementById("home-link").addEventListener("click", e => { e.preventDefault(); goHome(); });

function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// `code` 記法だけを許可したテキスト整形
function fmt(s) {
  return esc(s).replace(/`([^`]+)`/g, "<code>$1</code>");
}

function goHome() {
  view = "home";
  session = null;
  render();
  window.scrollTo(0, 0);
}

function startSession(mode, title, ids, idx) {
  if (!ids.length) return;
  session = { mode, title, ids, idx: Math.min(idx || 0, ids.length - 1) };
  view = "quiz";
  render();
  window.scrollTo(0, 0);
}

function startSet(setId, fromStart) {
  const set = QUESTION_SETS.find(s => s.id === setId);
  let idx = 0;
  if (!fromStart) {
    // 続きから：保存位置、なければ最初の未回答
    const firstUnanswered = set.order.findIndex(id => answerOf(id) === undefined);
    idx = store.pos[setId] ?? (firstUnanswered < 0 ? 0 : firstUnanswered);
  }
  startSession("set:" + setId, set.title, set.order, idx);
}

function resetSet(setId) {
  const set = QUESTION_SETS.find(s => s.id === setId);
  if (!confirm(set.title + "の解答記録を消去します。ブックマークは残ります。よろしいですか？")) return;
  for (const id of set.order) delete store.answers[id];
  delete store.pos[setId];
  save();
  render();
}

function allIdsInOrder() {
  return QUESTION_SETS.flatMap(s => s.order);
}
function bookmarkedIds() {
  return allIdsInOrder().filter(isBookmarked);
}
function wrongIds() {
  return allIdsInOrder().filter(id => answerOf(id) !== undefined && !isCorrect(id));
}

// 問題の表示番号（例：セット1 Q12）
function labelOf(id) {
  const set = setOf[id];
  return set.title + " Q" + (set.order.indexOf(id) + 1);
}

// ---------- ホーム ----------
function renderHome() {
  const setCards = QUESTION_SETS.map(set => {
    const answered = set.order.filter(id => answerOf(id) !== undefined).length;
    const correct = set.order.filter(id => answerOf(id) !== undefined && isCorrect(id)).length;
    const total = set.order.length;
    const pct = Math.round((answered / total) * 100);
    return `
      <div class="card">
        <h3>${esc(set.title)}</h3>
        <div class="meta">${total}問 ・ 解答済み ${answered} ・ 正解 ${correct}${answered ? `（正答率 ${Math.round((correct / answered) * 100)}%）` : ""}</div>
        <div class="bar"><span style="width:${pct}%"></span></div>
        <div class="actions">
          <button class="btn primary" data-act="continue" data-set="${set.id}">${answered ? "続きから" : "開始"}</button>
          <button class="btn" data-act="restart" data-set="${set.id}">最初から</button>
          <button class="btn" data-act="result" data-set="${set.id}" ${answered ? "" : "disabled"}>結果</button>
          <button class="btn" data-act="reset" data-set="${set.id}" ${answered ? "" : "disabled"}>記録を消去</button>
        </div>
      </div>`;
  }).join("");

  const bm = bookmarkedIds();
  const wr = wrongIds();

  const coverage = Object.entries(DOMAINS).map(([code, d], i) => {
    const counts = QUESTION_SETS.map(set => set.questions.filter(q => domainOf(q) === code).length);
    return `<tr><td>${i + 1}. ${esc(d.name)}</td><td class="num">${d.weight}%</td>${counts.map(c => `<td class="num">${c}</td>`).join("")}</tr>`;
  }).join("");

  return `
    <h1>CCDV-F 試験対策問題集</h1>
    <p class="lead">Claude Certified Developer – Foundations の試験ガイドのブループリント（8分野・25スキル）の配点比率に沿って作成した、本番と同じ53問のセットが2つあります。2セットで全25スキルをカバーしています。</p>
    <p class="lead">選択肢を選ぶと、すぐに正解・不正解と解説が表示されます。☆で後から見返したい問題に印を付けられます。</p>

    <h2>問題セット</h2>
    <div class="grid">${setCards}</div>

    <h2>見直し</h2>
    <div class="grid">
      <div class="card">
        <h3>★ ブックマークした問題</h3>
        <div class="meta">${bm.length}問</div>
        <div class="actions">
          <button class="btn primary" data-act="bookmarks" ${bm.length ? "" : "disabled"}>解く</button>
          <button class="btn" data-act="bmlist" ${bm.length ? "" : "disabled"}>一覧</button>
        </div>
      </div>
      <div class="card">
        <h3>✕ 間違えた問題</h3>
        <div class="meta">${wr.length}問（最後の解答が不正解のもの。解き直しを始めると解答記録がリセットされます）</div>
        <div class="actions">
          <button class="btn primary" data-act="wrong" ${wr.length ? "" : "disabled"}>解き直す</button>
        </div>
      </div>
    </div>

    <h2>出題範囲と問題数</h2>
    <div class="card table-wrap">
      <table>
        <thead><tr><th>分野</th><th class="num">配点比率</th>${QUESTION_SETS.map(s => `<th class="num">${esc(s.title)}</th>`).join("")}</tr></thead>
        <tbody>${coverage}</tbody>
      </table>
    </div>
    <p class="hint">「提供問題」タグの付いた問題は、提供された問題を和訳したものです。それ以外はオリジナル問題です。本番には複数選択式の問題も含まれますが、この問題集はすべて4択の択一式です。</p>
  `;
}

// ---------- 出題 ----------
function renderQuiz() {
  const { ids, idx, title } = session;
  const id = ids[idx];
  const q = byId[id];
  const ans = answerOf(id);
  const answered = ans !== undefined;
  const bm = isBookmarked(id);
  const doneCount = ids.filter(x => answerOf(x) !== undefined).length;
  const sub = session.mode.startsWith("set:") ? "" : `<span class="tag plain">${esc(labelOf(id))}</span>`;

  const choices = q.c.map((text, i) => {
    let cls = "choice";
    let flag = "";
    if (answered) {
      if (i === q.a) { cls += " correct"; flag = "正解"; }
      else if (i === ans) { cls += " wrong"; flag = "あなたの解答"; }
    }
    return `<button class="${cls}" data-choice="${i}" ${answered ? "disabled" : ""}>
      <span class="letter">${LETTERS[i]}.</span><span>${fmt(text)}</span>${flag ? `<span class="flag">${flag}</span>` : ""}
    </button>`;
  }).join("");

  const result = answered ? `
    <div class="result ${ans === q.a ? "ok" : "ng"}">
      <div class="verdict">${ans === q.a ? "○ 正解" : "✕ 不正解"}　正解は ${LETTERS[q.a]}</div>
      <p>${fmt(q.e)}</p>
    </div>` : "";

  const palette = ids.map((pid, i) => {
    let cls = "pal";
    const a = answerOf(pid);
    if (a !== undefined) cls += a === byId[pid].a ? " ok" : " ng";
    if (i === idx) cls += " current";
    return `<button class="${cls}" data-jump="${i}" title="${esc(labelOf(pid))}">${i + 1}${isBookmarked(pid) ? '<span class="star">★</span>' : ""}</button>`;
  }).join("");

  const last = idx === ids.length - 1;

  return `
    <div class="quiz-top">
      <span class="quiz-title">${esc(title)}</span>
      <span class="progress">解答済み ${doneCount} / ${ids.length}</span>
    </div>
    <div class="card">
      <div class="qhead">
        <span class="qnum">問題 ${idx + 1} / ${ids.length}</span>
        <button class="mark-btn ${bm ? "on" : ""}" data-act="mark" aria-pressed="${bm}">${bm ? "★ ブックマーク中" : "☆ ブックマーク"}</button>
      </div>
      <div class="tags">
        <span class="tag">${esc(DOMAINS[domainOf(q)].name)}</span>
        <span class="tag plain">${esc(SKILLS[q.s].name)}</span>
        ${q.src === 1 ? '<span class="tag plain">提供問題</span>' : ""}
        ${sub}
      </div>
      <div class="qtext">${fmt(q.q)}</div>
      <div class="choices">${choices}</div>
      ${result}
      <div class="nav">
        <button class="btn" data-act="prev" ${idx === 0 ? "disabled" : ""}>← 前へ</button>
        <span class="actions">
          ${answered ? '<button class="btn" data-act="retry">解き直す</button>' : ""}
          ${last
            ? `<button class="btn primary" data-act="finish">結果を見る</button>`
            : `<button class="btn primary" data-act="next">次へ →</button>`}
        </span>
      </div>
      <div class="hint">キーボード：A〜D または 1〜4 で解答、← → で移動、S でブックマーク</div>
    </div>
    <details class="pal-wrap" open>
      <summary>問題一覧（緑＝正解、赤＝不正解、★＝ブックマーク）</summary>
      <div class="palette">${palette}</div>
    </details>
    <div class="nav"><button class="btn" data-act="home">ホームに戻る</button></div>
  `;
}

// ---------- 結果 ----------
function renderResult() {
  const { ids, title } = session;
  const answered = ids.filter(id => answerOf(id) !== undefined);
  const correct = answered.filter(isCorrect);
  const rate = answered.length ? correct.length / answered.length : 0;

  const rows = Object.entries(DOMAINS).map(([code, d]) => {
    const qs = ids.filter(id => domainOf(byId[id]) === code);
    if (!qs.length) return "";
    const a = qs.filter(id => answerOf(id) !== undefined);
    const c = a.filter(isCorrect);
    return `<tr><td>${esc(d.name)}</td><td class="num">${c.length} / ${qs.length}</td><td class="num">${a.length ? Math.round((c.length / a.length) * 100) + "%" : "-"}</td></tr>`;
  }).join("");

  const wrongRows = ids.map((id, i) => ({ id, i })).filter(({ id }) => answerOf(id) !== undefined && !isCorrect(id))
    .map(({ id, i }) => `<tr class="list-q" data-jump="${i}"><td class="num">${i + 1}</td><td>${esc(byId[id].q.slice(0, 70))}…</td></tr>`).join("");

  return `
    <h1>${esc(title)} の結果</h1>
    <div class="card">
      <div class="score-big ${rate >= PASS_RATE ? "pass" : "fail"}">${Math.round(rate * 100)}%</div>
      <div class="meta">正解 ${correct.length} / 解答 ${answered.length}（全${ids.length}問）</div>
      <p class="hint">本番の合格点はスケールスコア720/1000です。正答率とは単純に対応しませんが、目安として72%以上を緑で表示しています。</p>
    </div>
    <h2>分野別</h2>
    <div class="card table-wrap">
      <table><thead><tr><th>分野</th><th class="num">正解 / 問題数</th><th class="num">正答率</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <h2>間違えた問題</h2>
    <div class="card table-wrap">
      ${wrongRows ? `<table><tbody>${wrongRows}</tbody></table>` : '<p class="empty">ありません。</p>'}
    </div>
    <div class="nav">
      <button class="btn" data-act="back">問題に戻る</button>
      <button class="btn primary" data-act="home">ホームに戻る</button>
    </div>
  `;
}

// ---------- ブックマーク一覧 ----------
function renderBookmarkList() {
  const ids = bookmarkedIds();
  const rows = ids.map((id, i) => {
    const a = answerOf(id);
    const st = a === undefined ? "未解答" : (a === byId[id].a ? "○" : "✕");
    return `<tr class="list-q" data-bm="${i}"><td>${esc(labelOf(id))}</td><td>${esc(DOMAINS[domainOf(byId[id])].name)}</td><td>${esc(byId[id].q.slice(0, 60))}…</td><td class="num">${st}</td></tr>`;
  }).join("");
  return `
    <h1>★ ブックマークした問題</h1>
    <div class="card table-wrap">
      ${rows ? `<table><thead><tr><th>問題</th><th>分野</th><th>問題文</th><th class="num">結果</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="empty">ブックマークした問題はありません。</p>'}
    </div>
    <div class="nav"><button class="btn primary" data-act="home">ホームに戻る</button></div>
  `;
}

function render() {
  if (view === "home") app.innerHTML = renderHome();
  else if (view === "quiz") app.innerHTML = renderQuiz();
  else if (view === "result") app.innerHTML = renderResult();
  else if (view === "bmlist") app.innerHTML = renderBookmarkList();
  if (view === "quiz" && session.mode.startsWith("set:")) {
    store.pos[session.mode.slice(4)] = session.idx;
    save();
  }
}

// ---------- 操作 ----------
function answer(i) {
  const id = session.ids[session.idx];
  if (answerOf(id) !== undefined) return;
  store.answers[id] = i;
  save();
  render();
}
function move(delta) {
  const n = session.idx + delta;
  if (n < 0 || n >= session.ids.length) return;
  session.idx = n;
  render();
  window.scrollTo(0, 0);
}
function toggleMark() {
  const id = session.ids[session.idx];
  if (store.bookmarks[id]) delete store.bookmarks[id];
  else store.bookmarks[id] = true;
  save();
  render();
}

app.addEventListener("click", e => {
  const el = e.target.closest("button, tr[data-jump], tr[data-bm]");
  if (!el || el.disabled) return;
  if (el.dataset.choice !== undefined) return answer(Number(el.dataset.choice));
  if (el.dataset.jump !== undefined) {
    session.idx = Number(el.dataset.jump);
    view = "quiz";
    render();
    window.scrollTo(0, 0);
    return;
  }
  if (el.dataset.bm !== undefined) return startSession("bookmarks", "ブックマークした問題", bookmarkedIds(), Number(el.dataset.bm));
  const set = el.dataset.set;
  switch (el.dataset.act) {
    case "continue": return startSet(set, false);
    case "restart": return startSet(set, true);
    case "reset": return resetSet(set);
    case "result": {
      const s = QUESTION_SETS.find(x => x.id === set);
      session = { mode: "set:" + set, title: s.title, ids: s.order, idx: store.pos[set] || 0 };
      view = "result";
      render();
      return;
    }
    case "bookmarks": return startSession("bookmarks", "ブックマークした問題", bookmarkedIds(), 0);
    case "bmlist": view = "bmlist"; render(); return;
    case "wrong": return startSession("wrong", "間違えた問題の解き直し", wrongIds().map(id => { delete store.answers[id]; return id; }), 0);
    case "mark": return toggleMark();
    case "prev": return move(-1);
    case "next": return move(1);
    case "retry": delete store.answers[session.ids[session.idx]]; save(); render(); return;
    case "finish": view = "result"; render(); window.scrollTo(0, 0); return;
    case "back": view = "quiz"; render(); return;
    case "home": return goHome();
  }
});

document.addEventListener("keydown", e => {
  if (view !== "quiz" || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  const map = { a: 0, b: 1, c: 2, d: 3, "1": 0, "2": 1, "3": 2, "4": 3 };
  if (k === "arrowleft") move(-1);
  else if (k === "arrowright") move(1);
  else if (k === "s") toggleMark();
  else if (k in map) answer(map[k]);
});

render();
