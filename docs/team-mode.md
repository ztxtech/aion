# Team Mode

并行多 agent 协调。仿照 `code-yeongyu/oh-my-openagent` 的 team-mode 设计，在 AION 的 6 个 agent 之上做项目级、文件系统底层的 mailbox + 任务列表 + 生命周期管理。

## 状态：默认关闭

通过 `<project>/.opencode/aion.jsonc` 的 `teamMode` block 开启。

```jsonc
{
  "teamMode": {
    "enabled": true,
    "maxParallelMembers": 4,
    "maxMembers": 8
  }
}
```

重启 OpenCode 后，14 个 `team_*` 工具出现。

## 11 字段 schema

全部位于 `teamMode` 下：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `enabled` | bool | `false` | 主开关 |
| `tmuxVisualization` | bool | `false` | 每个 member 分配一个 tmux pane（需要已运行在 tmux 内） |
| `maxParallelMembers` | int 1..8 | `4` | 同时活跃的 member 上限 |
| `maxMembers` | int 1..8 | `8` | 团队总 member 上限 |
| `maxMessagesPerRun` | int ≥ 1 | `10000` | 单次 run 最多消息数 |
| `maxWallClockMinutes` | int ≥ 1 | `120` | 单次 run 墙钟上限 |
| `maxMemberTurns` | int ≥ 1 | `500` | 每个 member 最大 turn 数 |
| `baseDir` | string? | `<project>/.aion` | 团队 spec + runtime 根目录 |
| `messagePayloadMaxBytes` | int ≥ 1024 | `32768` | 单条消息体最大字节数 |
| `recipientUnreadMaxBytes` | int ≥ 1024 | `262144` | 单个收件人未读总字节数 |
| `mailboxPollIntervalMs` | int ≥ 500 | `3000` | 轮询建议间隔（实现在调用方） |

## 团队定义

团队 spec 放在：

```
<project>/.aion/teams/{name}/config.json
```

最小例子：

```json
{
  "name": "explorers",
  "description": "Scout the project for X.",
  "lead": { "kind": "subagent_type", "subagent_type": "aion" },
  "members": [
    {
      "name": "scout-1",
      "kind": "subagent_type",
      "subagent_type": "aion",
      "prompt": "Scout the source directory for auth patterns."
    },
    {
      "name": "scout-2",
      "kind": "category",
      "category": "quick",
      "prompt": "List public API endpoints with examples."
    }
  ]
}
```

Loader 自动填充 `version` / `createdAt` / `leadAgentId`。lead 可以通过 `lead: {...}` shorthand 显式声明，或在某 member 上标 `isLead: true`，或省略（单 member 时自动）。

## Member 类型

- **`kind: "subagent_type"`** — 直接的 AION agent（`aion` / `requirements-analyst` / `coder`）。`prompt` 可选。
- **`kind: "category"`** — 路由到 AION 的 deep / quick 模式（暂未实现自动路由，prompt 必填且需 member 自行决定深度）。

## Eligible / Hard-reject

- **Eligible：** `aion` / `requirements-analyst` / `coder`。
- **Hard-reject：** `ts-critic` / `c-critic` — 这两个 agent 在 governance 链上最高，不能参与 mailbox，否则会污染 stop-go 信号。

`team_create` 在解析 spec 时直接拒掉 hard-reject。

## 14 个工具

| 工具 | 用途 |
|------|------|
| `team_create` | 创建团队 + member runtime。返回 `teamRunId`。 |
| `team_delete` | 拆除（lead only；仍有 active member 时拒掉） |
| `team_shutdown_request` | lead 请求某 member 收摊 |
| `team_approve_shutdown` / `team_reject_shutdown` | member 或 lead 响应 |
| `team_send_message` | peer-to-peer mailbox（lead-only broadcast） |
| `team_status` | 完整 runtime state |
| `team_list` | declared + active |
| `team_task_create` | 共享 task list 创建 |
| `team_task_list` / `_get` / `_update` | task 状态推进 |
| `team_inbox` | 拉取自己 mailbox 的未读 |
| `team_inbox_ack` | 标记某条消息已读 → 移到 `processed/` |

