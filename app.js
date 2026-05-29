/* ============================================================
   AI Prompt Log — app.js
   GitHub Pages 정적 사이트 + GitHub 토큰 연결 방식
   데이터 저장: GitHub Issues API
   ============================================================ */

// ──────────────────────────────────────────────
// 설정 (config.js 에서 덮어쓰기 가능)
// ──────────────────────────────────────────────
const CONFIG = window.SITE_CONFIG || {};

const ACCESS_CODE    = CONFIG.accessCode    || 'dlatldkagh1!'; // 접근 코드 (변경 가능)
const REPO_OWNER     = CONFIG.repoOwner    || '';             // GitHub 사용자명
const REPO_NAME      = CONFIG.repoName     || '';             // 저장소 이름
const ISSUE_LABEL    = CONFIG.issueLabel   || 'ai-prompt-log'; // Issues 라벨
const DEFAULT_BRANCH = CONFIG.branch       || 'main';         // 이미지 파일 저장 브랜치
const PUBLIC_TOKEN   = CONFIG.publicToken  || '';             // 공개 저장 토큰 (노출 주의)
const API_BASE_URL   = (CONFIG.apiBaseUrl || '').replace(/\/+$/, ''); // Cloudflare Worker API

// ──────────────────────────────────────────────
// 상태
// ──────────────────────────────────────────────
let currentUser   = null;
let accessToken   = null;
let allRecords    = [];
let currentFilter = 'all';

// ──────────────────────────────────────────────
// DOM 참조
// ──────────────────────────────────────────────
const $ = id => document.getElementById(id);

const lockScreen     = $('lock-screen');
const app            = $('app');
const accessInput    = $('access-code-input');
const unlockBtn      = $('unlock-btn');
const lockError      = $('lock-error');

const loginBtn       = $('login-btn');
const logoutBtn      = $('logout-btn');
const userInfo       = $('user-info');
const userAvatar     = $('user-avatar');
const userName       = $('user-name');
const addBtn         = $('add-btn');

const gallery        = $('gallery');
const loadingMsg     = $('loading');
const emptyMsg       = $('empty-msg');

const modalOverlay   = $('modal-overlay');
const modalClose     = $('modal-close');
const modalCancel    = $('modal-cancel');
const modalSave      = $('modal-save');
const aiRadios       = document.querySelectorAll('input[name="ai-choice"]');
const aiCustom       = $('ai-custom');
const recordTitle    = $('record-title');
const recordPrompt   = $('record-prompt');
const recordImage    = $('record-image');
const recordImageFile = $('record-image-file');
const addImageUrlBtn = $('add-image-url-btn');
const pasteImageBtn  = $('paste-image-btn');
const imagePreviewWrap = $('image-preview-wrap');
const compareToggle  = $('compare-toggle');
const normalImagePanel = $('normal-image-panel');
const compareImagePanel = $('compare-image-panel');
const originalImageUrl = $('original-image-url');
const modifiedImageUrl = $('modified-image-url');
const addOriginalUrlBtn = $('add-original-url-btn');
const addModifiedUrlBtn = $('add-modified-url-btn');
const originalImageFile = $('original-image-file');
const modifiedImageFile = $('modified-image-file');
const pasteOriginalBtn = $('paste-original-btn');
const pasteModifiedBtn = $('paste-modified-btn');
const originalPreview = $('original-preview');
const modifiedPreview = $('modified-preview');
const pasteCatcher = $('paste-catcher');
const imageStatus   = $('image-status');
const recordMemo     = $('record-memo');

const detailOverlay  = $('detail-overlay');
const detailClose    = $('detail-close');

let imageItemSeq = 0;
let pendingImages = [];
let compareOriginal = null;
let compareModified = null;
let lastPasteTarget = 'normal';

function useWorkerApi() {
  return !!API_BASE_URL;
}

function workerUrl(path) {
  return `${API_BASE_URL}${path}`;
}

async function workerFetch(path, options = {}) {
  const headers = {
    Accept: 'application/json',
    'X-Access-Code': sessionStorage.getItem('access_code') || ACCESS_CODE,
    ...(options.headers || {})
  };

  const res = await fetch(workerUrl(path), { ...options, headers });
  if (!res.ok) {
    let message = `API 오류: ${res.status}`;
    try {
      const err = await res.json();
      message = err.message || err.error || message;
    } catch {}
    throw new Error(message);
  }
  return res;
}

// ──────────────────────────────────────────────
// 1. 잠금 화면
// ──────────────────────────────────────────────
function checkLock() {
  const unlocked = sessionStorage.getItem('unlocked');
  if (unlocked === 'true') {
    showApp();
  }
}

function showApp() {
  lockScreen.classList.add('hidden');
  app.classList.remove('hidden');
  initAuth();
}

unlockBtn.addEventListener('click', tryUnlock);
accessInput.addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });

