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
const aiSelect       = $('ai-select');
const aiCustom       = $('ai-custom');
const recordTitle    = $('record-title');
const recordPrompt   = $('record-prompt');
const recordImage    = $('record-image');
const recordImageFile = $('record-image-file');
const imagePreview   = $('image-preview');
const recordMemo     = $('record-memo');

const detailOverlay  = $('detail-overlay');
const detailClose    = $('detail-close');

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
    userAvatar.src = currentUser.avatar_url;
    userName.textContent = currentUser.login;
    addBtn.classList.remove('hidden');
    return true;
  } catch {
    logout();
    return false;
  }
}

function logout() {
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
  return [
    `<!-- AI_PROMPT_LOG_DATA`,
    `ai: ${data.ai}`,
    `image: ${data.image || ''}`,
    `-->`,
    ``,
    `## 프롬프트`,
    `\`\`\``,
    data.prompt,
    `\`\`\``,
    ``,
    data.image ? `## 결과 이미지\n![결과물](${data.image})` : '',
    ``,
    data.memo ? `## 메모\n${data.memo}` : ''
  ].filter(l => l !== undefined).join('\n');
}

function parseIssueBody(body) {
  const aiMatch    = body.match(/^ai:\s*(.+)$/m);
  const imageMatch = body.match(/^image:\s*(.*)$/m);
  const promptMatch = body.match(/```\n([\s\S]*?)\n```/);
  const memoMatch  = body.match(/## 메모\n([\s\S]*?)(?:\n##|$)/);

  return {
    ai:     aiMatch    ? aiMatch[1].trim()    : '기타',
    image:  imageMatch ? imageMatch[1].trim() : '',
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
    const headers = { Accept: 'application/vnd.github+json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?labels=${ISSUE_LABEL}&state=open&per_page=100`,
      { headers }
    );

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
  if (!accessToken) { alert('GitHub 연결이 필요합니다.'); return false; }
  if (!REPO_OWNER || !REPO_NAME) { alert('config.js 저장소 설정이 필요합니다.'); return false; }

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
  if (!accessToken) { throw new Error('GitHub 연결이 필요합니다.'); }
  if (!file.type.startsWith('image/')) { throw new Error('이미지 파일만 업로드할 수 있습니다.'); }
  if (file.size > 10 * 1024 * 1024) { throw new Error('이미지는 10MB 이하만 업로드해주세요.'); }

  const month = new Date().toISOString().slice(0, 7);
  const path = `uploads/${month}/${safeUploadName(file.name)}`;
  const apiPath = path.split('/').map(encodeURIComponent).join('/');
  const content = await fileToBase64(file);

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
    : allRecords.filter(r => r.ai === currentFilter);

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

function aiBadgeClass(ai) {
  const map = {
    'ChatGPT': 'badge-ChatGPT',
    'Gemini': 'badge-Gemini',
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
    'Midjourney': '🟣', 'DALL·E': '🟡', 'Stable Diffusion': '🔴',
    'Sora': '🎬', 'Runway': '🎥'
  };
  return map[ai] || '🤖';
}

function formatDate(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

function cardHTML(r) {
  const imageSection = r.image
    ? `<img class="card-image" src="${escHtml(r.image)}" alt="결과물" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex';" /><div class="card-no-image" style="display:none">${aiEmoji(r.ai)}</div>`
    : `<div class="card-no-image">${aiEmoji(r.ai)}</div>`;

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
  aiSelect.value = '';
  aiCustom.value = '';
  aiCustom.classList.add('hidden');
  recordTitle.value = '';
  recordPrompt.value = '';
  recordImage.value = '';
  recordImageFile.value = '';
  imagePreview.src = '';
  imagePreview.classList.add('hidden');
  recordMemo.value = '';
}

aiSelect.addEventListener('change', () => {
  if (aiSelect.value === '기타') {
    aiCustom.classList.remove('hidden');
    aiCustom.focus();
  } else {
    aiCustom.classList.add('hidden');
  }
});

// 이미지 URL 미리보기
let previewTimer;
recordImage.addEventListener('input', () => {
  clearTimeout(previewTimer);
  if (recordImage.value.trim()) recordImageFile.value = '';
  previewTimer = setTimeout(() => {
    const url = recordImage.value.trim();
    if (url) {
      imagePreview.src = url;
      imagePreview.classList.remove('hidden');
      imagePreview.onerror = () => {
        imagePreview.classList.add('hidden');
      };
    } else {
      imagePreview.classList.add('hidden');
    }
  }, 600);
});

recordImageFile.addEventListener('change', () => {
  const file = recordImageFile.files?.[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('이미지 파일만 선택해주세요.');
    recordImageFile.value = '';
    return;
  }

  recordImage.value = '';
  const reader = new FileReader();
  reader.onload = () => {
    imagePreview.src = reader.result;
    imagePreview.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

modalSave.addEventListener('click', async () => {
  const ai = aiSelect.value === '기타'
    ? (aiCustom.value.trim() || '기타')
    : aiSelect.value;

  const title  = recordTitle.value.trim();
  const prompt = recordPrompt.value.trim();
  let image    = recordImage.value.trim();
  const imageFile = recordImageFile.files?.[0];
  const memo   = recordMemo.value.trim();

  if (!ai)     { alert('AI 종류를 선택해주세요.'); return; }
  if (!title)  { alert('제목을 입력해주세요.'); return; }
  if (!prompt) { alert('프롬프트를 입력해주세요.'); return; }

  modalSave.disabled = true;
  modalSave.textContent = '저장 중...';

  try {
    if (imageFile) {
      modalSave.textContent = '이미지 업로드 중...';
      image = await uploadImageFile(imageFile);
      modalSave.textContent = '기록 저장 중...';
    }
    await saveRecord({ ai, title, prompt, image, memo });
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

  const img = $('detail-image');
  if (r.image) {
    img.src = r.image;
    img.classList.remove('hidden');
  } else {
    img.classList.add('hidden');
  }

  const memoSection = $('detail-memo-section');
  if (r.memo) {
    $('detail-memo').textContent = r.memo;
    memoSection.classList.remove('hidden');
  } else {
    memoSection.classList.add('hidden');
  }

  detailOverlay.classList.remove('hidden');
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
