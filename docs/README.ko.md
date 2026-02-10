# Discord Agent Bridge

[English](../README.md) | [한국어](README.ko.md)

AI 에이전트 CLI를 Discord로 연결하여 원격 모니터링 및 협업을 지원합니다.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/Tests-129%20passing-brightgreen.svg)](../tests)

## 개요

Discord Agent Bridge는 AI 코딩 어시스턴트(Claude Code, OpenCode)를 Discord에 연결하여 원격 모니터링과 협업을 가능하게 합니다. Discord 채널을 통해 AI 에이전트의 작업을 실시간으로 관찰하고, 팀과 진행 상황을 공유하며, 여러 프로젝트를 동시에 추적할 수 있습니다.

폴링 기반 아키텍처를 사용하여 30초마다 tmux 패널 내용을 캡처하고, 상태 변화를 감지하여 전용 Discord 채널로 업데이트를 스트리밍합니다. 각 프로젝트는 자체 채널을 갖게 되며, 하나의 글로벌 데몬이 모든 연결을 효율적으로 관리합니다.

## 주요 기능

- **멀티 에이전트 지원**: Claude Code와 OpenCode 지원
- **자동 감지**: 시스템에 설치된 AI 에이전트를 자동으로 감지
- **실시간 스트리밍**: 30초마다 tmux 출력을 캡처하여 Discord로 전송
- **프로젝트 격리**: 각 프로젝트마다 전용 Discord 채널 생성
- **단일 데몬**: 하나의 Discord 봇 연결로 모든 프로젝트 관리
- **세션 관리**: tmux 세션은 연결 해제 후에도 유지
- **YOLO 모드**: `--yolo` 플래그로 Claude Code를 권한 확인 없이 실행
- **Sandbox 모드**: `--sandbox` 플래그로 Claude Code를 Docker 컨테이너에서 격리 실행
- **풍부한 CLI**: 설정, 제어, 모니터링을 위한 직관적인 명령어
- **타입 안전**: 의존성 주입 패턴으로 작성된 TypeScript
- **충분한 테스트**: Vitest로 129개의 유닛 테스트

## 지원 플랫폼

| 플랫폼 | 지원 | 비고 |
|--------|------|------|
| **macOS** | Yes | 개발 및 테스트 완료 |
| **Linux** | Expected | tmux 기반이라 동작 예상, 미검증 |
| **Windows (WSL)** | Expected | WSL에 tmux 설치 시 동작 예상, 미검증 |
| **Windows (네이티브)** | No | tmux를 네이티브로 사용할 수 없음 |

## 사전 요구 사항

- **Node.js**: 버전 18 이상
- **tmux**: 버전 3.0 이상
- **Discord 봇**: [Discord 봇 설정 가이드](DISCORD_SETUP.ko.md)를 따라 봇 생성
  - 필요 권한: Send Messages, Manage Channels, Read Message History, Embed Links, Add Reactions
  - 필요 인텐트: Guilds, GuildMessages, MessageContent, GuildMessageReactions
