<h1 align="center">
  <img src="https://img.shields.io/badge/AION-时间序列_Harness-7C3AED?style=for-the-badge&logo=openai&logoColor=white" alt="AION" />
</h1>

<p align="center">
  <a href="README.md"><strong>English</strong></a> ·
  <a href="README.zh-CN.md"><strong>简体中文</strong></a>
</p>

## 📰 News

- **2026-06-14** — **v0.5.0**：Hugging Face 数据集集成（4 个新工具 + CLI 子命令）、消融实验/SHAP 硬性门禁、需求分析硬件探查、information-collector 查询重写技巧。
- **2026-06-14** — AION 已重构为**编译型 TypeScript 插件**。一行命令安装，无需手动克隆。
- **2026-06-13** — Plugin 版本开发启动于 [`dev`](https://github.com/ztxtech/aion/tree/dev) 分支。

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
  <img src="https://img.shields.io/badge/工具-34个-06B6D4?style=flat" alt="Tools">
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

### 项目结构（Plugin 版本）

AION 是一个编译型 TypeScript 插件。仓库包含源代码；构建后产生自包含的 bundle，安装到每个项目的 `.opencode/plugins/` 目录。

**仓库布局：**

```
aion/
├── src/                        # TypeScript 插件源码
│   ├── index.ts                # 插件入口（默认导出）
│   ├── plugin-interface.ts     # 组装 PluginInstance 返回给 OpenCode
│   ├── create-managers.ts      # 中心状态：治理、trace、阶段机
│   ├── create-tools.ts         # 聚合所有 AION 工具
│   ├── create-hooks.ts         # 聚合所有 OpenCode 钩子
│   ├── workspace-bootstrap.ts  # 磁盘工作区初始化
│   ├── agents/                 # 6 个 agent 工厂
│   │   ├── aion.ts             #   主控 agent（primary 模式）
│   │   ├── requirements-analyst.ts
│   │   ├── information-collector.ts
│   │   ├── coder.ts            #   实现主力
│   │   ├── ts-critic.ts        #   时间序列 + Pareto 治理
│   │   └── c-critic.ts         #   最终门禁冷启动 critic
│   ├── config/                 # Zod schema + 配置加载
│   ├── hooks/                  # 11 个 OpenCode 生命周期钩子
│   ├── tools/                  # 15 个 AION 工具（critic, memory, safety...）
│   ├── team/                   # 团队模式协调（mailbox, tasks, tmux）
│   ├── prompts/                # 治理常量 + agent prompt 加载
│   └── shared/                 # 日志、JSONC 解析、工具函数、个性系统
├── bin/
│   └── aion-init.js            # CLI 安装器（aion-ts init）
├── scripts/
│   ├── build.sh                # 构建 + 打包发布 tarball
│   └── install.sh              # curl 管道 bash 系统安装器
├── .opencode/
│   ├── skills/                 # 17 个技能定义（markdown）
│   └── themes/aion.json        # AION TUI 主题
├── docs/                       # 文档网站
├── example/                    # 可直接运行的示例
├── package.json
└── tsconfig.json
```

**在你的项目中执行 `aion-ts init` 后：**

```
your-project/
├── .opencode/
│   ├── plugins/
│   │   └── aion.js             # 自包含插件 bundle（OpenCode 自动发现）
│   ├── themes/
│   │   └── aion.json           # AION 主题
│   ├── aion.jsonc              # AION 配置（所有功能默认开启）
│   └── memory/                 # 运行时创建（progress, decisions 等）
└── opencode.json               # OpenCode 配置（theme、agents）
```

OpenCode 启动时自动发现 `.opencode/plugins/` 中的插件 — **不修改任何全局配置**。

---

## 🚀 快速开始

### 0. 环境前提

| 命令     | 用途                        | 备注           |
| -------- | --------------------------- | -------------- |
| `node`   | 运行 `aion-ts` CLI          | 建议 ≥ 18      |
| `curl`   | 下载安装器                  | 通常已预装     |
| `git`    | 本地 checkpoint 历史        | 通常已预装     |
| `python3`| Python 工具链、校验器       | 建议 ≥ 3.10    |

### 1. 安装 OpenCode

```bash
# 一键安装
curl -fsSL https://opencode.ai/install | bash

# 包管理器安装
npm i -g opencode-ai@latest        # 或 bun/pnpm/yarn
brew install anomalyco/tap/opencode # macOS 和 Linux（推荐）
```

### 2. 配置 OpenCode

```bash
opencode    # 启动 TUI，然后按提示选择 provider 并认证
```

支持 **Claude / OpenAI / Codex / Copilot / Gemini** 及任何兼容端点。

### 3. 安装 AION CLI

```bash
curl -fsSL https://raw.githubusercontent.com/ztxtech/aion/dev/scripts/install.sh | bash
```

这会把 `aion-ts` CLI 安装到 `~/.local/bin`。如果该目录不在你的 `PATH` 中，添加它：

```bash
export PATH="$HOME/.local/bin:$PATH"   # 添加到 ~/.bashrc 或 ~/.zshrc
```

> **测试期间（还没有 GitHub Release）：** 本地构建后从 tarball 安装：
> ```bash
> git clone -b dev https://github.com/ztxtech/aion.git && cd aion
> bash scripts/build.sh
> bash scripts/install.sh --local release/aion-plugin-0.1.0.tar.gz
> ```

### 4. 将 AION 添加到你的项目

```bash
cd your-project
aion-ts init .
```

这会把插件 bundle 放到 `.opencode/plugins/aion.js`，创建初始 `aion.jsonc` 配置，并复制主题。插件完全自包含 — 你的项目中**不需要 `npm install`**。

### 5. 运行

```bash
# 交互式 TUI 模式 — 在 TUI 里选你的模型
opencode

# 非交互式 run 模式
opencode run --agent aion "你的任务描述"

# 指定模型
opencode run --agent aion -m provider/model "分析这个时间序列数据集"
```

### `run` / `tui` 与执行策略的关系

OpenCode 的 `run` 和 `tui` 描述的是界面形态，不等于 agent 是否应该频繁向用户提问。

- **`run` + autonomous**（默认）— agent 先做本地探测，自己选择最优路径，持续推进，不停下来询问常规选择。
- **`tui` + autonomous** — 用户在场、可以观察，但 agent 对常规默认动作仍自己决策。
- **`tui` + interactive** — 用户明确希望参与关键分叉。agent 仍先做本地探测，只有多个同样合理的方案并存时才发起确认。
- **`run` + interactive** — 非默认支持组合。如果需要在关键节点停下来等用户选择，用 `tui` 更合适。

会话开始时，AION 会通过 OpenCode 内置弹窗询问你选择 **交互模式** 还是 **自主模式**。你也可以在对话中随时说"我要走了"（→ 自主模式）或"切换到交互模式"来切换。

---

## 📦 示例

[`example/`](example/) 目录包含可直接运行的工作空间，用于在具体时序任务上演示 AION 的端到端能力。

> **⚠️ 临床免责声明 — `example/aion-medical-demo/` 仅为演示案例。** 心电图数据虽来自真实的 PhysioNet PTB 数据库，但样本量极小（仅 3 名患者）；ICU 生命体征数据为合成数据。Agent 生成的模型、指标和报告仅供演示 —— **未经验证，不可用于任何临床决策**。详见 [`example/aion-medical-demo/README.md`](example/aion-medical-demo/README.md) 完整免责声明。

### 医疗时序案例 — 心电图诊断与 ICU 败血症预测（演示）

[`example/aion-medical-demo/`](example/aion-medical-demo/) 在临床案例外层包裹了录制专用脚手架。目标是让 AION 的全部特性在一次运行中触发。

```bash
cd example/aion-medical-demo/medical
aion-ts init .
opencode
> introduce yourself by completing this task, AION
```

### 本地 Kaggle 风格预测竞赛

[`example/kaggle/`](example/kaggle/) 是 Kaggle **Store Sales - Time Series Forecasting** 比赛的本地复刻版本。轻量级的本地评估服务器模拟 Kaggle 的提交和评分 API。详见 [`example/kaggle/README.md`](example/kaggle/README.md)。

---

## 🤝 Agent 角色

Agent 横跨全部四层 — 从任务解析到执行编排再到分层审查：

| Agent                     | 主要层级            | 职责                                                                  |
| ------------------------- | ------------------- | --------------------------------------------------------------------- |
| **aion**                  | 执行层              | 主控 — 调度子 agent、执行审查门禁、驱动收口                           |
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

## 🛠️ 工具清单（20 AION + 14 Team = 34）

AION 工具是 Agent 调用的可编程原语。全部返回 JSON 字符串，并自动写入 trace。Team 工具仅在 `teamMode.enabled = true` 时注册。

| 类别 | 工具 | 用途 |
| --- | --- | --- |
| **实验** | `aion_ztxexp_init`、`aion_ztxexp_validate`、`aion_ztxexp_run` | 7 目录硬边界的可复现消融实验框架 |
| **治理** | `aion_critic_dispatch`、`aion_critic_verdict`、`aion_record_blocker`、`aion_resolve_blocker`、`aion_pre_stop_gate` | 停止门禁、blocker 台账、c-critic 至高权 |
| **记忆** | `aion_memory_sync`、`aion_workspace_init`、`aion_compaction` | Agent 间共享缓存、快照刷新 |
| **安全** | `aion_safety_gate`、`aion_leakage_check` | 动作前安全检查、泄漏检测（hidden-set、未来信息、凭证） |
| **计划** | `aion_todo_update` | Plan-step ↔ OpenCode TODO 映射 + 停止影响分析 |
| **会话** | `aion_set_interactive_mode`、`aion_set_language` | 用户模式切换（由 session-start 问题驱动） |
| **Hugging Face** | `aion_hf_search`、`aion_hf_info`、`aion_hf_ingest`、`aion_hf_suggest` | 零依赖 HF Hub REST 集成，24h 缓存在 `.opencode/hf-cache/` |
| **Team** | `team_create`、`team_delete`、`team_send_message`、`team_status`、`team_list`、`team_task_*`、`team_inbox*`、`team_shutdown_*` | 多 Agent 并行协作（lead + members） |

### 消融实验与统计严格性（硬性门禁）

`rules.ts` 中有两条不可绕过的规则：

1. **消融实验是"最佳方法"的唯一裁判** —— 任何"X 是最佳"的声明必须由 `ztxexp` 内的 config 级消融矩阵支持（≥3 seed、单因子切换）。c-critic 会拒绝基于轶事/单 seed/排行榜截图的声明。
2. **超越 p-value：补充分析电池** —— 显著性 + bootstrap CI 之后，还必须运行 SHAP（或等价的特征归因方法）、残差结构诊断、漂移分析、敏感性分析。任何一项缺失都是 ts-critic 的 blocker。

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

### `aion-ts` — 插件安装器

用于将 AION 安装到项目的主要 CLI：

```bash
aion-ts init [target-dir] [--force]
```

| 参数              | 默认值     | 描述                                                       |
| ----------------- | ---------- | ---------------------------------------------------------- |
| `target-dir`      | `.` (cwd)  | 安装目标目录。不存在时自动创建。                           |
| `--force`, `-f`   | （关闭）   | 覆盖已存在的 `.opencode/plugins/aion.js`。                 |
| `--help`, `-h`    | —          | 显示帮助。                                                 |

`init` 做的事情：
1. 把插件 bundle 复制到 `<target>/.opencode/plugins/aion.js`（OpenCode 自动发现）。
2. 如果 `<target>/opencode.json` 不存在，创建一个最小启动文件（含 `$schema` 和 theme）。
3. 把带注释的默认配置复制到 `<target>/.opencode/aion.jsonc`。
4. 把 AION 主题复制到 `<target>/.opencode/themes/aion.json`。

模型不在 `init` 里设置 — 你在 OpenCode TUI 运行时选择。

`<target>` 之外的任何东西都不会被触碰。

### `aion-ts datasets` — Hugging Face 数据集 CLI

`aion_hf_*` 工具的 CLI 镜像。无需启动 OpenCode 即可准备数据集。所有命令支持 `--no-cache` 旁路 24h HF 缓存（`.opencode/hf-cache/`）。

```bash
aion-ts datasets search "ECG arrhythmia" --limit 10 --modality timeseries
aion-ts datasets info Salesforce/lotsa_data
aion-ts datasets ingest Salesforce/lotsa_data --workspace . --split train
aion-ts datasets suggest --goal "ECG 异常检测" --keywords "ecg,arrhythmia" --top-k 5
```

| 动作      | 必需参数                                   | 输出 |
| --------- | ------------------------------------------ | ---- |
| `search`  | `<query>`                                  | JSON: `{ query, count, results[] }` |
| `info`    | `<owner/name>`                             | JSON: 完整 dataset card + siblings + splits |
| `ingest`  | `<owner/name>` `[--workspace DIR]` `[--split S]` | 写入 `data/aion-dataset-manifest.json` + `data/<id>.loader.py` |
| `suggest` | `--goal "..."` `[--keywords k1,k2]` `[--modality M]` `[--top-k N]` | JSON: `{ goal, keywords, candidates[] }` 按分数排序 |

### `cli.sh` — OpenCode 启动器（旧版）

`cli.sh` 是 `opencode` 的便捷封装，用于自动化 run 模式执行与自动续跑。它是可选的 — 你可以直接使用 `opencode`。

```bash
bash cli.sh [OPTIONS]
```

| 参数                  | 默认值       | 描述                                            |
| --------------------- | ------------ | ----------------------------------------------- |
| `--mode MODE`         | `run`        | 启动模式：`run` 或 `tui`                        |
| `-m, --model MODEL`   | （来自 TUI）  | OpenCode 模型（格式 `provider/model`）             |
| `--max-continues N`   | `30`         | 最大自动续跑轮数；`0` 表示不限                  |
| `--no-auto-continue`  | （关闭）     | 禁用自动续跑                                    |
| `--debug`             | （关闭）     | 开启详细 debug 日志                             |
| `-h, --help`          | —            | 显示帮助                                        |

---

## 🗑️ 卸载

### 系统级（CLI + bundle）

```bash
curl -fsSL https://raw.githubusercontent.com/ztxtech/aion/dev/scripts/uninstall.sh | bash
```

移除 `~/.local/bin/aion-ts` 和 `~/.local/lib/aion/`。

### 项目级（同时从某个项目中移除）

```bash
# 系统 + 当前项目（删除前自动备份 AION 文件）
curl -fsSL https://raw.githubusercontent.com/ztxtech/aion/dev/scripts/uninstall.sh | bash -s -- --project .

# 仅项目（保留 CLI 不删）
curl -fsSL https://raw.githubusercontent.com/ztxtech/aion/dev/scripts/uninstall.sh | bash -s -- --project . --no-system
```

项目级卸载：
- **自动备份** 所有 AION 文件到 `.opencode/aion-backup-<时间戳>.tar.gz`
- **删除** `.opencode/plugins/aion.js`、`.opencode/themes/aion.json`、`.opencode/aion.jsonc`
- **清理** `opencode.json`（只移除 `theme: "aion"`，其他配置全部保留）
- **不触碰** `.opencode/memory/`、`.opencode/trace.md`、`.opencode/skills/` 等用户数据

预览效果（不实际删除）：
```bash
bash scripts/uninstall.sh --project . --no-system --dry-run
```

---

## 🔨 从源码构建

贡献者和本地测试：

```bash
git clone -b dev https://github.com/ztxtech/aion.git && cd aion
npm install

# 构建 + 打包发布 tarball
bash scripts/build.sh
# → release/aion-plugin-0.1.0.tar.gz

# 从本地 tarball 安装
bash scripts/install.sh --local release/aion-plugin-0.1.0.tar.gz
```

---

## 🛡️ 核心约束

Harness 在全部四层强制执行硬性边界：

- **禁止知识/数据泄露** — 未来信息、标签、隐藏集内容和私有数据绝不能泄露到特征、代码、日志或输出中
- **彻底的怀疑主义** — 单次成功或指标提升不是可靠的证据；必须主动排查泄露、伪相关、过拟合和未验证假设
- **治理层级** — 所有治理决策中 `c-critic > ts-critic > 主 agent > 其他`；主 agent 不能覆盖 critic blocker
- **能力互斥优先委派** — 只要现有角色已覆盖某类工作，主 agent 默认就应委派而不是自己亲做
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
| **工具**  | 新的 AION 工具（TypeScript）               |
| **钩子**  | 新的 OpenCode 生命周期钩子（TypeScript）   |
| **协议**  | 新的协调或治理模式                         |
| **评测**  | Suite 定义、grader、scorecard              |

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
