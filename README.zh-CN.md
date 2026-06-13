<h1 align="center">
  <img src="https://img.shields.io/badge/AION-时间序列_Harness-7C3AED?style=for-the-badge&logo=openai&logoColor=white" alt="AION" />
</h1>

<p align="center">
  <a href="README.md"><strong>English</strong></a> ·
  <a href="README.zh-CN.md"><strong>简体中文</strong></a>
</p>

## 📰 News

- **2026-06-13** — 我们正在开发全新的 **Plugin** 版本 AION。欢迎关注 [`dev`](https://github.com/ztxtech/aion/tree/dev) 分支。

---

**AION** 是一个时间序列 harness — 一个将任务规格、运行时执行与结果评估连接成一个稳定流程的显式控制层，面向下一代时间序列工作负载。

时间序列研究正在超越固定预测 benchmark，转向结合预测、上下文推理、工具使用和结构化决策支持的任务。AION 将这些任务形式化为*任务文件、工作空间与验证接口*的三元组，并将整个系统围绕四个堆叠层组织：**任务层**（要解决什么）、**工作空间层**（有哪些证据和工具）、**执行层**（系统如何在约束下行动）和**审查层**（输出是否通过有效性、时间性和完整性检查后才被接受）。

<p align="center">
  <a href="#-快速开始"><img src="https://img.shields.io/badge/快速开始-3分钟-blue?style=for-the-badge" alt="Quick Start"></a>
  <a href="#-四层架构"><img src="https://img.shields.io/badge/层级-4层-10B981?style=for-the-badge" alt="Layers"></a>
  <a href="#-技能清单"><img src="https://img.shields.io/badge/技能-17个-8B5CF6?style=for-the-badge" alt="Skills"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/许可证-MIT-yellow?style=for-the-badge" alt="License"></a>
  <a href="https://arxiv.org/abs/2605.25045"><img src="https://img.shields.io/badge/arXiv-2605.25045-B31B1B?style=for-the-badge&logo=arxiv&logoColor=white" alt="arXiv"></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/OpenCode-≥0.9-blue?logo=terminal&logoColor=white" alt="OpenCode">
  <img src="https://img.shields.io/badge/Python-≥3.10-3776AB?logo=python&logoColor=white" alt="Python">
  <img src="https://img.shields.io/badge/多Agent-6个角色-F59E0B?style=flat" alt="Multi-Agent">
  <img src="https://img.shields.io/badge/协议-8个-06B6D4?style=flat" alt="Protocols">
  <img src="https://img.shields.io/badge/评测-5道门禁-EC4899?style=flat" alt="Evals">
  <img src="https://img.shields.io/badge/时间序列-Harness-7C3AED?style=flat" alt="Time Series">
  <a href="https://github.com/ztxtech/aion"><img src="https://img.shields.io/github/stars/ztxtech/aion?style=social" alt="GitHub stars"></a>
  <img src="https://img.shields.io/github/last-commit/ztxtech/aion?color=orange" alt="Last Commit">
  <a href="https://deepwiki.com/ztxtech/aion"><img src="https://deepwiki.com/badge.svg" alt="Ask DeepWiki"></a>
</p>

---

## ✨ AION 是什么？

现有的 benchmark 和 agent 系统各自只捕捉了向下一代时间序列任务转变的一部分：benchmark 通常过早简化任务，而单纯的 agent 不提供时间约束、证据纪律或可靠的停止标准。

AION 作为基于 [OpenCode](https://github.com/anomalyco/opencode) 的**时间序列 harness** 来填补这一空白：

- **任务层** — 将下一代时间序列任务形式化为*任务文件、工作空间与验证接口*的三元组
- **工作空间层** — 为开放式研究提供结构化证据收集、工具编排和持久记忆
- **执行层** — 通过协议、治理层级、上下文压缩和安全门禁约束多 agent 运行时
- **审查层** — 在进度被接受前强制执行有效性、时间性和完整性检查；没有输出可以在不通过分层 critic 的情况下离开系统

时间序列专业化通过**时间性奠基**、**知识引导的搜索**和**分层可靠性检查**进入系统，使系统能够在开放证据下工作，同时保持输出的合法性和停止纪律。

---

## 🏗️ 四层架构

AION 围绕四个堆叠层组织一切 — 每一层约束其下方的一层：**任务层**（要解决什么）、**工作空间层**（有哪些证据和工具）、**执行层**（系统如何在约束下行动）和**审查层**（输出是否通过有效性、时间性和完整性检查后才被接受）。

### 目录结构

```
.opencode/
├── agents/           # 6 个专业化 agent
│   ├── agent.md              # 主控 agent（mode: primary）
│   ├── requirements-analyst  # 任务 intake 与需求抽取
│   ├── information-collector # 外部证据与 SOTA 搜索
│   ├── coder.md              # 实现、实验与交付
│   ├── ts-critic.md          # 时间序列专家 + Pareto 治理
│   └── c-critic.md           # 最终最小上下文冷启动批判
├── skills/           # 17 个可复用技能
│   ├── context-init/         # 手动起手并开始任务
│   ├── workspace-init/       # 自动工作区初始化
│   ├── plan/                 # 复杂任务计划
│   ├── brain-storm/          # 多角度分析
│   ├── deep-reasoning/       # 多步推理与辩论
│   ├── critic-loop/          # 审查与回退判断
│   ├── time-series/          # 时间序列统一审查框架
│   ├── data-interface/       # 四类数据入口契约
│   ├── forecast-contract/    # 预测输出可控性与有效性校验
│   ├── report-writing/       # 实验报告与正式文档输出
│   ├── python-toolbox/       # Python 工具先验库
│   ├── ztxexp/               # 实验目录结构与出图协议
│   ├── github-search/        # GitHub 一手工程证据检索
│   ├── pdf-intake/           # PDF / 扫描件安全提取
│   ├── safety-gate/          # 自动化安全预检
│   ├── evolution/            # 能力缺口 → 新 agent/skill 创建
│   └── template/             # 空 skill 骨架
├── rules/            # 共享规则（自动加载）
│   ├── core.md               # 包边界、trace、占位符
│   ├── opencode.md           # OpenCode 文档与仓库链接
│   ├── agent-autonomy.md     # 子 agent 自主性约束
│   ├── experiment.md         # Benchmark-first 实验规则
│   ├── time-series.md        # 时间序列共享规则
│   └── websearch.md          # 网页搜索回退链
├── protocols/        # 8 个运行时协议
│   ├── dispatch.md           # 子 agent 派单契约
│   ├── reportback.md         # 回传契约
│   ├── rebuttal.md           # Rebuttal 协议
│   ├── stop-go.md            # 停止/继续治理
│   ├── lifecycle.md          # Agent 生命周期管理
│   ├── memory-sync.md        # 记忆同步
│   ├── runtime-events.md     # 运行时事件追踪
│   └── compaction.md         # 上下文压缩协议
├── evals/            # 5 个评测契约
│   ├── suites.md             # 测试套件定义
│   ├── graders.md            # 评分器规格
│   ├── scorecards.md         # 计分卡模板
│   ├── regression-matrix.md  # 回归测试矩阵
│   └── release-gates.md      # 发布门禁
├── memory/
│   └── template/     # 11 个记忆模板
│       ├── initial-prompt.md  # 反漂移任务基线
│       ├── context-snapshot.md # 规范化压缩 artifact
│       ├── progress.md        # 任务进度追踪
│       ├── decisions.md       # 关键决策日志
│       ├── features.md        # 特征清单
│       ├── todo-map.md        # 前沿与 TODO 追踪
│       ├── completion-gate.md # 完成度检查表
│       ├── positive.md        # 正面发现池
│       ├── negative.md        # 负面发现池
│       ├── relation.md        # Agent 关系图
│       ├── memory.md          # 持久记忆
│       ├── dir.md             # 目录结构
│       └── trace.md           # Trace 模板种子
└── .gitignore
```

---

## 🚀 快速开始

### 0. 环境前提

AION 需要标准的 Linux/macOS 环境，并确保以下系统命令可用：

| 命令            | 用途                                 | 备注        |
| --------------- | ------------------------------------ | ----------- |
| `git`           | 克隆 .opencode、本地 checkpoint 历史 | 通常已预装  |
| `curl`          | 下载 AION、网页搜索回退              | 通常已预装  |
| `tar` / `unzip` | 解压归档文件                         | 通常已预装  |
| `python3`       | Python 工具链、校验器                | 建议 ≥ 3.10 |
| `bash`          | cli.sh 与技能脚本                    | ≥ 4.0       |

部分命令（如通过包管理器安装 `git`、`curl` 或 `unzip`）可能需要 **root/sudo** 权限。在最小化容器或 CI 镜像中，请先安装这些依赖：

```bash
# Debian / Ubuntu
sudo apt-get update && sudo apt-get install -y git curl unzip tar python3

# RHEL / CentOS / Fedora
sudo dnf install -y git curl unzip tar python3

# macOS（通常已预装；如未安装）
brew install git curl python3
```

### 1. 安装 OpenCode

```bash
# 一键安装（YOLO）
curl -fsSL https://opencode.ai/install | bash

# 包管理器安装
npm i -g opencode-ai@latest        # 或 bun/pnpm/yarn
scoop install opencode             # Windows
choco install opencode             # Windows
brew install anomalyco/tap/opencode # macOS 和 Linux（推荐，始终最新）
brew install opencode              # macOS 和 Linux（官方 brew 公式，更新较慢）
sudo pacman -S opencode            # Arch Linux（稳定版）
paru -S opencode-bin               # Arch Linux（AUR 最新版）
mise use -g opencode               # 任意系统
nix run nixpkgs#opencode           # 或 github:anomalyco/opencode（最新开发分支）
```

### 2. 配置 OpenCode

```bash
opencode    # 启动 TUI，然后按提示选择 provider 并认证
```

支持 **Claude / OpenAI / Codex / Copilot / Gemini** 及任何兼容端点。

### 3. 将 AION 添加到你的项目

```bash
# 方式一：clone 到项目根目录
cd your-project
git clone https://github.com/ztxtech/aion.git .opencode

# 方式二：下载并解压
curl -fsSL https://github.com/ztxtech/aion/archive/refs/heads/main.tar.gz | tar xz --strip-components=1
mv aion-main/.opencode .opencode
rm -rf aion-main
```

### 4. 运行

```bash
# 交互式 TUI 模式
opencode

# 非交互式 run 模式
opencode run --agent agent "你的任务描述"

# 指定模型
opencode run --agent agent -m anthropic/claude-sonnet-4 "分析这个时间序列数据集"
```

### `run` / `tui` 与执行策略的关系

OpenCode 的 `run` 和 `tui` 描述的是界面形态，不等于 agent 是否应该频繁向用户提问。

- `run`
  这是非交互执行界面。对本模板而言，`run` 默认搭配 `autonomous`：agent 应先做本地探测，自己选择默认最优路径，并持续推进，而不是停下来询问常规环境或流程选择。
- `tui`
  这是交互式终端界面。对本模板而言，`tui` 可以搭配 `autonomous`，也可以在用户明确希望参与关键分叉时搭配 `interactive`。
- `tui + autonomous`
  用户在场、可以观察会话，但 agent 对常规默认动作仍应自己决策。处于 TUI 中，不代表 agent 应该把低风险默认项都抛回给用户。
- `tui + interactive`
  只在用户明确希望共同决策关键分叉时使用。即便如此，agent 也必须先做本地探测，只有在多个同样合理且会实质影响后续路径的候选方案仍然并存时，才向用户发起简洁确认。
- `run + interactive`
  本模板不把它视为默认支持组合。`run` 的目标是连续自动执行；如果流程需要在关键节点停下来等待用户选择，`tui` 更合适。

对 Python 环境，本模板的默认决策树是：

- 先判断任务是否真的需要 Python
- 若工作区根目录已存在 `.venv`，优先复用
- 否则服从更强的项目环境约束，例如 `pyproject.toml`、`.python-version`、`environment.yml`、`requirements*.txt`、`uv.lock`
- 若仍无更强约束，再创建工作区根目录 `.venv`

在 `autonomous` 下，只要这条决策树没有出现真实冲突，就直接按默认优先级执行，不先问用户解释器偏好。在 `interactive` 下，也必须先做同样的本地探测；只有当探测后仍存在多个同样合理、且会显著影响依赖或实现路径的候选环境时，才向用户发起一次简洁确认。

### 5. CLI 运行模式（进阶）

使用 `cli.sh` 进行自动化、自动续跑的实验运行：

```bash
# 基本运行
bash cli.sh

# 指定模型
bash cli.sh -m anthropic/claude-sonnet-4

# 开启 debug 日志
bash cli.sh --debug

# TUI 模式
bash cli.sh --mode tui

# 限制自动续跑轮数
bash cli.sh --max-continues 10
```

### 自动 / 交互场景下怎么写 Prompt

`cli.sh` 已经内置了以 `context-init` 开头的默认 prompt — 这是 harness 引导入口。运行 `bash cli.sh` 即可自动完成完整的 harness 初始化。

如果你不想直接使用 `cli.sh` 默认 prompt，而是自己写提示词，建议**同时包含 `context-init` 入口**并把期望的执行策略明确写出来，避免 agent 自己猜。

- 对非交互、自动执行，包含 `context-init` 并注明模式：

```text
请以 context-init 技能启动项目。先读取根目录任务文件和 .opencode 合约。请按 run + autonomous 模式执行：保持 human-free，优先做本地探测，不要为了常规环境或流程选择先问我；只有当确实缺少只有我才知道的信息时才停下来。
```

- 对交互式 TUI 协作，明确说明你只想参与真实分叉：

```text
请以 context-init 技能启动项目。请按 tui + interactive 模式执行：先做本地探测，常规默认动作仍由你自己决定；只有当存在多个同样合理且会实质影响后续路径的候选方案时，再向我发起简洁确认。
```

- 如果你想在 TUI 里看过程，但不希望它频繁问你，也可以直接写：

```text
请以 context-init 技能启动项目。请按 tui + autonomous 模式执行：我希望观察过程，但不希望你为了常规环境或流程选择频繁打断我；只有真实分叉才需要提醒。
```

对 Python 环境，一个更好的交互式提示词写法是要求 agent 先探测、后上交分叉，例如：

```text
如果任务需要 Python，请先检查工作区是否已有可用 .venv 或更强项目约束。只有当仍存在多个同样合理、且会显著影响依赖或实现路径的环境选择时，再来问我。
```

---

## 📦 示例

[`example/`](example/) 目录包含可直接运行的工作空间，用于在具体时序任务上演示 AION 的端到端能力。

> **⚠️ 临床免责声明 — `example/aion-medical-demo/` 仅为演示案例。** [`example/aion-medical-demo/`](example/aion-medical-demo/) 是 AION 在医疗风格问题上的一次自包含演示，外层 wrapper 仅为录制 AION 演示视频而存在。心电图数据虽来自真实的 PhysioNet PTB 数据库，但样本量极小（仅 3 名患者）；ICU 生命体征数据为合成数据。Agent 生成的模型、指标和报告仅供演示 —— **未经验证，不可用于任何临床决策**。详见 [`example/aion-medical-demo/README.md`](example/aion-medical-demo/README.md) 完整免责声明与录制说明。

### 医疗时序案例 — 心电图诊断与 ICU 败血症预测（演示）

[`example/aion-medical-demo/`](example/aion-medical-demo/) 在临床案例外层包裹了录制专用脚手架。目标是让 AION 的全部特性在一次运行中触发，专为 YouTube 视频 *"AION: A Time-Series AI Harness (Full Clinical Demo)"* 录制。

```bash
cd example/aion-medical-demo/medical
opencode
> introduce yourself by completing this task, AION
```

详见 [`example/aion-medical-demo/README.md`](example/aion-medical-demo/README.md) 获取 wrapper 用途、22 特性触发地图，以及"真实 AION 项目并不需要触发全部特性"的设计说明。

### 本地 Kaggle 风格预测竞赛

[`example/kaggle/`](example/kaggle/) 是 Kaggle **Store Sales - Time Series Forecasting** 比赛（Corporación Favorita）的本地复刻版本，为离线快速迭代而改造。轻量级的本地评估服务器模拟 Kaggle 的提交和评分 API —— agent 通过相同的 HTTP 接口下载数据、训练模型并提交预测，但可获得即时反馈且没有每日提交上限。详见 [`example/kaggle/README.md`](example/kaggle/README.md)。

---

## 🤝 Agent 角色

Agent 横跨全部四层 — 从任务解析到执行编排再到分层审查：

| Agent                     | 主要层级            | 职责                                                                  |
| ------------------------- | ------------------- | --------------------------------------------------------------------- |
| **agent**                 | 执行层              | 主控 — 调度子 agent、执行审查门禁、驱动收口                           |
| **requirements-analyst**  | 任务层              | 读取任务与工作区材料，抽取目标、输入与约束                            |
| **information-collector** | 工作空间层          | 补齐 SOTA、顶会顶刊、官方实现与领域知识                               |
| **coder**                 | 工作空间层 + 执行层 | 实现、实验、交付与可视化                                              |
| **ts-critic**             | 审查层              | 时间序列方法审查 + Pareto 继续/停止治理 — `c-critic` 之前的最高治理门 |
| **c-critic**              | 审查层              | 最终最小上下文冷启动批判 — 系统最高治理权                             |

### 治理顺序

在 blocker 判定、rebuttal 结论、路线回退、stop-go、completion-gate 与最终交付判定上：

```
c-critic > ts-critic > 主 agent > 其他子 agent
```

主 agent 负责**调度与执行组织**，但**不**拥有高于 critic 的关门权。

进一步地，这里的角色边界默认采用“能力互斥优先委派”而不是“主 agent 全都自己做一遍”：系统性需求重构优先交给 `requirements-analyst`，系统性外部检索与证据链建设优先交给 `information-collector`，真实代码 / 脚本 / 实验实现优先交给 `coder`，治理性批判与 stop-go 优先交给 `ts-critic` / `c-critic`。主 agent 只保留最小必要的路由级核对、集成性修改和无法安全拆分的极小动作。

---

## 🔧 技能清单（17 个）

技能服务于工作空间层和执行层 — 提供证据收集、工具编排和领域先验：

| 技能                  | 层级       | 描述                                             |
| --------------------- | ---------- | ------------------------------------------------ |
| **context-init**      | 工作空间层 | 手动工作区引导和任务启动                         |
| **workspace-init**    | 工作空间层 | 自动工作区初始化与记忆种子                       |
| **plan**              | 执行层     | 带分支管理的复杂任务计划                         |
| **brain-storm**       | 工作空间层 | 多角度分析与 branch ID                           |
| **deep-reasoning**    | 执行层     | 带依赖链的多步推理                               |
| **critic-loop**       | 审查层     | 审查与回退判断                                   |
| **time-series**       | 工作空间层 | 时间序列统一审查框架                             |
| **data-interface**    | 任务层     | 四类数据入口契约（文件 / 数据库 / Loader / API） |
| **forecast-contract** | 审查层     | 预测输出可控性与有效性检查                       |
| **report-writing**    | 工作空间层 | 实验报告与正式文档输出                           |
| **python-toolbox**    | 工作空间层 | Python 工具选型先验                              |
| **ztxexp**            | 工作空间层 | 实验目录结构与出图协议                           |
| **github-search**     | 工作空间层 | GitHub 一手工程证据检索                          |
| **pdf-intake**        | 工作空间层 | 安全 PDF 与扫描件提取                            |
| **safety-gate**       | 审查层     | 自动化安全预检                                   |
| **evolution**         | 执行层     | 能力缺口检测 → 新 agent/skill 创建               |
| **template**          | 工作空间层 | 空 skill 骨架                                    |

---

## 📋 协议清单（8 个）

协议约束执行层 — 管理 agent 如何通信、升级和压缩上下文：

| 协议               | 用途                                                                         |
| ------------------ | ---------------------------------------------------------------------------- |
| **dispatch**       | 子 agent 派单，支持 `full_context` / `compacted_context` / `minimal_context` |
| **reportback**     | 结构化回传，含自我批判                                                       |
| **rebuttal**       | 路线挑战协议                                                                 |
| **stop-go**        | 停止/继续治理，含 critic 冲突解决                                            |
| **lifecycle**      | Agent 生命周期管理                                                           |
| **memory-sync**    | 跨 agent 记忆同步                                                            |
| **runtime-events** | 运行时事件追踪与 trace 更新                                                  |
| **compaction**     | 长期多 agent 会话的上下文压缩                                                |

---

## 🧠 记忆与 Trace

AION 在工作空间层维护两套互补的追踪系统：

- **`.opencode/trace.md`** — 单次任务执行 trace：关键决策、失败复盘和交付检查点
- **`.opencode/memory/`** — 跨任务持久记忆：正面/负面发现、agent 关系、决策、特征
- **`.opencode/memory/context-snapshot.md`** — 规范化压缩 artifact，由 `initial-prompt`、`progress`、`decisions`、`todo-map` 和活跃 blocker 提炼而成
- **本地 git** — 宿主项目根目录的细节级检查点历史（自动初始化，从不推送）

记忆和 git 各有分工：记忆负责抽象经验和判断，git 负责细节级变更历史和关键节点回放。

---

## 📡 CLI 参考

`cli.sh` 提供了一个 CLI 入口，用于自动化 run-mode 执行与自动续跑：

```bash
bash cli.sh [OPTIONS]
```

### 选项

| 参数                  | 默认值       | 描述                                            |
| --------------------- | ------------ | ----------------------------------------------- |
| `--mode MODE`         | `run`        | 启动模式：`run` 或 `tui`                        |
| `-m, --model MODEL`   | （来自配置） | OpenCode 模型（如 `anthropic/claude-sonnet-4`） |
| `--max-continues N`   | `30`         | 最大自动续跑轮数；`0` 表示不限                  |
| `--continue-delay S`  | `2`          | 每次自动续跑间隔（秒）                          |
| `--bash-timeout-ms N` | `1200000`    | OpenCode bash 默认超时（毫秒）                  |
| `--no-auto-continue`  | （关闭）     | 禁用自动续跑                                    |
| `--debug`             | （关闭）     | 开启详细 debug 日志                             |
| `--export`            | （关闭）     | 运行结束后导出 session JSON                     |
| `-h, --help`          | —            | 显示帮助                                        |

### 示例

```bash
# 基本自主运行
bash cli.sh

# 指定模型与限制轮数
bash cli.sh -m openai/gpt-4.1 --max-continues 5

# Debug 模式并导出 session
bash cli.sh --debug --export

# 交互式 TUI
bash cli.sh --mode tui --no-auto-continue
```

---

## 🛡️ 核心约束

Harness 在全部四层强制执行硬性边界：

- **禁止知识/数据泄露** — 未来信息、标签、隐藏集内容和私有数据绝不能泄露到特征、代码、日志或输出中
- **彻底的怀疑主义** — 单次成功或指标提升不是可靠的证据；必须主动排查泄露、伪相关、过拟合和未验证假设
- **治理层级** — 所有治理决策中 `c-critic > ts-critic > 主 agent > 其他`；主 agent 不能覆盖 critic blocker
- **能力互斥优先委派** — 只要现有角色已覆盖某类工作，主 agent 默认就应委派而不是自己亲做；若暂不并行或暂不委派，必须有明确且范围很小的理由
- **Benchmark-first** — 有排行榜或竞赛的任务必须维护并行分支：自主探索 + 高分方案逆向吸收
- **仅 Mermaid 图表** — 所有结构图必须使用 Mermaid；正式输出中禁止 ASCII/纯文字示意图
- **工作区清理** — 最终交付前必须清理空目录、临时文件和调试残留

---

## 🌍 生态

AION 是时间序列 harness 研究生态的一部分：

- 基于 [OpenCode](https://github.com/anomalyco/opencode) — 开源 AI 编码 agent

---

## 📝 引用

如果你在研究中使用 AION，请引用：

```bibtex
@misc{zhan2026aion,
      title={AION: Next-Generation Tasks and Practical Harness for Time Series},
      author={Tianxiang Zhan and Xiaobao Song and Tong Guan and Shirui Pan and Ming Jin},
      year={2026},
      eprint={2605.25045},
      archivePrefix={arXiv},
      url={https://arxiv.org/abs/2605.25045},
}
```

---

## 🤝 参与贡献

AION 是社区驱动的研究项目。我们欢迎以下方面的贡献：

| 领域      | 示例                                       |
| --------- | ------------------------------------------ |
| **Agent** | 新的专门化 agent 角色                      |
| **技能**  | 领域知识 `.md` 文件（金融、气候、医疗...） |
| **协议**  | 新的协调或治理模式                         |
| **规则**  | 领域特定约束集                             |
| **评测**  | Suite 定义、grader、scorecard              |
| **模板**  | 记忆模板、工作区脚手架                     |

---

## 📄 许可证

MIT — 详见 [LICENSE](LICENSE)。

---

<p align="center">
  <strong>AION</strong><br>
  <em>Next Generation Tasks and Practical Harness for Time Series</em>
</p>

<div align="center">
  <a href="https://star-history.com/#ztxtech/aion&Date">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/svg?repos=ztxtech/aion&type=Date&theme=dark" />
      <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/svg?repos=ztxtech/aion&type=Date" />
      <img alt="Star History Chart" src="https://api.star-history.com/svg?repos=ztxtech/aion&type=Date" style="border-radius: 15px; box-shadow: 0 0 30px rgba(124, 58, 237, 0.3);" />
    </picture>
  </a>
</div>

<p align="center">
  <em>感谢访问 AION!</em><br>
  <img src="https://visitor-badge.laobi.icu/badge?page_id=ztxtech.aion&style=for-the-badge&color=7C3AED" alt="Views">
</p>
