/**
 * AI Prompt Log — 설정 파일
 * =====================================================
 * 이 파일의 값을 본인 정보로 수정한 후 배포하세요.
 * =====================================================
 */
window.SITE_CONFIG = {

  // ① 접근 코드 — URL을 알아도 이 코드 없이는 입장 불가
  accessCode: 'dlatldkagh1!',

  // ② GitHub OAuth App Client ID
  //    만드는 방법: GitHub → Settings → Developer settings
  //               → OAuth Apps → New OAuth App
  //    Homepage URL: https://<your-username>.github.io/<repo-name>
  //    Callback URL: https://<your-username>.github.io/<repo-name>
  //    (Device Flow는 Callback URL이 실제로 사용되지 않습니다)
  clientId: '',   // 예: 'Ov23liXXXXXXXXXXXXXX'

  // ③ 기록을 저장할 GitHub 저장소 정보
  repoOwner: 'lmj1018',  // GitHub 사용자명
  repoName:  'ai-prompt-log',  // 저장소 이름

  // ④ Issues 라벨 (기본값 그대로 사용 권장)
  issueLabel: 'ai-prompt-log'

};