## 生命周期

1. **create**：`team_create` 写 spec 到 `teams/{name}/config.json` + 写 `runtime/{teamRunId}/state.json` + 为每个 member 准备 `inboxes/{member}/processed/`。
2. **active**：每个 member 轮询 `team_inbox`，处理后用 `team_inbox_ack` 移到 `processed/`。
3. **shutdown**：`team_shutdown_request` 把 member 标成 `shutdown_requested`，member 收到 mailbox 里的 `kind=shutdown` 消息，处理完用 `team_approve_shutdown` 真正下线，或 `team_reject_shutdown` 拒绝。
4. **delete**：所有 member `shut_down` 后 `team_delete` 拆除 `runtime/{teamRunId}/`。

## Mailbox 行为

- 文件：`inboxes/{member}/{uuid}.json`（原子写入）。
- 投递中：`.delivering-{uuid}.json`（`.delivering-` 前缀的点文件被 `listUnread` 忽略）。
- 提交：`processed/{uuid}.json`。
- 释放/回收：投递失败 → 还原为 `{uuid}.json`；超过 10 分钟残留的 `.delivering-` 文件下次 `team_inbox` 时自动回收。
- 预算：`messagePayloadMaxBytes` / `recipientUnreadMaxBytes` 由 coordinator 在 send 时硬检查。

## Task List 行为

- 文件：`runtime/{teamRunId}/tasks/{uuid}.json`。
- 状态机：`open → claimed → in_progress → done | blocked | cancelled`。
- `claimed` 自动记录 `owner=from`。
- `dependencies` 字段是字符串数组（task id），由调用方决定拓扑。

## Worktree（可选）

在 member entry 加 `"worktreePath": "../wt-scout"`。路径相对文件系统或绝对；裸分支名（`main` 等）会被拒。需要在 git 仓库内运行。

## tmux 可视化（可选）

`tmuxVisualization: true` 要求：
- 当前 shell 已在 tmux 会话内
- `tmux` 在 PATH 上

每个 member 获得一个 pane；失败不会阻塞 team_create。

## 团队 spec 解析

| 写法 | 行为 |
|------|------|
| `lead: {...}` 显式 | 强制 lead |
| `members: [{..., isLead: true}]` | 该 member 为 lead |
| 两者都有 | 显式 `lead` 优先 |
| 都没有 | 单 member 时自动；多 member 时报错 |
| 都没有 | 走默认 `aion` lead（不会失败但可能不符合意图） |

## Storage layout

```
<project>/.aion/
├── teams/{name}/config.json
├── .highwatermark                       # 最近一次 teamRunId
└── runtime/{teamRunId}/
    ├── state.json
    ├── inboxes/
    │   └── {member}/
    │       ├── {uuid}.json              # 未读
    │       ├── .delivering-{uuid}.json  # 投递中（10 分钟 TTL）
    │       └── processed/{uuid}.json    # 已读
    └── tasks/
        └── {uuid}.json
```

## 与 oh-my-openagent 的差异

- AION team mode 是项目级（`<project>/.aion/`），不支持 `~/.omo` 用户级。
- Member 类型与 omo 不完全相同（omo 有 `sisyphus` / `atlas` / `hephaestus` 等，AION 用 `aion` / `requirements-analyst` / `coder`）。
- 没有 `delegate-task` 工具（用户走 `task` 内置工具把工作分派给 subagent）。
- Hard-reject 集合不同（`ts-critic` / `c-critic` 而非 `oracle` / `librarian` / `explore`）。
- mailbox `.delivering-` 回收策略相同（10 分钟 TTL，dotfile 过滤）。
- AION 把 stop-go 治理信号由 `aion_critic_verdict` 工具写入，team mode 不参与这条信号链（team member 不能调用 `aion_critic_verdict`）。