function tryUnlock() {
  const val = accessInput.value.trim();
  if (val === ACCESS_CODE) {
    sessionStorage.setItem('unlocked', 'true');
    sessionStorage.setItem('access_code', val);
    lockError.textContent = '';
    showApp();
  } else {
    lockError.textContent = '접근 코드가 올바르지 않습니다.';
    accessInput.value = '';
    accessInput.focus();
    // 흔들기 애니메이션
    const box = document.querySelector('.lock-box');
    box.style.animation = 'none';
    box.offsetHeight;
    box.style.animation = 'shake 0.4s ease';
  }
}

// CSS 흔들기 애니메이션 동적 추가
const shakeStyle = document.createElement('style');
shakeStyle.textContent = `
@keyframes shake {
  0%,100%{transform:translateX(0)}
  20%{transform:translateX(-8px)}
  40%{transform:translateX(8px)}
  60%{transform:translateX(-6px)}
  80%{transform:translateX(6px)}
}`;
document.head.appendChild(shakeStyle);

// ──────────────────────────────────────────────
// 2. GitHub 토큰 연결
// ──────────────────────────────────────────────
function initAuth() {
  if (useWorkerApi()) {
    enableWorkerMode();
    loadRecords();
    return;
  }

  if (PUBLIC_TOKEN) {
    accessToken = PUBLIC_TOKEN;
    fetchUser();
    loadRecords();
    return;
  }

  // 저장된 토큰 복원
  const saved = localStorage.getItem('gh_token');
  if (saved) {
    accessToken = saved;
    fetchUser();
  }
  loadRecords();
}

loginBtn.addEventListener('click', openTokenLoginModal);
logoutBtn.addEventListener('click', logout);

function enableWorkerMode() {
  accessToken = null;
  loginBtn.classList.add('hidden');
  userInfo.classList.remove('hidden');
  userAvatar.classList.add('hidden');
  userName.textContent = '자동 저장';
  logoutBtn.classList.add('hidden');
  addBtn.classList.remove('hidden');
}

function openTokenLoginModal() {
  const old = document.getElementById('token-modal');
  if (old) old.remove();

  const fineTokenUrl = 'https://github.com/settings/personal-access-tokens/new';
  const classicTokenUrl = 'https://github.com/settings/tokens/new?description=AI%20Prompt%20Log&scopes=repo';
  const div = document.createElement('div');
  div.id = 'token-modal';
  div.style.cssText = `
    position:fixed;inset:0;background:rgba(0,0,0,0.75);
    display:flex;align-items:center;justify-content:center;z-index:9000;
    backdrop-filter:blur(4px);
  `;
  div.innerHTML = `
    <div style="background:#161b22;border:1px solid #30363d;border-radius:16px;
                padding:32px;max-width:480px;width:92%;box-shadow:0 8px 40px rgba(0,0,0,0.5);">
      <h2 style="font-size:1.2rem;margin-bottom:12px;color:#e6edf3;">GitHub 연결</h2>
      <p style="color:#8b949e;font-size:0.9rem;margin-bottom:18px;line-height:1.6;">
        토큰 생성에서 저장소는 <b style="color:#e6edf3;">${REPO_OWNER}/${REPO_NAME}</b>만 선택하고,
        <b style="color:#e6edf3;">Contents</b>와 <b style="color:#e6edf3;">Issues</b> 권한을 Read and write로 설정하세요.
      </p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;">
        <a href="${fineTokenUrl}" target="_blank"
           style="display:inline-block;padding:9px 14px;background:#238636;color:#fff;
                  border-radius:8px;text-decoration:none;font-weight:600;font-size:0.88rem;">
          Fine-grained 토큰 만들기
        </a>
        <a href="${classicTokenUrl}" target="_blank"
           style="display:inline-block;padding:9px 14px;background:#30363d;color:#e6edf3;
                  border-radius:8px;text-decoration:none;font-weight:600;font-size:0.88rem;">
          빠른 토큰 만들기
        </a>
      </div>
      <input id="token-input" type="password" autocomplete="off"
             placeholder="github_pat_... 또는 ghp_..."
             style="width:100%;padding:11px 13px;background:#0d1117;border:1px solid #30363d;
                    color:#e6edf3;border-radius:8px;font:inherit;margin-bottom:10px;" />
      <p id="token-msg" style="min-height:20px;color:#f85149;font-size:0.84rem;margin-bottom:14px;"></p>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button id="token-cancel" style="background:transparent;border:1px solid #30363d;color:#8b949e;
                padding:9px 18px;border-radius:8px;cursor:pointer;">취소</button>
        <button id="token-save" style="background:#58a6ff;border:0;color:#0d1117;
                padding:9px 18px;border-radius:8px;cursor:pointer;font-weight:700;">연결</button>
      </div>
    </div>
  `;
  document.body.appendChild(div);

  const input = div.querySelector('#token-input');
  const msg = div.querySelector('#token-msg');
  const save = div.querySelector('#token-save');
  const cancel = div.querySelector('#token-cancel');

  async function submitToken() {
    const token = input.value.trim();
    if (!token) {
      msg.textContent = 'GitHub 토큰을 붙여넣어주세요.';
      input.focus();
      return;
    }

    save.disabled = true;
    save.textContent = '확인 중...';
    accessToken = token;
    localStorage.setItem('gh_token', accessToken);

    const ok = await fetchUser();
    if (!ok) {
      msg.textContent = '토큰 확인에 실패했습니다. 권한과 만료일을 확인해주세요.';
      save.disabled = false;
      save.textContent = '연결';
      return;
    }

    div.remove();
    await loadRecords();
  }

  save.addEventListener('click', submitToken);
  cancel.addEventListener('click', () => div.remove());
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submitToken(); });
  input.focus();
}

