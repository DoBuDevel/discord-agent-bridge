# Discord Agent Bridge - 기술 아키텍처 문서

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [시스템 아키텍처](#2-시스템-아키텍처)
3. [핵심 모듈 상세](#3-핵심-모듈-상세)
4. [캡처 폴링 시스템](#4-캡처-폴링-시스템)
5. [에이전트 어댑터 패턴](#5-에이전트-어댑터-패턴)
6. [데몬 관리](#6-데몬-관리)
7. [상태 관리 및 설정](#7-상태-관리-및-설정)
8. [CLI 명령어 레퍼런스](#8-cli-명령어-레퍼런스)
9. [디렉토리 구조](#9-디렉토리-구조)
10. [기술 스택](#10-기술-스택)

---

## 1. 프로젝트 개요

### 1.1 프로젝트 목적

discord-agent-bridge는 AI 에이전트 CLI(Claude Code, OpenCode, Codex CLI)의 출력을 Discord로 실시간 브릿징하는 도구입니다. 사용자는 Discord 채널에서 에이전트에게 명령을 보내고, 에이전트의 실행 상태와 결과를 실시간으로 모니터링할 수 있습니다.

### 1.2 해결하는 문제

1. **원격 모니터링**: 터미널이 아닌 Discord에서 에이전트의 실행 상태를 모니터링
2. **실시간 상호작용**: Discord 메시지로 에이전트에게 입력 전달
3. **다중 프로젝트 관리**: 여러 에이전트 CLI를 동시에 한 곳에서 관리
4. **상태 추적**: 각 프로젝트의 실행 상태를 자동으로 추적

### 1.3 핵심 가치 제안

- **간단한 설정**: 한 명령어로 전체 세팅 완료 (`agent-discord go`)
- **실시간 알림**: 에이전트 상태 변화를 즉시 Discord에 전송
- **프로젝트 독립성**: 각 프로젝트가 독립적인 Discord 채널을 가짐
- **글로벌 데몬**: 여러 프로젝트를 하나의 백그라운드 프로세스로 관리
- **확장 가능**: 새 에이전트 추가가 간단한 어댑터 패턴

---

## 2. 시스템 아키텍처

### 2.1 전체 시스템 구성도

```
┌─────────────────────────────────────────────────────────────┐
│                        Discord Server                        │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │ Project A Chanel │  │ Project B Channel│  │  Project C │ │
│  │ (#myapp-claude)  │  │ (#ml-opencode)   │  │ (#tool-c.) │ │
│  └────────┬─────────┘  └────────┬─────────┘  └─────┬──────┘ │
│           │ WebSocket            │                  │         │
└───────────┼──────────────────────┼──────────────────┼─────────┘
            │                      │                  │
         ┌──▼──────────────────────▼──────────────────▼───────┐
         │                                                    │
         │         Bridge Daemon (Node.js)                   │
         │      Listening on port 18470                      │
         │                                                    │
         │  ┌─────────────────────────────────────────────┐  │
         │  │        Discord Client (discord.js)          │  │
         │  │  • 메시지 수신 및 라우팅                   │  │
         │  │  • 채널 생성/삭제                          │  │
         │  │  • Discord 알림 전송                       │  │
         │  └─────────────────────────────────────────────┘  │
         │                                                    │
         │  ┌─────────────────────────────────────────────┐  │
         │  │      Capture Poller (30초 주기)            │  │
         │  │  • tmux pane 캡처                          │  │
         │  │  • 상태 변화 감지                          │  │
         │  │  • Discord 메시지 생성                     │  │
         │  └─────────────────────────────────────────────┘  │
         │                                                    │
         │  ┌─────────────────────────────────────────────┐  │
         │  │      State Manager                          │  │
         │  │  • 프로젝트 상태 저장/로드                │  │
         │  │  • 채널-프로젝트 매핑                      │  │
         │  │  • 구성 파일 관리                         │  │
         │  └─────────────────────────────────────────────┘  │
         │                                                    │
         │  ┌─────────────────────────────────────────────┐  │
         │  │      Tmux Manager                           │  │
         │  │  • send-keys로 명령 전달                   │  │
         │  │  • capture-pane으로 출력 캡처             │  │
         │  │  • 세션/윈도우 관리                        │  │
         │  └─────────────────────────────────────────────┘  │
         │                                                    │
         │  ┌─────────────────────────────────────────────┐  │
         │  │      Agent Registry                         │  │
         │  │  • 에이전트 어댑터 관리                    │  │
         │  │  • 채널명 파싱                             │  │
         │  │  • 에이전트 시작 명령 생성                │  │
         │  └─────────────────────────────────────────────┘  │
         │                                                    │
         └────────────────┬──────────────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┬──────────────────┐
        │                 │                 │                  │
    ┌───▼────┐      ┌────▼────┐      ┌────▼────┐      ┌───────▼─┐
    │ Project │      │ Project  │      │ Project  │      │  ...   │
    │    A    │      │    B     │      │    C     │      │        │
    │ tmux    │      │ tmux     │      │ tmux     │      │        │
    │ session │      │ session  │      │ session  │      │        │
    │         │      │          │      │          │      │        │
    │ ┌─────┐ │      │ ┌──────┐ │      │ ┌─────┐ │      │        │
    │ │cli  │ │      │ │cli   │ │      │ │cli  │ │      │        │
    │ │claude├─┼──────┼─┤open  ├─┼──────┼─┤codex├─┼──────┼─ ...   │
    │ │code │ │      │ │code  │ │      │ │cli  │ │      │        │
    │ └─────┘ │      │ └──────┘ │      │ └─────┘ │      │        │
    │         │      │          │      │          │      │        │
    └─────────┘      └──────────┘      └──────────┘      └────────┘
```

### 2.2 데이터 흐름

#### 2.2.1 Discord → Agent (사용자 입력)

```
User types in Discord        → discordMessage event
    ↓
Discord.js captures message
    ↓
Router finds channel mapping (projectName, agentType)
    ↓
tmux.sendKeysToWindow(sessionName, agentType, message)
    ↓
Agent CLI receives input and processes
```

#### 2.2.2 Agent → Discord (상태 모니터링)

```
CapturePoller (30초 주기)
    ↓
tmux.capturePaneFromWindow(sessionName, agentType)
    ↓
cleanCapture() - ANSI 코드 제거
    ↓
detectState(current, previous, stableCount)
    ↓
상태에 따라 Discord 메시지 생성:
  • working: "⚡ 작업 중..."
  • stopped: "💬 **완료**\n```\n[최종 출력]\n```"
  • offline: "⏹️ 세션 종료됨"
    ↓
splitForDiscord() - 2000자 제한으로 분할
    ↓
discord.sendToChannel(channelId, message)
```

### 2.3 핵심 컴포넌트 역할

| 컴포넌트 | 책임 |
|---------|------|
| **DiscordClient** | Discord API 관리, 메시지 송수신 |
| **TmuxManager** | tmux 세션/윈도우 제어, 입출력 처리 |
| **CapturePoller** | 주기적 상태 감지 및 알림 |
| **AgentRegistry** | 에이전트 어댑터 관리 |
| **StateManager** | 프로젝트 상태 영속화 |
| **DaemonManager** | 백그라운드 프로세스 관리 |

---

## 3. 핵심 모듈 상세

### 3.1 discord/ 모듈

#### 역할
Discord.js를 래핑하여 브릿지의 Discord 통신을 담당합니다.

#### 주요 클래스: DiscordClient

```typescript
class DiscordClient {
  // 핵심 메서드
  async connect(): Promise<void>           // Discord 로그인
  async createAgentChannels(...)          // 프로젝트별 채널 생성
  registerChannelMappings(...)            // 채널-프로젝트 매핑 등록
  onMessage(callback: MessageCallback)    // 메시지 수신 핸들러
  async sendToChannel(channelId, content) // 채널에 메시지 전송
  async sendQuestionWithButtons(...)      // 인터랙티브 버튼 UI
}
```

#### 설계 결정

1. **채널 자동 생성**: 프로젝트 초기화 시 Discord 채널 자동 생성
2. **채널명 패턴**: `{projectName}-{agentSuffix}` 형식으로 표준화
3. **메시지 콜백**: 옵저버 패턴으로 메시지 처리 분리
4. **자동 매핑**: 채널명에서 프로젝트명과 에이전트 타입 파싱

#### 의존성

```
discord.js 14.14.1 (Discord API)
├── TypeScript for type safety
├── chalk for colored output
└── commander for CLI
```

---

### 3.2 tmux/ 모듈

#### 역할
tmux 세션 관리 및 에이전트 CLI 제어

#### 주요 클래스: TmuxManager

```typescript
class TmuxManager {
  getOrCreateSession(projectName: string): string  // 세션 생성/조회
  createWindow(sessionName, windowName): void      // 윈도우 생성
  sendKeysToWindow(sessionName, windowName, keys) // 입력 전송
  capturePaneFromWindow(sessionName, windowName)  // 출력 캡처
  listWindows(sessionName): string[]              // 윈도우 목록
  setSessionEnv(sessionName, key, value)          // 환경변수 설정
}
```

#### 설계 결정

1. **세션 = 프로젝트**: 각 프로젝트는 하나의 tmux 세션
2. **윈도우 = 에이전트**: 세션 내 각 에이전트가 별도 윈도우
3. **환경변수**: 에이전트가 접근할 정보를 환경변수로 전달
   - `AGENT_DISCORD_PROJECT`: 프로젝트명
   - `AGENT_DISCORD_PORT`: 훅 서버 포트
   - `AGENT_DISCORD_YOLO`: YOLO 모드 플래그

#### 핵심 명령어

```bash
# 세션 생성
tmux new-session -d -s agent-projectname

# 윈도우 생성
tmux new-window -t agent-projectname -n claude

# 명령 전송
tmux send-keys -t agent-projectname:claude "claude" Enter

# 출력 캡처
tmux capture-pane -t agent-projectname:claude -p

# 환경변수 설정
tmux set-environment -t agent-projectname AGENT_DISCORD_PROJECT myproject
```

#### 의존성

```
child_process (Node.js)
├── execSync for tmux commands
└── No external dependencies
```

---

### 3.3 capture/ 모듈

#### 역할
tmux 출력을 주기적으로 캡처하여 상태를 감지하고 Discord에 알림

#### 주요 컴포넌트

##### 3.3.1 CapturePoller (poller.ts)

```typescript
class CapturePoller {
  private states: Map<string, PollState>  // 프로젝트별 상태
  private timer?: ReturnType<typeof setInterval>

  start(): void                           // 30초 주기 폴링 시작
  stop(): void                            // 폴링 중지
  private pollAll(): Promise<void>        // 모든 에이전트 폴링
  private pollAgent(project, agentType)   // 개별 에이전트 폴링
}

interface PollState {
  previousCapture: string | null     // 이전 캡처 내용
  lastReportedCapture: string | null // 마지막 보고된 내용
  stableCount: number                // 변화 없는 폴링 횟수
  notifiedWorking: boolean           // "작업 중" 알림 전송 여부
}
```

##### 3.3.2 상태 감지 로직

```typescript
// detector.ts
type AgentState = 'working' | 'stopped' | 'offline'

function detectState(
  current: string | null,    // 현재 캡처
  previous: string | null,   // 이전 캡처
  stableCount: number
): AgentState {
  if (current === null) return 'offline'      // 세션 없음
  if (previous === null) return 'working'     // 첫 캡처
  if (current !== previous) return 'working'  // 내용 변함
  return 'stopped'                            // 내용 동일
}
```

**상태 머신:**

```
┌─────────────┐
│   offline   │  (세션/윈도우 없음)
└─────────────┘
       ↑
       │ 세션 생성
       │
    ┌──▼──────┐
    │ working │ ◄──┐ 내용 변함
    └──┬──────┘   │
       │          │
       │ 내용 안 바뀜 (1회)
       │          │
    ┌──▼──────┐   │
    │ stopped │ ──┘ 내용 또 변함
    └─────────┘
```

##### 3.3.3 ANSI 파싱 및 메시지 분할

```typescript
// parser.ts

function stripAnsi(text: string): string
// ANSI 이스케이프 코드 제거
// 예: "\x1B[32m녹색\x1B[0m" → "녹색"

function cleanCapture(text: string): string
// stripAnsi + 후행 빈 줄 제거

function splitForDiscord(text: string, maxLen = 1900): string[]
// Discord 메시지 크기 제한(2000자)으로 분할
// 각 청크는 라인 경계에서 분할
```

---

### 3.4 agents/ 모듈

#### 역할
다양한 에이전트 CLI에 대한 어댑터 패턴 구현

#### 주요 클래스

##### 3.4.1 BaseAgentAdapter (base.ts)

```typescript
export abstract class BaseAgentAdapter {
  readonly config: AgentConfig

  isInstalled(): boolean
  // 명령어가 시스템에 설치되어 있는지 확인
  // 예: `command -v claude` 실행

  getStartCommand(projectPath: string, yolo = false): string
  // 에이전트를 시작하는 완전한 명령어 생성
  // 예: 'cd "/path/to/project" && claude --dangerously-skip-permissions'

  matchesChannel(channelName: string, projectName: string): boolean
  // 채널명이 이 에이전트의 것인지 확인
}

export interface AgentConfig {
  name: string           // 'claude', 'opencode', 'codex'
  displayName: string    // 'Claude Code', 'OpenCode', 'Codex CLI'
  command: string        // 실행 명령어
  channelSuffix: string  // 채널명 접미사
}
```

##### 3.4.2 구체적 어댑터들

**Claude Code (claude.ts)**
```typescript
class ClaudeAdapter extends BaseAgentAdapter {
  getStartCommand(projectPath: string, yolo = false): string {
    const flags = yolo ? ' --dangerously-skip-permissions' : ''
    return `cd "${projectPath}" && claude${flags}`
  }
}
```

**OpenCode (opencode.ts)**
```typescript
class OpenCodeAdapter extends BaseAgentAdapter {
  // 기본 구현 사용 (추가 옵션 없음)
}
```

**Codex CLI (codex.ts)**
```typescript
class CodexAdapter extends BaseAgentAdapter {
  // 기본 구현 사용 (추가 옵션 없음)
}
```

##### 3.4.3 AgentRegistry

```typescript
class AgentRegistry {
  private adapters: Map<AgentType, BaseAgentAdapter>

  register(adapter: BaseAgentAdapter): void
  get(name: AgentType): BaseAgentAdapter | undefined
  getAll(): BaseAgentAdapter[]
  getByChannelSuffix(suffix: string): BaseAgentAdapter | undefined
  parseChannelName(channelName: string):
    { projectName: string; agent: BaseAgentAdapter } | null
}
```

#### 새 에이전트 추가 방법

1. **어댑터 클래스 생성** (`src/agents/newagent.ts`)
   ```typescript
   import { BaseAgentAdapter, type AgentConfig } from './base.js'

   const config: AgentConfig = {
     name: 'newagent',
     displayName: 'New Agent Name',
     command: 'newagent-cli',
     channelSuffix: 'newagent'
   }

   export class NewAgentAdapter extends BaseAgentAdapter {
     constructor() {
       super(config)
     }
     // 필요시 getStartCommand() 오버라이드
   }

   export const newagentAdapter = new NewAgentAdapter()
   ```

2. **registry에 등록** (`src/agents/index.ts`)
   ```typescript
   import { newagentAdapter } from './newagent.js'
   agentRegistry.register(newagentAdapter)
   ```

---

### 3.5 state/ 모듈

#### 역할
프로젝트별 상태 파일 저장/로드 및 메모리 관리

#### 주요 클래스: StateManager

```typescript
class StateManager {
  // 프로젝트 관리
  getProject(projectName: string): ProjectState | undefined
  setProject(project: ProjectState): void
  removeProject(projectName: string): void
  listProjects(): ProjectState[]

  // 설정 관리
  getGuildId(): string | undefined
  setGuildId(guildId: string): void

  // 유틸리티
  findProjectByChannel(channelId: string): ProjectState | undefined
  getAgentTypeByChannel(channelId: string): string | undefined
  updateLastActive(projectName: string): void
  reload(): void  // 파일에서 재로드
}

interface ProjectState {
  projectName: string
  projectPath: string
  tmuxSession: string
  discordChannels: {
    [agentType: string]: string | undefined  // agentType → channelId
  }
  agents: {
    [agentType: string]: boolean  // agentType → enabled
  }
  createdAt: Date
  lastActive: Date
}
```

#### 상태 파일 위치

```
~/.discord-agent-bridge/state.json
```

#### 상태 파일 구조

```json
{
  "projects": {
    "my-project": {
      "projectName": "my-project",
      "projectPath": "/home/user/my-project",
      "tmuxSession": "agent-my-project",
      "discordChannels": {
        "claude": "1234567890"
      },
      "agents": {
        "claude": true
      },
      "createdAt": "2024-02-06T20:00:00.000Z",
      "lastActive": "2024-02-07T12:30:00.000Z"
    }
  },
  "guildId": "1234567890"
}
```

---

### 3.6 config/ 모듈

#### 역할
설정 파일 및 환경변수 관리

#### 주요 함수

```typescript
function loadStoredConfig(): StoredConfig
// ~/.discord-agent-bridge/config.json 로드

function saveConfig(updates: Partial<StoredConfig>): void
// 설정을 파일에 저장

function getConfigValue<K extends keyof StoredConfig>(key: K): StoredConfig[K]
// 특정 설정값 조회

function validateConfig(): void
// Discord 토큰 등 필수 값 확인

function getConfigPath(): string
// 설정 파일 경로 반환
```

#### 설정 파일 위치

```
~/.discord-agent-bridge/config.json
```

#### 설정 파일 구조

```json
{
  "token": "discord-bot-token",
  "serverId": "1234567890",
  "hookServerPort": 18470
}
```

#### 설정 우선순위 (높음 → 낮음)

1. 저장된 설정 파일 (`config.json`)
2. 환경변수 (`DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` 등)
3. 기본값 (포트 18470)

---

### 3.7 daemon/ 모듈

#### 역할
글로벌 백그라운드 프로세스 관리

#### 주요 클래스: DaemonManager

```typescript
class DaemonManager {
  static getPort(): number                     // 기본값 18470
  static async isRunning(): Promise<boolean>   // 포트로 연결 시도
  static startDaemon(entryPoint: string): number  // 데몬 시작
  static stopDaemon(): boolean                 // 데몬 중지
  static async waitForReady(timeoutMs): Promise<boolean>  // 준비 대기
  static getLogFile(): string
  static getPidFile(): string
}
```

#### 데몬 파일 위치

```
~/.discord-agent-bridge/daemon.pid    # PID 저장
~/.discord-agent-bridge/daemon.log    # 출력 로그
```

#### 설계 결정

1. **글로벌 싱글**: 하나의 데몬만 실행 (모든 프로젝트 공유)
2. **고정 포트**: 항상 18470 포트에서 대기
3. **PID 파일**: 프로세스 추적
4. **macOS caffeinate**: 맥에서 자동 슬립 방지

---

## 4. 캡처 폴링 시스템

### 4.1 폴링 주기

```
Start
 ↓
pollAll() 즉시 실행
 ↓
setInterval(pollAll, 30000) 시작 (30초마다)
 ↓
각 프로젝트의 활성화된 에이전트 폴링
```

### 4.2 상태 변화 감지

```
Poll Cycle 1: previousCapture = null, current = "..."
  → detectState(...) = 'working'
  → "⚡ 작업 중..." 전송
  → notifiedWorking = true

Poll Cycle 2: previousCapture = "...", current = "... more output"
  → detectState(...) = 'working'
  → 이미 notifiedWorking이므로 무시

Poll Cycle 3: previousCapture = "... more", current = "... more"
  → detectState(...) = 'stopped'
  → stableCount = 1
  → state.notifiedWorking = true이고 stableCount = 1
  → 최종 출력 전송: "💬 **완료**\n```\n[출력]\n```"
  → notifiedWorking = false

Poll Cycle 4: previousCapture = "...", current = "..."
  → detectState(...) = 'stopped'
  → stableCount = 2
  → notifiedWorking = false이므로 무시
```

### 4.3 알림 로직

```typescript
// poller.ts - pollAgent 함수

if (agentState === 'working') {
  // 내용이 변함 → 에이전트가 작업 중
  state.stableCount = 0
  state.previousCapture = capture

  if (!state.notifiedWorking) {
    await this.send(channelId, '⚡ 작업 중...')
    state.notifiedWorking = true
  }
  return
}

// 내용이 안 바뀜 → 안정화
state.stableCount++
state.previousCapture = capture

if (state.stableCount === 1 && state.notifiedWorking) {
  // 방금 안정화됨 (작업 중 → 완료)
  const content = capture.trim()

  if (content && content !== state.lastReportedCapture) {
    const chunks = splitForDiscord(`💬 **완료**\n\`\`\`\n${content}\n\`\`\``)
    for (const chunk of chunks) {
      await this.send(channelId, chunk)
    }
  } else {
    await this.send(channelId, '✅ 작업 완료')
  }

  state.lastReportedCapture = capture
  state.notifiedWorking = false
}
```

### 4.4 ANSI 파싱

터미널 색상/포맷 코드 제거:

```typescript
const ANSI_REGEX = /\x1B(?:\[[0-9;]*[A-Za-z]|\].*?(?:\x07|\x1B\\)|\([A-Z])/g

function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '')
}
```

예시:
```
입력:  "\x1B[32m✓ Success\x1B[0m"
출력:  "✓ Success"
```

### 4.5 메시지 분할

Discord 메시지는 최대 2000자 제한:

```typescript
function splitForDiscord(text: string, maxLen = 1900): string[] {
  if (text.length <= maxLen) return [text]

  const chunks: string[] = []
  const lines = text.split('\n')
  let current = ''

  for (const line of lines) {
    if (current.length + line.length + 1 > maxLen) {
      if (current) chunks.push(current)
      current = line
    } else {
      current += (current ? '\n' : '') + line
    }
  }
  if (current) chunks.push(current)

  return chunks
}
```

---

## 5. 에이전트 어댑터 패턴

### 5.1 어댑터 인터페이스

```typescript
abstract class BaseAgentAdapter {
  readonly config: AgentConfig

  isInstalled(): boolean
  getStartCommand(projectPath: string, yolo = false): string
  matchesChannel(channelName: string, projectName: string): boolean
}
```

### 5.2 어댑터 사용

```typescript
const adapter = agentRegistry.get('claude')

// 설치 확인
if (!adapter.isInstalled()) {
  console.log('Claude Code not installed')
}

// 시작 명령 생성
const command = adapter.getStartCommand('/path/to/project', false)
// "cd \"/path/to/project\" && claude"

// YOLO 모드
const yamaCommand = adapter.getStartCommand('/path/to/project', true)
// "cd \"/path/to/project\" && claude --dangerously-skip-permissions"
```

### 5.3 YOLO 모드

YOLO 모드는 에이전트가 모든 권한 확인을 건너뛰도록 설정합니다:

- Claude Code: `--dangerously-skip-permissions` 플래그 추가
- OpenCode/Codex: 기본 구현 사용 (향후 확장 가능)

**사용 예시:**

```bash
agent-discord go --yolo
```

**환경변수로도 설정 가능:**

```bash
# 이미 실행 중인 프로젝트에 YOLO 모드 적용
tmux set-environment -t agent-myproject AGENT_DISCORD_YOLO 1
```

### 5.4 에이전트 등록 시스템

```typescript
// src/agents/index.ts

import { agentRegistry } from './base.js'
import { claudeAdapter } from './claude.js'
import { opencodeAdapter } from './opencode.js'
import { codexAdapter } from './codex.js'

// 모든 어댑터 등록
agentRegistry.register(claudeAdapter)
agentRegistry.register(opencodeAdapter)
agentRegistry.register(codexAdapter)

export { agentRegistry }
```

### 5.5 채널명 파싱

채널명에서 프로젝트명과 에이전트 타입을 추출:

```typescript
agentRegistry.parseChannelName("myproject-claude")
// → { projectName: "myproject", agent: claudeAdapter }

agentRegistry.parseChannelName("ml-work-opencode")
// → { projectName: "ml-work", agent: opencodeAdapter }
```

---

## 6. 데몬 관리

### 6.1 글로벌 싱글 데몬 아키텍처

```
┌──────────────────────────────────────────┐
│         One Daemon Process               │
│         (PID in ~/.../daemon.pid)        │
│         (port 18470)                     │
│                                          │
│  Manages ALL projects:                   │
│  • Project A (Claude)                    │
│  • Project B (OpenCode)                  │
│  • Project C (Codex)                     │
│  • ...                                   │
└──────────────────────────────────────────┘

CLI commands communicate with daemon via HTTP POST /reload
```

### 6.2 프로세스 라이프사이클

#### 시작

```bash
# daemon이 없으면 자동으로 시작
agent-discord go
  ↓
DaemonManager.isRunning() → false
  ↓
DaemonManager.startDaemon(entryPoint)
  ↓
spawn('caffeinate' on macOS / 'node' on Linux, [entryPoint])
  ↓
PID 저장 (~/.../daemon.pid)
  ↓
waitForReady() - 포트 18470에 연결 시도
  ↓
"✅ Daemon started"
```

#### 종료

```bash
agent-discord daemon stop
  ↓
DaemonManager.stopDaemon()
  ↓
PID 파일에서 PID 읽기
  ↓
process.kill(pid, 'SIGTERM')
  ↓
PID 파일 삭제
```

### 6.3 macOS caffeinate 연동

macOS에서는 자동 슬립을 방지하기 위해 caffeinate를 사용:

```typescript
const isMac = process.platform === 'darwin'
const command = isMac ? 'caffeinate' : 'node'
const args = isMac ? ['-ims', 'node', entryPoint] : [entryPoint]

spawn(command, args)
```

**caffeinate 옵션:**
- `-i`: 유휴 시간에도 슬립 방지
- `-m`: 디스크 유휴 시간 무시
- `-s`: 시스템 슬립 방지

### 6.4 PID 관리

```typescript
// 시작
const pid = child.pid
writeFileSync(pidFile, String(pid))

// 중지
const pidFile = '~/.../daemon.pid'
const pid = parseInt(readFileSync(pidFile, 'utf-8'))
process.kill(pid, 'SIGTERM')
unlinkSync(pidFile)
```

### 6.5 로그 관리

```
~/.discord-agent-bridge/daemon.log

모든 stdout/stderr를 파일에 append:
spawn(command, args, {
  stdio: ['ignore', out, err]  // out, err = daemon.log 파일 디스크립터
})
```

---

## 7. 상태 관리 및 설정

### 7.1 설정 계층

```
┌────────────────────────────────┐
│   ~/.discord-agent-bridge/     │
│   config.json                  │
│ (저장된 설정)                  │
└────────────────┬───────────────┘
                 │ 우선순위: 높음
                 ↓
┌────────────────────────────────┐
│   환경변수                      │
│   DISCORD_BOT_TOKEN             │
│   DISCORD_GUILD_ID              │
│   HOOK_SERVER_PORT              │
└────────────────┬───────────────┘
                 │ 우선순위: 중간
                 ↓
┌────────────────────────────────┐
│   기본값                        │
│   port = 18470                  │
└────────────────────────────────┘
```

### 7.2 설정 파일 구조

```json
{
  "token": "MTE2MjYxNzgxOTI5MzI2MzI4Ng.GxYZ1a.9ZjK0-Pq...",
  "serverId": "1162617819293263281",
  "hookServerPort": 18470
}
```

### 7.3 프로젝트별 상태 추적

```typescript
interface ProjectState {
  projectName: string        // "my-project"
  projectPath: string        // "/home/user/my-project"
  tmuxSession: string        // "agent-my-project"

  discordChannels: {         // agentType → Discord channel ID
    claude: "1234567890"
    // opencode: undefined (미사용)
    // codex: undefined (미사용)
  }

  agents: {                  // agentType → enabled flag
    claude: true
    opencode: false
    codex: false
  }

  createdAt: Date            // "2024-02-06T20:00:00Z"
  lastActive: Date           // "2024-02-07T12:30:00Z"
}
```

### 7.4 채널 매핑 시스템

```typescript
// DiscordClient에서 관리
private channelMapping: Map<string, ChannelInfo>
  channelId → { projectName, agentType }

// 메시지 수신 시
messageCreate event:
  channelId = "1234567890"
    ↓
  channelMapping.get("1234567890")
    ↓
  { projectName: "my-project", agentType: "claude" }
    ↓
  messageCallback("claude", content, "my-project", "1234567890")
```

### 7.5 상태 영속화 전략

```typescript
// StateManager는 메모리 + 파일 동이중화

// 쓰기
setProject(project) {
  this.state.projects[project.projectName] = project  // 메모리
  this.saveState()  // 파일에 쓰기
}

// 읽기
getProject(name) {
  return this.state.projects[name]  // 메모리에서
}

// 재로드 (파일 변경 감지)
reload() {
  this.state = this.loadState()  // 파일에서 재로드
}
```

---

## 8. CLI 명령어 레퍼런스

### 8.1 setup - 초기 설정

```bash
agent-discord setup <token>
```

**역할**: 한 번에 토큰 저장, 서버 감지, 에이전트 감지

**동작:**
1. 토큰 저장 (config.json)
2. Discord 연결
3. 서버 목록 표시 (다중 서버인 경우)
4. 서버 선택 및 저장
5. 설치된 에이전트 감지

**예시:**
```bash
agent-discord setup MTE2MjYxNzgxOTI5MzI2MzI4Ng.GxYZ1a.9ZjK0-Pq...
```

### 8.2 go - 빠른 시작

```bash
agent-discord go [agent] [options]
```

**옵션:**
- `-n, --name <name>`: 프로젝트명 (기본: 현재 디렉토리명)
- `--no-attach`: tmux에 자동 연결하지 않음
- `--yolo`: YOLO 모드 (권한 확인 생략)

**동작:**
1. 데몬 확인/시작
2. 에이전트 자동 감지 또는 지정된 에이전트 사용
3. 기존 프로젝트면 재개, 신규면 전체 설정
4. tmux 세션 생성 및 환경변수 설정
5. 기본적으로 tmux에 자동 연결

**예시:**
```bash
# 설치된 에이전트 자동 감지
cd ~/my-project
agent-discord go

# 특정 에이전트 지정
agent-discord go claude

# YOLO 모드
agent-discord go --yolo

# 프로젝트명 지정
agent-discord go -n my-awesome-project

# tmux 연결 안 함
agent-discord go --no-attach
```

### 8.3 init - 프로젝트 초기화

```bash
agent-discord init <agent> <description> [options]
```

**인자:**
- `agent`: claude, opencode, codex 중 하나
- `description`: Discord 채널 설명 (예: "내 프로젝트 작업")

**옵션:**
- `-n, --name <name>`: 프로젝트명

**동작:**
1. 에이전트 검증
2. Discord 채널 생성: `{Agent} - {description}`
3. tmux 세션 생성
4. 프로젝트 상태 저장

**예시:**
```bash
cd ~/my-project
agent-discord init claude "백엔드 API 개발"
# → 채널명: "Claude Code - 백엔드 API 개발"

agent-discord init opencode "테스트 코드 작성" -n test-project
# → 프로젝트명: test-project
# → 채널명: "OpenCode - 테스트 코드 작성"
```

### 8.4 start - 브릿지 서버 시작

```bash
agent-discord start [options]
```

**옵션:**
- `-p, --project <name>`: 특정 프로젝트만
- `-a, --attach`: tmux에 연결

**동작:**
1. 설정 검증
2. 모든 프로젝트(또는 지정된 프로젝트) 로드
3. Discord 연결
4. Capture Poller 시작
5. HTTP 서버 시작 (포트 18470)
6. --attach 옵션이면 tmux에 연결

**예시:**
```bash
# 모든 프로젝트 시작
agent-discord start

# 특정 프로젝트만
agent-discord start -p my-project

# 그리고 tmux에 연결
agent-discord start -p my-project --attach
```

### 8.5 config - 설정 관리

```bash
agent-discord config [options]
```

**옵션:**
- `-s, --server <id>`: 서버 ID 설정
- `-t, --token <token>`: 봇 토큰 설정
- `-p, --port <port>`: 훅 서버 포트 설정
- `--show`: 현재 설정 표시

**예시:**
```bash
# 토큰 설정
agent-discord config --token YOUR_BOT_TOKEN

# 서버 ID 설정
agent-discord config --server 1162617819293263281

# 포트 설정
agent-discord config --port 9999

# 현재 설정 보기
agent-discord config --show
```

### 8.6 status - 상태 확인

```bash
agent-discord status
```

**표시 내용:**
- 현재 설정 (토큰, 서버 ID, 포트)
- 등록된 에이전트
- 설정된 프로젝트 목록
- 활성 tmux 세션

### 8.7 list - 프로젝트 목록

```bash
agent-discord list
agent-discord ls
```

설정된 모든 프로젝트 표시

### 8.8 attach - tmux 연결

```bash
agent-discord attach [project]
```

기존 tmux 세션에 연결

**예시:**
```bash
# 현재 디렉토리명 기반 연결
agent-discord attach

# 특정 프로젝트명
agent-discord attach my-project
```

### 8.9 stop - 프로젝트 중지

```bash
agent-discord stop [project] [options]
```

**옵션:**
- `--keep-channel`: Discord 채널은 유지하고 tmux만 종료

**동작:**
1. tmux 세션 종료
2. Discord 채널 삭제 (기본)
3. 프로젝트 상태 제거

### 8.10 daemon - 데몬 관리

```bash
agent-discord daemon <action>
```

**action:**
- `start`: 데몬 시작
- `stop`: 데몬 중지
- `status`: 데몬 상태 확인

**예시:**
```bash
agent-discord daemon start
agent-discord daemon status
agent-discord daemon stop
```

### 8.11 agents - 에이전트 목록

```bash
agent-discord agents
```

지원하는 모든 에이전트 어댑터 표시

---

## 9. 디렉토리 구조

```
discord-agent-bridge/
├── bin/
│   └── agent-discord.ts          # CLI 진입점 (commander 기반)
│
├── src/
│   ├── index.ts                  # AgentBridge 클래스 (메인 로직)
│   ├── daemon.ts                 # DaemonManager (글로벌 백그라운드 프로세스)
│   ├── daemon-entry.ts           # 데몬 진입점
│   │
│   ├── capture/
│   │   ├── index.ts              # 모듈 export
│   │   ├── poller.ts             # CapturePoller (30초 폴링)
│   │   ├── detector.ts           # detectState (상태 감지)
│   │   └── parser.ts             # ANSI 제거, 메시지 분할
│   │
│   ├── discord/
│   │   ├── index.ts              # 모듈 export
│   │   └── client.ts             # DiscordClient (discord.js 래핑)
│   │
│   ├── tmux/
│   │   ├── index.ts              # 모듈 export
│   │   └── manager.ts            # TmuxManager (tmux 제어)
│   │
│   ├── agents/
│   │   ├── index.ts              # 모듈 export, registry 등록
│   │   ├── base.ts               # BaseAgentAdapter, AgentRegistry
│   │   ├── claude.ts             # ClaudeAdapter
│   │   ├── opencode.ts           # OpenCodeAdapter
│   │   └── codex.ts              # CodexAdapter
│   │
│   ├── state/
│   │   ├── index.ts              # StateManager export
│   │   └── (직접 index.ts에 구현)
│   │
│   ├── config/
│   │   ├── index.ts              # 설정 로드/저장 함수
│   │   └── (직접 index.ts에 구현)
│   │
│   └── types/
│       ├── index.ts              # 모든 타입 정의
│       └── (직접 index.ts에 구현)
│
├── dist/                         # 빌드 결과물
├── package.json
├── tsconfig.json
├── tsup.config.ts               # tsup 빌드 설정
└── README.md
```

### 파일별 역할

| 파일 | 역할 | 라인 수 |
|------|------|--------|
| `bin/agent-discord.ts` | CLI 명령어 처리 | ~690 |
| `src/index.ts` | AgentBridge 클래스 (메인 로직) | ~244 |
| `src/daemon.ts` | 글로벌 데몬 관리 | ~126 |
| `src/capture/poller.ts` | 30초 폴링 루프 | ~137 |
| `src/capture/detector.ts` | 상태 감지 | ~24 |
| `src/capture/parser.ts` | ANSI 파싱, 메시지 분할 | ~50 |
| `src/discord/client.ts` | Discord.js 래핑 | ~423 |
| `src/tmux/manager.ts` | tmux 제어 | ~201 |
| `src/agents/base.ts` | 어댑터 기본 클래스 | ~88 |
| `src/agents/claude.ts` | Claude Code 어댑터 | ~26 |
| `src/agents/opencode.ts` | OpenCode 어댑터 | ~22 |
| `src/agents/codex.ts` | Codex CLI 어댑터 | ~22 |
| `src/state/index.ts` | 상태 관리 | ~115 |
| `src/config/index.ts` | 설정 관리 | ~90 |
| `src/types/index.ts` | 타입 정의 | ~51 |

---

## 10. 기술 스택

### 10.1 핵심 의존성

| 패키지 | 버전 | 용도 |
|--------|------|------|
| **discord.js** | 14.14.1 | Discord API 클라이언트 |
| **commander** | 12.0.0 | CLI 명령어 파싱 |
| **dotenv** | 16.4.5 | 환경변수 로드 |
| **chalk** | 5.3.0 | 터미널 색상 출력 |

### 10.2 개발 의존성

| 패키지 | 버전 | 용도 |
|--------|------|------|
| **typescript** | 5.3.3 | 타입 검사 |
| **@types/node** | 20.11.5 | Node.js 타입 |
| **tsx** | 4.7.0 | TypeScript 개발 실행 |
| **tsup** | 8.0.1 | 번들 빌드 |

### 10.3 Node.js 내장 모듈

```typescript
import { spawn, execSync } from 'child_process'  // 프로세스 제어
import { createConnection, createServer } from 'net'  // 네트워킹
import { createInterface } from 'readline'  // 표준입력
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'  // 파일 I/O
import { join } from 'path'  // 경로 조작
import { homedir } from 'os'  // OS 정보
import { parse } from 'url'  // URL 파싱
```

### 10.4 아키텍처 선택 이유

#### discord.js 선택
- 완성도 높은 Discord API 래핑
- TypeScript 지원
- 안정적인 이벤트 처리

#### commander 선택
- 가벼운 CLI 프레임워크
- 명령어/옵션 파싱 간편
- 자동 도움말 생성

#### dotenv 선택
- 환경변수 로드 표준화
- .env 파일 지원

#### chalk 선택
- 터미널 색상 출력 간편
- 크로스 플랫폼 지원

#### TypeScript 선택
- 타입 안정성
- 조기 에러 감지
- IDE 지원 향상

### 10.5 빌드 및 배포

```bash
# 개발
npm run dev          # tsx로 직접 실행

# 빌드
npm run build        # tsup으로 dist/ 생성

# 타입 체크
npm run typecheck    # tsc --noEmit

# 설치
npm link             # 글로벌 agent-discord 명령어 등록
```

### 10.6 출력 포맷

| 항목 | 포맷 |
|------|------|
| 성공 | ✅ (green) |
| 오류 | ❌ (red) |
| 경고 | ⚠️ (yellow) |
| 작업 중 | ⚡ (cyan) |
| 완료 | 💬 (cyan) |
| 정보 | 📋, 🤖, 📡 등 |

---

## 추가 참고 자료

### 환경변수 전체 목록

| 환경변수 | 기본값 | 설명 |
|---------|-------|------|
| `DISCORD_BOT_TOKEN` | 없음 | Discord 봇 토큰 |
| `DISCORD_GUILD_ID` | 없음 | Discord 서버 ID |
| `DISCORD_CHANNEL_ID` | 없음 | (현재 미사용) |
| `HOOK_SERVER_PORT` | 18470 | 훅 서버 포트 |
| `TMUX_SESSION_PREFIX` | "agent-" | tmux 세션 접두사 |
| `AGENT_DISCORD_PROJECT` | 없음 | 프로젝트명 (tmux에서만) |
| `AGENT_DISCORD_PORT` | 없음 | 훅 서버 포트 (tmux에서만) |
| `AGENT_DISCORD_YOLO` | 없음 | YOLO 모드 플래그 (tmux에서만) |

### 주요 파일 위치

| 파일 | 위치 |
|------|------|
| 설정 | `~/.discord-agent-bridge/config.json` |
| 상태 | `~/.discord-agent-bridge/state.json` |
| 데몬 PID | `~/.discord-agent-bridge/daemon.pid` |
| 데몬 로그 | `~/.discord-agent-bridge/daemon.log` |

### 디버깅 팁

1. **데몬 로그 확인**: `cat ~/.discord-agent-bridge/daemon.log`
2. **프로세스 확인**: `ps aux | grep agent-discord`
3. **포트 확인**: `lsof -i :18470`
4. **tmux 세션 확인**: `tmux list-sessions`
5. **상태 파일 확인**: `cat ~/.discord-agent-bridge/state.json`

---

## 문서 이력

- **2024-02-07**: 초기 작성 (v0.1.0)
  - 전체 아키텍처 문서화
  - 모든 모듈 상세 설명
  - CLI 명령어 레퍼런스

---

**문서 작성자**: discord-agent-bridge 프로젝트
**마지막 업데이트**: 2024-02-07
**버전**: 0.1.0
