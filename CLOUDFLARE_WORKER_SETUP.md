# Cloudflare Worker 배포 순서

이 앱을 GitHub 로그인 없이 쓰려면 `cloudflare-worker.js`를 Cloudflare Worker로 배포하고,
GitHub 토큰은 Cloudflare의 secret/env에 넣습니다.

## 1. Worker 만들기

1. https://dash.cloudflare.com/ 접속
2. `Workers & Pages` 선택
3. `Create` 또는 `Create application`
4. `Worker` 선택
5. 이름 예: `ai-prompt-log-api`
6. 코드 편집 화면에서 `cloudflare-worker.js` 내용을 전체 붙여넣고 저장/배포

## 2. 환경 변수와 Secret 넣기

Worker 설정에서 `Settings` → `Variables and Secrets`로 이동한 뒤 아래 값을 추가합니다.

Secrets:

```text
GITHUB_TOKEN = GitHub fine-grained token
ACCESS_CODE = dlatldkagh1!
```

Variables:

```text
REPO_OWNER = lmj1018
REPO_NAME = ai-prompt-log
BRANCH = main
ISSUE_LABEL = ai-prompt-log
ALLOWED_ORIGIN = https://lmj1018.github.io
```

GitHub 토큰 권한:

```text
Repository access: Only select repositories -> ai-prompt-log
Contents: Read and write
Issues: Read and write
```

## 3. 앱 설정 바꾸기

Worker 배포 후 생기는 주소를 복사합니다.

예:

```text
https://ai-prompt-log-api.<계정명>.workers.dev
```

`config.js`에서 아래 값을 채웁니다.

```js
apiBaseUrl: 'https://ai-prompt-log-api.<계정명>.workers.dev',
publicToken: '',
```

그 다음 `config.js`를 GitHub에 올리면 앱에서 GitHub 연결 없이 저장됩니다.