function resetLoginBtn() {
  loginBtn.disabled = false;
  loginBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
    GitHub 연결`;
}

async function fetchUser() {
  try {
    const res = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) throw new Error('토큰 만료');
    currentUser = await res.json();
    loginBtn.classList.add('hidden');
    userInfo.classList.remove('hidden');
    userAvatar.classList.remove('hidden');
    logoutBtn.classList.remove('hidden');
    userAvatar.src = currentUser.avatar_url;
    userName.textContent = currentUser.login;
    addBtn.classList.remove('hidden');
    return true;
  } catch {
    if (PUBLIC_TOKEN) {
      accessToken = null;
      loginBtn.classList.remove('hidden');
      userInfo.classList.add('hidden');
      addBtn.classList.add('hidden');
      emptyMsg.classList.remove('hidden');
      emptyMsg.querySelector('p').innerHTML = 'config.js의 publicToken을 확인해주세요.';
    } else {
      logout();
    }
    return false;
  }
}

function logout() {
  if (PUBLIC_TOKEN) {
    alert('공개 토큰 모드입니다. 로그아웃하려면 config.js의 publicToken을 비워주세요.');
    return;
  }

  accessToken = null;
  currentUser = null;
  localStorage.removeItem('gh_token');
  loginBtn.classList.remove('hidden');
  userInfo.classList.add('hidden');
  addBtn.classList.add('hidden');
  resetLoginBtn();
}

// ──────────────────────────────────────────────
// 3. GitHub Issues API — 기록 저장 / 조회
// ──────────────────────────────────────────────

// Issue body 포맷 (파싱 가능하도록 구조화)
function buildIssueBody(data) {
  const images = Array.isArray(data.images) ? data.images.filter(Boolean) : [];
  const compare = {
    enabled: !!data.compareEnabled,
    original: data.originalImage || '',
    modified: data.modifiedImage || ''
  };
  const primaryImage = compare.enabled
    ? (compare.modified || compare.original)
    : (images[0] || data.image || '');
  const payload = JSON.stringify({ images, compare });
  const imageSection = buildImageSection(images, compare);

  return [
    `<!-- AI_PROMPT_LOG_DATA`,
    `ai: ${data.ai}`,
    `image: ${primaryImage}`,
    `json: ${payload}`,
    `-->`,
    ``,
    `## 프롬프트`,
    `\`\`\``,
    data.prompt,
    `\`\`\``,
    ``,
    imageSection,
    ``,
    data.memo ? `## 메모\n${data.memo}` : ''
  ].filter(l => l !== undefined).join('\n');
}

function buildImageSection(images, compare) {
  if (compare.enabled && (compare.original || compare.modified)) {
    return [
      `## 원본 / 수정본`,
      `| 원본 | 수정본 |`,
      `| --- | --- |`,
      `| ${compare.original ? `![원본](${compare.original})` : ''} | ${compare.modified ? `![수정본](${compare.modified})` : ''} |`
    ].join('\n');
  }

  if (images.length === 0) return '';

  return [
    `## 결과 이미지`,
    ...images.map((url, idx) => `![결과물 ${idx + 1}](${url})`)
  ].join('\n');
}

