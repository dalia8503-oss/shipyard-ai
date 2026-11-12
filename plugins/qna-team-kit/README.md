# qna-team-kit

Q&A 팀을 위한 Claude Code 플러그인입니다. 팀에 들어오는 질문을 분류해 우선순위와 담당 후보를 정리하고, 팀의 톤에 맞춰 답변 초안을 작성하거나 FAQ 항목을 만드는 데 도움을 줍니다. 별도의 설정이나 외부 서비스 연동 없이 설치만 하면 바로 사용할 수 있습니다.

## 설치
```
/plugin install qna-team-kit --marketplace dalia8503-oss/shipyard-ai
```

## 구성
- `skills/qna-answer`: 답변 작성 가이드 스킬
- `commands/triage.md`: `/qna-team-kit:triage` 질문 분류 명령

## 사용
로컬에서 시험해 보려면 다음과 같이 실행합니다.
```
claude --plugin-dir ./plugins/qna-team-kit
```
세션 안에서 `/qna-team-kit:triage <질문 또는 파일 경로>`를 실행합니다.

## 라이선스
MIT