- **AI 에이전트**: 다음 중 하나 이상:
  - [Claude Code](https://code.claude.com/docs/en/overview)
  - [OpenCode](https://github.com/OpenCodeAI/opencode)

## 설치

### npm으로 설치

```bash
npm install -g discord-agent-bridge
```

### 소스에서 설치

```bash
git clone https://github.com/DoBuDevel/discord-agent-bridge.git
cd discord-agent-bridge
npm install
npm run build
npm link
```

## 빠른 시작

### 1. Discord 봇 설정

```bash
# Discord 봇 토큰으로 최초 1회 설정
agent-discord setup YOUR_DISCORD_BOT_TOKEN
```

`setup` 명령어는 토큰을 저장하고 Discord 서버 ID를 자동 감지합니다. 설정을 확인하거나 변경하려면:

```bash
agent-discord config --show              # 현재 설정 조회
agent-discord config --server SERVER_ID  # 서버 ID 수동 변경
```

> **참고**: 최초 설정은 반드시 `setup`을 사용하세요 — Discord에 연결하여 서버 ID를 자동 감지합니다. `config` 명령어는 자동 감지 없이 개별 값만 변경합니다.

### 2. 작업 시작

```bash
cd ~/projects/my-app

# go 하나면 끝!
agent-discord go
```

`go`는 모든 것을 자동으로 처리합니다: 설치된 에이전트 감지, 데몬 시작, Discord 채널 생성, tmux에서 에이전트 실행, 세션 연결까지 한 번에 수행합니다.

```bash
agent-discord go claude        # 에이전트를 직접 지정
agent-discord go --yolo        # YOLO 모드 (권한 확인 건너뛰기, Claude Code 전용)
agent-discord go --sandbox     # Sandbox 모드 (Docker 격리, Claude Code 전용)
```

AI 에이전트가 tmux에서 실행되고, 30초마다 출력이 Discord로 스트리밍됩니다.

### 고급: 단계별 설정

프로젝트 구성을 세밀하게 제어하려면 `init`으로 프로젝트를 별도로 설정할 수 있습니다:

```bash
cd ~/projects/my-app

# 특정 에이전트와 커스텀 채널 설명으로 초기화
agent-discord init claude "나의 풀스택 애플리케이션"

# 단계별로 시작:
agent-discord daemon start    # 글로벌 데몬 시작
agent-discord start          # 이 프로젝트 시작
agent-discord attach         # tmux 세션에 연결
```

## CLI 레퍼런스

### 글로벌 명령어

#### `setup <token>`

최초 설정: 봇 토큰 저장, Discord에 연결하여 서버 자동 감지, 설치된 에이전트 표시.

```bash
agent-discord setup YOUR_BOT_TOKEN
```

설정 과정:
1. `~/.discord-agent-bridge/config.json`에 봇 토큰 저장
2. Discord에 연결하여 봇이 속한 서버 감지
3. 봇이 여러 서버에 있으면 선택 프롬프트 표시
4. 서버 ID 자동 저장

#### `daemon <action>`

글로벌 데몬 프로세스를 제어합니다.

```bash
agent-discord daemon start    # 데몬 시작
agent-discord daemon stop     # 데몬 중지
agent-discord daemon status   # 데몬 상태 확인
```

#### `list`

등록된 모든 프로젝트를 나열합니다.

```bash
agent-discord list
```

#### `agents`

시스템에서 감지된 AI 에이전트를 나열합니다.

```bash
agent-discord agents
```

#### `config [options]`

글로벌 설정을 조회하거나 수정합니다.

```bash
agent-discord config --show              # 현재 설정 조회
agent-discord config --token NEW_TOKEN   # 봇 토큰 변경
agent-discord config --server SERVER_ID  # Discord 서버 ID 수동 설정
agent-discord config --port 18470        # 훅 서버 포트 설정
```

### 프로젝트 명령어

프로젝트 디렉토리에서 실행하세요.

#### `init <agent> <description>`

현재 디렉토리를 프로젝트로 초기화합니다.

```bash
agent-discord init claude "풀스택 웹 애플리케이션"
agent-discord init opencode "데이터 파이프라인 프로젝트"
```

#### `start [options]`

등록된 프로젝트의 브릿지 서버를 시작합니다.

```bash
agent-discord start                        # 모든 프로젝트 시작
agent-discord start -p my-app             # 특정 프로젝트 시작
agent-discord start -p my-app --attach    # 시작 후 tmux에 연결
```

#### `stop [project]`

프로젝트를 중지합니다: tmux 세션 종료, Discord 채널 삭제, 프로젝트 상태 제거. 프로젝트를 지정하지 않으면 현재 디렉토리 이름을 사용합니다.

```bash
agent-discord stop                # 현재 디렉토리의 프로젝트 중지
agent-discord stop my-app         # 특정 프로젝트 중지
agent-discord stop --keep-channel # Discord 채널 유지 (tmux만 종료)
```

#### `status`

프로젝트 상태를 표시합니다.

```bash
agent-discord status
```

#### `attach [project]`

프로젝트의 tmux 세션에 연결합니다. 프로젝트를 지정하지 않으면 현재 디렉토리 이름을 사용합니다.

```bash
agent-discord attach              # 현재 디렉토리의 프로젝트에 연결
agent-discord attach my-app       # 특정 프로젝트에 연결
```

tmux에서 에이전트를 중지하지 않고 분리하려면 `Ctrl-b d`를 누르세요.

#### `go [agent] [options]`

빠른 시작: 데몬 시작, 필요시 프로젝트 설정, tmux에 연결. `init` 없이도 동작합니다 — 설치된 에이전트를 자동 감지하고 Discord 채널을 자동으로 생성합니다.

```bash
agent-discord go              # 에이전트 자동 감지, 설정 & 연결
agent-discord go claude       # 특정 에이전트 사용
agent-discord go --yolo       # YOLO 모드 (권한 확인 건너뛰기, Claude Code 전용)
agent-discord go --sandbox    # Sandbox 모드 (Docker 격리, Claude Code 전용)
agent-discord go --no-attach  # tmux에 연결하지 않고 시작
```

## 동작 원리

### 아키텍처

```
┌─────────────────┐
│  AI Agent CLI   │  (Claude, OpenCode)
│  Running in     │
│  tmux session   │
└────────┬────────┘
         │
         │ tmux capture-pane (매 30초)
         │
    ┌────▼─────────────┐
    │  CapturePoller   │  상태 변화 감지
    └────┬─────────────┘
         │
         │ Discord.js
         │
    ┌────▼──────────────┐
    │  Discord Channel  │  #project-name
    └───────────────────┘
```

### 컴포넌트

- **Daemon Manager**: Discord 연결을 관리하는 단일 글로벌 프로세스
- **Capture Poller**: 30초마다 tmux 패널을 폴링하고, 변경 사항을 감지하여 Discord로 전송
- **Agent Registry**: 멀티 에이전트를 위한 팩토리 패턴 (Claude, OpenCode)
- **State Manager**: 프로젝트 상태, 세션, 채널 추적
- **Dependency Injection**: 스토리지, 실행, 환경을 위한 인터페이스 (테스트 가능, 목킹 가능)

### 폴링 모델

이 브릿지는 훅 대신 **폴링 기반** 아키텍처를 사용합니다:

1. 30초마다 (설정 가능) 폴러가 `tmux capture-pane`을 실행
2. 캡처된 내용을 이전 스냅샷과 비교
3. 변경이 감지되면 새 내용을 Discord로 전송
4. 멀티라인 출력, ANSI 코드, 레이트 리밋 처리

이 접근 방식은 훅 기반 시스템보다 더 간단하고 안정적이며, 성능 영향은 최소화됩니다.

### 프로젝트 라이프사이클

1. **Go / Init**: `~/.discord-agent-bridge/state.json`에 프로젝트를 등록하고 Discord 채널 생성
2. **Start**: 이름이 지정된 tmux 세션에서 AI 에이전트 실행
3. **Polling**: 데몬이 tmux 출력을 캡처하여 Discord로 스트리밍
4. **Stop**: tmux 세션을 종료하고, 채널을 삭제하고, 상태를 정리
5. **Attach**: 사용자가 tmux 세션에 직접 참여 가능

## 지원 에이전트

| 에이전트 | 바이너리 | 자동 감지 | YOLO 지원 | Sandbox 지원 | 비고 |
|----------|----------|-----------|-----------|-------------|------|
| **Claude Code** | `claude` | Yes | Yes | Yes | 공식 Anthropic CLI |
| **OpenCode** | `opencode` | Yes | No | No | 오픈소스 대안 |

### 에이전트 감지

CLI는 `command -v <binary>`를 사용하여 설치된 에이전트를 자동으로 감지합니다. `agent-discord agents`를 실행하여 시스템에서 사용 가능한 에이전트를 확인하세요.

### 커스텀 에이전트 추가

새 에이전트를 추가하려면 `src/agents/`에서 `BaseAgentAdapter` 클래스를 확장하세요:

```typescript
export class MyAgentAdapter extends BaseAgentAdapter {
  constructor() {
    super({
      name: 'myagent',
      displayName: 'My Agent',
      command: 'myagent-cli',
      channelSuffix: 'myagent',
    });
  }

  getStartCommand(projectPath: string, yolo = false, sandbox = false): string {
    return `cd "${projectPath}" && ${this.config.command}`;
  }
}
```

`src/agents/index.ts`에 어댑터를 등록하세요.

## 설정

### 글로벌 설정

`~/.discord-agent-bridge/config.json`에 저장됩니다:

```json
{
  "token": "YOUR_BOT_TOKEN",
  "serverId": "YOUR_SERVER_ID",
  "hookServerPort": 18470
}
```

| 키 | 필수 | 설명 | 기본값 |
|----|------|------|--------|
| `token` | **필수** | Discord 봇 토큰. `agent-discord setup <token>` 또는 `config --token`으로 설정 | - |
| `serverId` | **필수** | Discord 서버(길드) ID. `setup`에서 자동 감지되거나 `config --server`로 수동 설정 | - |
| `hookServerPort` | 선택 | 훅 서버 포트 | `18470` |

```bash
agent-discord config --show               # 현재 설정 조회
agent-discord config --token NEW_TOKEN     # 봇 토큰 변경
agent-discord config --server SERVER_ID    # 서버 ID 수동 설정
agent-discord config --port 18470          # 훅 서버 포트 설정
```

### 프로젝트 상태

프로젝트 상태는 `~/.discord-agent-bridge/state.json`에 저장되며 자동으로 관리됩니다.

### 환경 변수

설정 값을 환경 변수로 덮어쓸 수 있습니다:

| 변수 | 필수 | 설명 | 기본값 |
|------|------|------|--------|
| `DISCORD_BOT_TOKEN` | **필수** (config.json에 없는 경우) | Discord 봇 토큰 | - |
| `DISCORD_GUILD_ID` | **필수** (config.json에 없는 경우) | Discord 서버 ID | - |
| `DISCORD_CHANNEL_ID` | 선택 | 기본 채널 덮어쓰기 | 프로젝트별 자동 생성 |
| `TMUX_SESSION_PREFIX` | 선택 | tmux 세션 이름 접두사 | `agent-` |
| `TMUX_SESSION_MODE` | 선택 | tmux 세션 모드: `per-project`(기본) 또는 `shared` | `per-project` |
| `TMUX_SHARED_SESSION_NAME` | 선택 | 공유 tmux 세션 이름(접두사 제외), `TMUX_SESSION_MODE=shared`일 때 사용 | `bridge` |
| `HOOK_SERVER_PORT` | 선택 | 훅 서버 포트 | `18470` |

```bash
DISCORD_BOT_TOKEN=token agent-discord daemon start
DISCORD_GUILD_ID=server_id agent-discord go
```

### tmux 세션 모드 (CLI)

환경변수 없이 실행 인자로도 tmux 세션 동작을 오버라이드할 수 있습니다:

```bash
agent-discord go --tmux-session-mode shared --tmux-shared-session-name bridge
```

## 개발

### 빌드

```bash
npm install
npm run build          # TypeScript 컴파일
npm run build:watch    # 감시 모드
```

### 테스트

```bash
npm test              # 모든 테스트 실행
npm run test:watch    # 감시 모드
npm run test:coverage # 커버리지 리포트
```

테스트 스위트에 129개의 테스트가 포함되어 있습니다:
- 에이전트 어댑터
- 상태 관리
- Discord 클라이언트
- 캡처 폴링
- CLI 명령어
- 스토리지 및 실행 모킹

### 프로젝트 구조

```
discord-agent-bridge/
├── bin/                  # CLI 진입점 (agent-discord)
├── src/
│   ├── agents/           # 에이전트 어댑터 (Claude, OpenCode)
│   ├── capture/          # tmux 캡처, 폴링, 상태 감지
│   ├── config/           # 설정 관리
│   ├── discord/          # Discord 클라이언트 및 메시지 핸들러
│   ├── infra/            # 인프라 (스토리지, 셸, 환경)
│   ├── state/            # 프로젝트 상태 관리
│   ├── tmux/             # tmux 세션 관리
│   └── types/            # TypeScript 인터페이스
├── tests/                # Vitest 테스트 스위트
├── package.json
└── tsconfig.json
```

### 의존성 주입

코드베이스는 테스트 가능성을 위해 생성자 주입 패턴을 사용합니다:

```typescript
// 인터페이스
interface IStorage { readFile, writeFile, exists, unlink, mkdirp, chmod }
interface ICommandExecutor { exec, execVoid }
interface IEnvironment { get, homedir, platform }

// 사용
class DaemonManager {
  constructor(
    private storage: IStorage = new FileStorage(),
    private executor: ICommandExecutor = new ShellCommandExecutor()
  ) {}
}

// 테스트
const mockStorage = new MockStorage();
const daemon = new DaemonManager(mockStorage);
```

### 코드 품질

- TypeScript strict 모드 활성화
- ESM 모듈 (import 시 `.js` 확장자 사용)
- Vitest로 129개의 테스트 통과
- 미사용 로컬 변수/파라미터 금지 (`tsconfig.json`에서 강제)

## 문제 해결

### 봇이 연결되지 않음

1. 토큰 확인: `agent-discord config --show`
2. Discord 개발자 포털에서 봇 권한 확인
3. MessageContent 인텐트가 활성화되어 있는지 확인
4. 데몬 재시작: `agent-discord daemon stop && agent-discord daemon start`

### 에이전트가 감지되지 않음

1. `agent-discord agents`로 사용 가능한 에이전트 확인
2. 에이전트 바이너리가 PATH에 있는지 확인: `which claude`
3. 누락된 에이전트를 설치하고 재시도

### tmux 세션 문제

1. 세션 존재 확인: `tmux ls`
2. 오래된 세션 종료: `tmux kill-session -t <session-name>`
3. 프로젝트 재시작: `agent-discord stop && agent-discord start`

### Discord에 메시지가 표시되지 않음

1. 데몬 상태 확인: `agent-discord daemon status`
2. 데몬 로그 확인
3. Discord 채널 권한 확인 (봇에 Send Messages 권한 필요)

## 기여

기여를 환영합니다! 다음 절차를 따라주세요:

1. 리포지토리 포크
2. 피처 브랜치 생성 (`git checkout -b feature/amazing-feature`)
3. 변경사항 커밋 (`git commit -m 'Add amazing feature'`)
4. 브랜치에 푸시 (`git push origin feature/amazing-feature`)
5. Pull Request 생성

### 가이드라인

- 새 기능에 대한 테스트 추가
- TypeScript strict 모드 준수 유지
- 기존 코드 스타일 따르기
- 필요에 따라 문서 업데이트

## 라이선스

MIT 라이선스 - 자세한 내용은 [LICENSE](../LICENSE) 파일을 참조하세요.

## 감사의 말

- [Discord.js](https://discord.js.org/)로 제작
- [Claude Code](https://code.claude.com/docs/en/overview)와 [OpenCode](https://github.com/OpenCodeAI/opencode)로 구동
- [OpenClaw](https://github.com/nicepkg/openclaw)의 메신저 기반 명령 시스템에서 영감을 받았습니다. Discord를 통해 어디서나 장시간 실행되는 AI 에이전트 작업을 원격으로 제어하고 모니터링하려는 동기에서 시작되었습니다.

## 지원

- 이슈: [GitHub Issues](https://github.com/DoBuDevel/discord-agent-bridge/issues)
- Discord 봇 설정: [설정 가이드](DISCORD_SETUP.ko.md)