function parseIssueBody(body) {
  const aiMatch    = body.match(/^ai:\s*(.+)$/m);
  const imageMatch = body.match(/^image:\s*(.*)$/m);
  const jsonMatch  = body.match(/^json:\s*(\{.*\})$/m);
  const promptMatch = body.match(/```\n([\s\S]*?)\n```/);
  const memoMatch  = body.match(/## 메모\n([\s\S]*?)(?:\n##|$)/);
  const oldImage = imageMatch ? imageMatch[1].trim() : '';
  let payload = {};

  if (jsonMatch) {
    try {
      payload = JSON.parse(jsonMatch[1]);
    } catch {
      payload = {};
    }
  }

  const images = Array.isArray(payload.images)
    ? payload.images.filter(Boolean)
    : (oldImage ? [oldImage] : []);
  const compare = payload.compare || {};

  return {
    ai:     aiMatch    ? aiMatch[1].trim()    : '기타',
    image:  oldImage || images[0] || '',
    images,
    compareEnabled: !!compare.enabled,
    originalImage: compare.original || '',
    modifiedImage: compare.modified || '',
    prompt: promptMatch ? promptMatch[1].trim() : body,
    memo:   memoMatch  ? memoMatch[1].trim()  : ''
  };
}

async function loadRecords() {
  if (!REPO_OWNER || !REPO_NAME) {
    emptyMsg.classList.remove('hidden');
    emptyMsg.querySelector('p').innerHTML =
      'config.js 에 저장소 정보를 설정해주세요.<br/>배포 가이드를 참고하세요.';
    return;
  }

  loadingMsg.classList.remove('hidden');
  emptyMsg.classList.add('hidden');
  gallery.innerHTML = '';

  try {
    let res;
    if (useWorkerApi()) {
      res = await workerFetch(`/records?label=${encodeURIComponent(ISSUE_LABEL)}`);
    } else {
      const headers = { Accept: 'application/vnd.github+json' };
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

      res = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?labels=${ISSUE_LABEL}&state=open&per_page=100`,
        { headers }
      );
    }

    if (res.status === 404) {
      throw new Error('저장소를 찾을 수 없습니다. config.js 설정을 확인해주세요.');
    }

    if (!res.ok) throw new Error(`API 오류: ${res.status}`);

    const issues = await res.json();
    allRecords = issues.map(issue => {
      const parsed = parseIssueBody(issue.body || '');
      return {
        id:        issue.number,
        title:     issue.title,
        url:       issue.html_url,
        createdAt: issue.created_at,
        ...parsed
      };
    });

    renderGallery();
  } catch (err) {
    loadingMsg.classList.add('hidden');
    emptyMsg.classList.remove('hidden');
    emptyMsg.querySelector('p').innerHTML = `불러오기 실패:<br/>${err.message}`;
  }
}

async function saveRecord(data) {
  if (!useWorkerApi() && !accessToken) { alert('GitHub 연결이 필요합니다.'); return false; }
  if (!REPO_OWNER || !REPO_NAME) { alert('config.js 저장소 설정이 필요합니다.'); return false; }

  if (useWorkerApi()) {
    await workerFetch('/records', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: data.title,
        body: buildIssueBody(data),
        labels: [ISSUE_LABEL]
      })
    });
    return true;
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title:  data.title,
        body:   buildIssueBody(data),
        labels: [ISSUE_LABEL]
      })
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || '저장 실패');
  }
  return true;
}

function safeUploadName(name) {
  const dot = name.lastIndexOf('.');
  const rawBase = dot > -1 ? name.slice(0, dot) : name;
  const rawExt = dot > -1 ? name.slice(dot + 1).toLowerCase() : 'png';
  const base = rawBase
    .normalize('NFKD')
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'image';
  const ext = rawExt.replace(/[^a-z0-9]/g, '').slice(0, 10) || 'png';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${stamp}-${base}.${ext}`;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

async function uploadImageFile(file) {
  if (!useWorkerApi() && !accessToken) { throw new Error('GitHub 연결이 필요합니다.'); }
  if (!file.type.startsWith('image/')) { throw new Error('이미지 파일만 업로드할 수 있습니다.'); }
  if (file.size > 10 * 1024 * 1024) { throw new Error('이미지는 10MB 이하만 업로드해주세요.'); }

  const month = new Date().toISOString().slice(0, 7);
  const path = `uploads/${month}/${safeUploadName(file.name)}`;
  const apiPath = path.split('/').map(encodeURIComponent).join('/');
  const content = await fileToBase64(file);

  if (useWorkerApi()) {
    const res = await workerFetch('/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path,
        content,
        message: `Upload prompt image: ${file.name}`
      })
    });
    const result = await res.json();
    return result.download_url;
  }

  const res = await fetch(
    `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${apiPath}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Upload prompt image: ${file.name}`,
        content,
        branch: DEFAULT_BRANCH
      })
    }
  );

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.message || '이미지 업로드 실패');
  }

  const result = await res.json();
  return result.content?.download_url
    || `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${DEFAULT_BRANCH}/${apiPath}`;
}

// ──────────────────────────────────────────────
// 4. 갤러리 렌더링
// ──────────────────────────────────────────────
function renderGallery() {
  loadingMsg.classList.add('hidden');

  const filtered = currentFilter === 'all'
    ? allRecords
    : allRecords.filter(r => matchesFilter(r.ai, currentFilter));

  if (filtered.length === 0) {
    emptyMsg.classList.remove('hidden');
    emptyMsg.querySelector('p').innerHTML =
      allRecords.length === 0
        ? '아직 기록이 없습니다.<br/>GitHub 연결 후 첫 번째 기록을 추가해보세요!'
        : `<b>${currentFilter}</b> 기록이 없습니다.`;
    gallery.innerHTML = '';
    return;
  }

  emptyMsg.classList.add('hidden');
  gallery.innerHTML = filtered.map(r => cardHTML(r)).join('');

  gallery.querySelectorAll('.card').forEach(card => {
    card.addEventListener('click', () => {
      const id = parseInt(card.dataset.id);
      const rec = allRecords.find(r => r.id === id);
      if (rec) showDetail(rec);
    });
  });
}

function matchesFilter(ai, filter) {
  const aliases = {
    '지피티': ['지피티', 'ChatGPT'],
    '제미나이': ['제미나이', 'Gemini'],
    '회사': ['회사'],
    '기타': ['기타']
  };
  return (aliases[filter] || [filter]).includes(ai);
}

function aiBadgeClass(ai) {
  const map = {
    'ChatGPT': 'badge-ChatGPT',
    '지피티': 'badge-ChatGPT',
    'Gemini': 'badge-Gemini',
    '제미나이': 'badge-Gemini',
    '회사': 'badge-Claude',
    'Claude': 'badge-Claude',
    'Midjourney': 'badge-Midjourney',
    'DALL·E': 'badge-DALLE',
    'Stable Diffusion': 'badge-StableDiff'
  };
  return map[ai] || 'badge-default';
}

