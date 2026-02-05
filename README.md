# discord-agent-bridge

Discord를 통해 AI 에이전트 CLI (Claude Code, Gemini CLI)를 원격으로 제어하고 결과를 받아보는 브릿지.

## Features

- Discord 채널에서 AI 에이전트로 메시지 전송
- AI 에이전트 출력을 Discord로 자동 포워딩 (Hooks)
- tmux를 통한 멀티 에이전트 세션 관리
- 프로젝트별 독립적인 Discord 채널

## Architecture

```
Discord                    Bridge Server                 tmux
┌──────────┐              ┌─────────────┐              ┌──────────┐
│ #proj-   │◄── WebSocket ─►│  Node.js   │─ send-keys ─►│ claude   │
│  claude  │              │   Bridge    │              │ window   │
├──────────┤              │             │              ├──────────┤
│ #proj-   │              │ HTTP :3847  │◄── hooks ────│ gemini   │
│  gemini  │              │             │              │ window   │
└──────────┘              └─────────────┘              └──────────┘
```

## Installation

```bash
# Clone and install
cd discord-agent-bridge
npm install
npm run build

# Link CLI globally (optional)
npm link
```

## Quick Start

### 1. Discord Bot 설정

1. [Discord Developer Portal](https://discord.com/developers/applications)에서 새 Application 생성
2. Bot 탭에서 Bot 추가
3. Bot Token 복사
4. OAuth2 > URL Generator에서:
   - Scopes: `bot`
   - Bot Permissions: `Send Messages`, `Read Message History`, `Manage Channels`
5. 생성된 URL로 서버에 봇 초대

### 2. 환경 설정

```bash
# .env 파일 생성 또는 환경변수 설정
export DISCORD_TOKEN="your_bot_token_here"
```

### 3. Guild ID 설정

```bash
# Discord 서버 ID 설정
agent-discord config --guild YOUR_GUILD_ID

# 설정 확인
agent-discord config --show
```

### 4. Hooks 설치

```bash
# Claude Code와 Gemini CLI에 hooks 자동 설치
agent-discord install-hooks
```

### 5. 프로젝트 초기화

```bash
# 프로젝트 디렉토리에서
cd ~/my-project
agent-discord init

# Claude만 사용
agent-discord init --no-gemini

# Gemini만 사용
agent-discord init --no-claude

# 커스텀 프로젝트 이름
agent-discord init --name my-custom-name
```

### 6. 브릿지 서버 시작

```bash
# 터미널 1: 브릿지 서버 실행
agent-discord start

# 터미널 2: tmux 세션에 접속
agent-discord attach my-project
```

### 7. 환경변수 설정 (각 세션에서)

```bash
# tmux 세션 내에서 (hooks가 작동하려면 필요)
export AGENT_DISCORD_PROJECT="my-project"
export AGENT_DISCORD_PORT="3847"
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `agent-discord start` | 브릿지 서버 시작 |
| `agent-discord init` | 현재 디렉토리에 프로젝트 초기화 |
| `agent-discord config` | 설정 관리 (guild ID 등) |
| `agent-discord status` | 브릿지 및 프로젝트 상태 확인 |
| `agent-discord list` | 설정된 프로젝트 목록 |
| `agent-discord attach [project]` | tmux 세션 연결 |
| `agent-discord stop [project]` | 프로젝트 중지 |
| `agent-discord install-hooks` | AI CLI hooks 설치 |

## 사용 예시

### Discord에서 메시지 보내기

```
# #my-project-claude 채널에서:
Fix the login bug in auth.ts

# #my-project-gemini 채널에서:
Explain the architecture of this codebase
```

### 결과 확인

에이전트가 tool을 사용할 때마다 자동으로 해당 Discord 채널에 결과가 전송됩니다:

```
🔧 Read (claude)
```
File: src/auth.ts
...content...
```
```

## Files

```
discord-agent-bridge/
├── bin/agent-discord.ts    # CLI 진입점
├── src/
│   ├── index.ts            # 메인 브릿지 서버
│   ├── discord/            # Discord 클라이언트
│   ├── tmux/               # tmux 세션 관리
│   ├── state/              # 프로젝트 상태 관리
│   └── config/             # 설정
├── hooks/
│   ├── claude-post-tool.sh # Claude Code hook
│   ├── gemini-post-tool.sh # Gemini CLI hook
│   └── install-hooks.sh    # 자동 설치 스크립트
└── dist/                   # 빌드 결과물
```

## State 저장 위치

- 프로젝트 상태: `~/.discord-agent-bridge/state.json`
- Claude Code 설정: `~/.claude/settings.json`
- Gemini CLI 설정: `~/.gemini/settings.json`

## Troubleshooting

### "Guild ID not configured" 에러
```bash
agent-discord config --guild YOUR_GUILD_ID
```

### Hooks가 작동하지 않음
1. 환경변수 확인: `echo $AGENT_DISCORD_PROJECT`
2. 브릿지 서버 실행 중인지 확인
3. Claude Code / Gemini CLI 재시작 (hooks는 시작 시 로드됨)

### tmux 세션을 찾을 수 없음
```bash
# 세션 목록 확인
tmux list-sessions

# 브릿지 세션 확인
agent-discord status
```

## Development

```bash
npm run dev        # tsx로 개발 모드 실행
npm run build      # tsup으로 빌드
npm run typecheck  # TypeScript 타입 체크
```

## TODO

- [ ] Codex CLI 지원
- [ ] 터미널 출력 실시간 스트리밍
- [ ] 멀티 프로젝트 대시보드
- [ ] 에러 알림 시스템
- [ ] Web UI

## License

MIT