function aiEmoji(ai) {
  const map = {
    'ChatGPT': '🟢', 'Gemini': '🔵', 'Claude': '🟠',
    '지피티': '🟢', '제미나이': '🔵', '회사': '🏢',
    'Midjourney': '🟣', 'DALL·E': '🟡', 'Stable Diffusion': '🔴',
    'Sora': '🎬', 'Runway': '🎥'
  };
  return map[ai] || '🤖';
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

function recordImages(r) {
  if (Array.isArray(r.images) && r.images.length > 0) return r.images;
  return r.image ? [r.image] : [];
}

function cardHTML(r) {
  const images = recordImages(r);
  let imageSection = `<div class="card-no-image">${aiEmoji(r.ai)}</div>`;

  if (r.compareEnabled && (r.originalImage || r.modifiedImage)) {
    const original = r.originalImage || r.modifiedImage;
    const modified = r.modifiedImage || r.originalImage;
    imageSection = `
      <div class="card-media">
        <img class="compare-frame compare-original" src="${escHtml(original)}" alt="원본" loading="lazy" />
        <img class="compare-frame compare-modified" src="${escHtml(modified)}" alt="수정본" loading="lazy" />
        <span class="compare-label">원본/수정본</span>
        <span class="compare-badge">2초 비교</span>
      </div>`;
  } else if (images.length > 0) {
    imageSection = `
      <div class="card-media">
        <img class="card-image" src="${escHtml(images[0])}" alt="결과물" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" />
        <div class="card-no-image" style="display:none">${aiEmoji(r.ai)}</div>
        ${images.length > 1 ? `<span class="image-count-badge">+${images.length - 1}</span>` : ''}
      </div>`;
  }

  return `
    <div class="card" data-id="${r.id}">
      ${imageSection}
      <div class="card-body">
        <div class="card-top">
          <span class="ai-badge ${aiBadgeClass(r.ai)}">${escHtml(r.ai)}</span>
          <span class="card-date">${formatDate(r.createdAt)}</span>
        </div>
        <div class="card-title">${escHtml(r.title)}</div>
        <div class="card-prompt">${escHtml(r.prompt)}</div>
      </div>
    </div>`;
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ──────────────────────────────────────────────
// 5. 필터 버튼
// ──────────────────────────────────────────────
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.ai;
    renderGallery();
  });
});

// ──────────────────────────────────────────────
// 6. 새 기록 모달
// ──────────────────────────────────────────────
addBtn.addEventListener('click', openModal);
modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
modalOverlay.addEventListener('click', e => { if (e.target === modalOverlay) closeModal(); });

function openModal() {
  modalOverlay.classList.remove('hidden');
  recordTitle.focus();
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  // 폼 초기화
  resetAISelection();
  aiCustom.value = '';
  aiCustom.classList.add('hidden');
  recordTitle.value = '';
  recordPrompt.value = '';
  recordImage.value = '';
  recordImageFile.value = '';
  originalImageUrl.value = '';
  modifiedImageUrl.value = '';
  originalImageFile.value = '';
  modifiedImageFile.value = '';
  compareToggle.checked = false;
  pendingImages = [];
  compareOriginal = null;
  compareModified = null;
  updateImageMode();
  renderImageQueue();
  renderCompareSlots();
  setImageStatus('');
  recordMemo.value = '';
}

function resetAISelection() {
  aiRadios.forEach(radio => { radio.checked = false; });
}

function selectedAI() {
  const checked = [...aiRadios].find(radio => radio.checked);
  if (!checked) return '';
  return checked.value === '기타'
    ? (aiCustom.value.trim() || '기타')
    : checked.value;
}

function updateCustomAIField() {
  const checked = [...aiRadios].find(radio => radio.checked);
  if (checked?.value === '기타') {
    aiCustom.classList.remove('hidden');
    aiCustom.focus();
  } else {
    aiCustom.classList.add('hidden');
  }
}

aiRadios.forEach(radio => radio.addEventListener('change', updateCustomAIField));

function updateImageMode() {
  if (compareToggle.checked) {
    normalImagePanel.classList.add('hidden');
    compareImagePanel.classList.remove('hidden');
    lastPasteTarget = 'original';
  } else {
    normalImagePanel.classList.remove('hidden');
    compareImagePanel.classList.add('hidden');
    lastPasteTarget = 'normal';
  }
  setImageStatus('');
}

compareToggle.addEventListener('change', updateImageMode);

function setImageStatus(message, tone = '') {
  imageStatus.textContent = message || '';
  imageStatus.className = `image-status${tone ? ` ${tone}` : ''}`;
}

function normalizeImageUrl(raw) {
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!/^https?:$/.test(url.protocol)) throw new Error('invalid protocol');
    return url.href;
  } catch {
    return null;
  }
}

function validImageUrl(raw) {
  const url = normalizeImageUrl(raw);
  if (!url && raw.trim()) {
    alert('이미지 주소는 http 또는 https URL로 입력해주세요.');
  }
  return url || '';
}

function urlImageItem(url, name = 'URL 이미지') {
  return { id: ++imageItemSeq, type: 'url', url, preview: url, name };
}

function addUrlImage() {
  const url = validImageUrl(recordImage.value);
  if (!url) return;
  pendingImages.push(urlImageItem(url));
  recordImage.value = '';
  renderImageQueue();
  setImageStatus('이미지 URL을 추가했습니다.', 'ok');
}

function setCompareUrl(slot) {
  const input = slot === 'original' ? originalImageUrl : modifiedImageUrl;
  const url = validImageUrl(input.value);
  if (!url) return;
  setCompareImage(slot, urlImageItem(url));
  input.value = '';
  setImageStatus(`${slot === 'original' ? '원본' : '수정본'} 이미지 URL을 적용했습니다.`, 'ok');
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('이미지 파일을 읽지 못했습니다.'));
    reader.readAsDataURL(file);
  });
}

function assertImageFile(file) {
  const hasImageType = file.type.startsWith('image/');
  const hasImageExt = /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name || '');
  if (!hasImageType && !hasImageExt) {
    throw new Error('이미지 파일만 선택해주세요.');
  }
}

async function imageItemFromFile(file, fallbackName = '') {
  assertImageFile(file);
  return {
    id: ++imageItemSeq,
    type: 'file',
    file,
    preview: await fileToDataUrl(file),
    name: file.name || fallbackName || 'image.png'
  };
}

async function addFilesToQueue(fileList) {
  const files = [...fileList];
  if (files.length === 0) return;
  try {
    for (const file of files) {
      pendingImages.push(await imageItemFromFile(file));
    }
    renderImageQueue();
    setImageStatus(`이미지 ${files.length}개를 추가했습니다.`, 'ok');
  } catch (err) {
    setImageStatus(err.message, 'error');
  } finally {
    recordImageFile.value = '';
  }
}

async function setCompareFile(slot, fileList) {
  const file = fileList?.[0];
  if (!file) return;
  try {
    setCompareImage(slot, await imageItemFromFile(file));
    setImageStatus(`${slot === 'original' ? '원본' : '수정본'} 이미지를 추가했습니다.`, 'ok');
  } catch (err) {
    setImageStatus(err.message, 'error');
  } finally {
    if (slot === 'original') originalImageFile.value = '';
    if (slot === 'modified') modifiedImageFile.value = '';
  }
}

function setCompareImage(slot, item) {
  if (slot === 'original') compareOriginal = item;
  if (slot === 'modified') compareModified = item;
  renderCompareSlots();
}

function renderImageQueue() {
  if (pendingImages.length === 0) {
    imagePreviewWrap.innerHTML = '';
    return;
  }

  imagePreviewWrap.innerHTML = pendingImages.map(item => `
    <div class="image-thumb">
      <img src="${escHtml(item.preview)}" alt="${escHtml(item.name)}" />
      <button type="button" class="remove-image-btn" data-id="${item.id}" aria-label="이미지 제거">×</button>
    </div>
  `).join('');

  imagePreviewWrap.querySelectorAll('.remove-image-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      pendingImages = pendingImages.filter(item => item.id !== id);
      renderImageQueue();
    });
  });
}

function renderCompareSlots() {
  renderCompareSlot('original', compareOriginal, originalPreview, '원본 없음');
  renderCompareSlot('modified', compareModified, modifiedPreview, '수정본 없음');
}

function renderCompareSlot(slot, item, target, emptyText) {
  if (!item) {
    target.classList.add('empty');
    target.innerHTML = emptyText;
    return;
  }

  target.classList.remove('empty');
  target.innerHTML = `
    <img src="${escHtml(item.preview)}" alt="${slot === 'original' ? '원본' : '수정본'}" />
    <button type="button" class="remove-image-btn" aria-label="이미지 제거">×</button>
  `;
  target.querySelector('.remove-image-btn').addEventListener('click', () => {
    setCompareImage(slot, null);
  });
}

function imageUrlsFromText(text) {
  return String(text || '')
    .split(/\s+/)
    .map(value => normalizeImageUrl(value))
    .filter(Boolean);
}

function imageUrlsFromHTML(html) {
  if (!html) return [];
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return [...doc.querySelectorAll('img[src]')]
      .map(img => normalizeImageUrl(img.getAttribute('src') || ''))
      .filter(Boolean);
  } catch {
    return [];
  }
}

function imageDataUrlsFromHTML(html) {
  if (!html) return [];
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return [...doc.querySelectorAll('img[src]')]
      .map(img => img.getAttribute('src') || '')
      .filter(src => src.startsWith('data:image/'));
  } catch {
    return [];
  }
}

async function dataUrlToTempFileItem(dataUrl, index = 1) {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return clipboardBlobToTempFileItem(blob, index);
}

async function clipboardBlobToTempFileItem(blob, index = 1) {
  const type = blob.type || 'image/png';
  const ext = type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
  const file = new File([blob], `clipboard-temp-${Date.now()}-${index}.${ext}`, { type });
  return imageItemFromFile(file, file.name);
}

async function readClipboardImageItems() {
  const found = [];

  if (navigator.clipboard?.read) {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find(type => type.startsWith('image/'));
        if (imageType) {
          const blob = await item.getType(imageType);
          found.push(await clipboardBlobToTempFileItem(blob, found.length + 1));
          continue;
        }

        if (item.types.includes('text/html')) {
          const html = await (await item.getType('text/html')).text();
          found.push(...imageUrlsFromHTML(html).map(url => urlImageItem(url, '클립보드 이미지 URL')));
        }

        if (item.types.includes('text/plain')) {
          const text = await (await item.getType('text/plain')).text();
          found.push(...imageUrlsFromText(text).map(url => urlImageItem(url, '클립보드 URL')));
        }
      }
    } catch {
      // Some browsers block direct clipboard reads; Ctrl+V paste fallback below still works.
    }
  }

  if (found.length === 0 && navigator.clipboard?.readText) {
    try {
      const text = await navigator.clipboard.readText();
      found.push(...imageUrlsFromText(text).map(url => urlImageItem(url, '클립보드 URL')));
    } catch {
      // Ignore; the caller will show the paste fallback message.
    }
  }

  if (found.length === 0) {
    throw new Error('클립보드에서 이미지를 찾지 못했습니다.');
  }

  return found;
}

function focusPasteCatcher(target = 'normal') {
  lastPasteTarget = target;
  pasteCatcher.innerHTML = '';
  pasteCatcher.focus({ preventScroll: true });
}

async function itemsFromPasteEvent(data) {
  const found = [];
  const itemFiles = [...(data.items || [])]
    .filter(item => item.kind === 'file' && item.type.startsWith('image/'))
    .map(item => item.getAsFile())
    .filter(Boolean);
  const seenFiles = new Set();
  const files = [...itemFiles, ...(data.files || [])]
    .filter(file => file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name || ''))
    .filter(file => {
      const key = `${file.name}|${file.size}|${file.type}`;
      if (seenFiles.has(key)) return false;
      seenFiles.add(key);
      return true;
    });

  for (let i = 0; i < files.length; i++) {
    found.push(await clipboardBlobToTempFileItem(files[i], i + 1));
  }

  if (found.length > 0) return found;

  const html = data.getData('text/html');
  const dataUrls = imageDataUrlsFromHTML(html);
  for (const dataUrl of dataUrls) {
    found.push(await dataUrlToTempFileItem(dataUrl, found.length + 1));
  }

  if (found.length > 0) return found;

  found.push(...imageUrlsFromHTML(html).map(url => urlImageItem(url, '붙여넣은 이미지 URL')));
  found.push(...imageUrlsFromText(data.getData('text/plain')).map(url => urlImageItem(url, '붙여넣은 URL')));
  return found;
}

function applyClipboardItems(items, target = 'normal') {
  if (target === 'original') {
    setCompareImage('original', items[0]);
  } else if (target === 'modified') {
    setCompareImage('modified', items[0]);
  } else {
    pendingImages.push(...items);
    renderImageQueue();
  }
}

async function pasteClipboardImages(target = 'normal') {
  lastPasteTarget = target;
  focusPasteCatcher(target);
  setImageStatus('클립보드 이미지를 확인하는 중입니다...', '');

  try {
    const items = await readClipboardImageItems();
    applyClipboardItems(items, target);
    setImageStatus(`클립보드에서 이미지 ${items.length}개를 추가했습니다.`, 'ok');
  } catch (err) {
    setImageStatus(`${err.message} 지금 Ctrl+V를 누르면 임시 파일로 받아서 추가합니다.`, 'warn');
  }
}

document.addEventListener('paste', async e => {
  if (modalOverlay.classList.contains('hidden')) return;

  try {
    const items = await itemsFromPasteEvent(e.clipboardData);
    if (items.length === 0) return;
    e.preventDefault();
    applyClipboardItems(items, lastPasteTarget);
    setImageStatus(`클립보드 이미지를 임시 파일로 받아 ${items.length}개 추가했습니다.`, 'ok');
    pasteCatcher.innerHTML = '';
  } catch (err) {
    setImageStatus(err.message, 'error');
  }
});

async function resolveImageItem(item) {
  if (!item) return '';
  if (item.type === 'url') return item.url;
  return uploadImageFile(item.file);
}

async function resolveImageQueue() {
  const urls = [];
  for (let i = 0; i < pendingImages.length; i++) {
    modalSave.textContent = `이미지 업로드 중... (${i + 1}/${pendingImages.length})`;
    urls.push(await resolveImageItem(pendingImages[i]));
  }
  return urls;
}

addImageUrlBtn.addEventListener('click', addUrlImage);
recordImage.addEventListener('focus', () => { lastPasteTarget = 'normal'; });
recordImage.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addUrlImage(); } });
recordImageFile.addEventListener('change', () => addFilesToQueue(recordImageFile.files));
pasteImageBtn.addEventListener('click', () => pasteClipboardImages('normal'));
addOriginalUrlBtn.addEventListener('click', () => setCompareUrl('original'));
addModifiedUrlBtn.addEventListener('click', () => setCompareUrl('modified'));
originalImageUrl.addEventListener('focus', () => { lastPasteTarget = 'original'; });
modifiedImageUrl.addEventListener('focus', () => { lastPasteTarget = 'modified'; });
originalPreview.addEventListener('click', () => focusPasteCatcher('original'));
modifiedPreview.addEventListener('click', () => focusPasteCatcher('modified'));
originalImageUrl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); setCompareUrl('original'); } });
modifiedImageUrl.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); setCompareUrl('modified'); } });
originalImageFile.addEventListener('change', () => setCompareFile('original', originalImageFile.files));
modifiedImageFile.addEventListener('change', () => setCompareFile('modified', modifiedImageFile.files));
pasteOriginalBtn.addEventListener('click', () => pasteClipboardImages('original'));
pasteModifiedBtn.addEventListener('click', () => pasteClipboardImages('modified'));

modalSave.addEventListener('click', async () => {
  const ai = selectedAI();
  const title  = recordTitle.value.trim();
  const prompt = recordPrompt.value.trim();
  const memo   = recordMemo.value.trim();
  const compareEnabled = compareToggle.checked;

  if (!ai)     { alert('AI 종류를 선택해주세요.'); return; }
  if (!title)  { alert('제목을 입력해주세요.'); return; }
  if (!prompt) { alert('프롬프트를 입력해주세요.'); return; }
  if (!compareEnabled && recordImage.value.trim()) {
    const beforeCount = pendingImages.length;
    addUrlImage();
    if (pendingImages.length === beforeCount) return;
  }
  if (compareEnabled && !compareOriginal && originalImageUrl.value.trim()) setCompareUrl('original');
  if (compareEnabled && !compareModified && modifiedImageUrl.value.trim()) setCompareUrl('modified');
  if (compareEnabled && (!compareOriginal || !compareModified)) {
    alert('원본과 수정본 이미지를 모두 넣어주세요.');
    return;
  }

  modalSave.disabled = true;
  modalSave.textContent = '저장 중...';

  try {
    let images = [];
    let originalImage = '';
    let modifiedImage = '';

    if (compareEnabled) {
      modalSave.textContent = '원본 업로드 중...';
      originalImage = await resolveImageItem(compareOriginal);
      modalSave.textContent = '수정본 업로드 중...';
      modifiedImage = await resolveImageItem(compareModified);
      images = [originalImage, modifiedImage].filter(Boolean);
    } else {
      images = await resolveImageQueue();
    }

    modalSave.textContent = '기록 저장 중...';
    await saveRecord({
      ai,
      title,
      prompt,
      images,
      image: compareEnabled ? modifiedImage : images[0],
      compareEnabled,
      originalImage,
      modifiedImage,
      memo
    });
    closeModal();
    await loadRecords();
  } catch (err) {
    alert(`저장 실패: ${err.message}`);
  } finally {
    modalSave.disabled = false;
    modalSave.textContent = 'GitHub에 저장';
  }
});

// ──────────────────────────────────────────────
// 7. 상세 보기 모달
// ──────────────────────────────────────────────
detailClose.addEventListener('click', () => detailOverlay.classList.add('hidden'));
detailOverlay.addEventListener('click', e => { if (e.target === detailOverlay) detailOverlay.classList.add('hidden'); });

function showDetail(r) {
  $('detail-title').textContent = r.title;
  $('detail-ai-badge').innerHTML = `<span class="ai-badge ${aiBadgeClass(r.ai)}">${escHtml(r.ai)}</span>`;
  $('detail-prompt').textContent = r.prompt;
  $('detail-date').textContent = formatDate(r.createdAt);
  $('detail-issue-link').href = r.url;
  renderDetailImages(r);

  const memoSection = $('detail-memo-section');
  if (r.memo) {
    $('detail-memo').textContent = r.memo;
    memoSection.classList.remove('hidden');
  } else {
    memoSection.classList.add('hidden');
  }

  detailOverlay.classList.remove('hidden');
}

function renderDetailImages(r) {
  const wrap = $('detail-images');
  const images = recordImages(r);

  if (r.compareEnabled && (r.originalImage || r.modifiedImage)) {
    wrap.innerHTML = [
      detailImageHTML(r.originalImage, '원본'),
      detailImageHTML(r.modifiedImage, '수정본')
    ].filter(Boolean).join('');
  } else {
    wrap.innerHTML = images.map((url, idx) => detailImageHTML(url, `이미지 ${idx + 1}`)).join('');
  }

  wrap.classList.toggle('hidden', !wrap.innerHTML);
}

function detailImageHTML(url, caption) {
  if (!url) return '';
  return `
    <div class="detail-image-item">
      <img src="${escHtml(url)}" alt="${escHtml(caption)}" />
      <div class="detail-image-caption">${escHtml(caption)}</div>
    </div>`;
}

// ──────────────────────────────────────────────
// 8. 키보드 단축키
// ──────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    detailOverlay.classList.add('hidden');
    modalOverlay.classList.add('hidden');
  }
});

// ──────────────────────────────────────────────
// 초기화
// ──────────────────────────────────────────────
checkLock();
