# Kimi 任务 Prompt 库

> 目的：把「计划（todo）」与「执行（kimi）」解耦。每个 todo item 对应一个可独立执行的 prompt 文件；**kimi 只执行、不改计划，验收权留在人手里。**

## 目录约定

- 一个 todo item 一个文件，文件名 = `todo_id`（如 `G1.1.md`）。
- `docs/ai-assistant-todo.md` 的 `Prompt` 列指向这里，两边可互查。
- 已完成的旧任务（G0.1–G0.4）不补写：历史证据已在 commit 与 `docs/*.md` 里，补写价值低。

## Prompt 模板

```markdown
---
todo_id: Gx.y
design_version: v0.4
depends_on: []
prompt_status: draft | ready | superseded
---

# 目标（一句话）

# 前置读取（只列路径，不复制设计内容）

# 现状（不要动的东西）

# 要做的事（编号，可勾选）

# 明确不做（越界即返工）

# 验收（硬指标 + 实测命令）

# 完成后输出格式
```

## 执行方式

```bash
# 单任务执行（推荐：内容注入，不依赖 agent 自己读文件）
kimi -p "$(cat docs/kimi-prompts/G1.2.md)"

# 留日志（事后核对用）
kimi -p "$(cat docs/kimi-prompts/G1.2.md)" 2>&1 | tee "/tmp/kimi-$(date +%F-%H%M)-G1.2.log"

# 需要机器可解析的输出
kimi -p "$(cat docs/kimi-prompts/G1.2.md)" --output-format stream-json
```

**`-p` 与 `-y` / `--auto` 互斥**（v2.2.0 实测报 `Cannot combine --prompt with --yolo`）：非交互模式自带执行策略，既不需要也不能叠加自动批准标志。实测 `-p` 模式下可正常创建/修改文件（沙箱验证：成功写入 `hello.txt`，16 字节）。

**失败续跑**：`-p` 结束时终端会打印 `kimi -r session_<id>`，可用它继续同一会话，不必从头重跑。

为什么用 `-p "$(cat ...)"` 而不是让 agent 自己读文件：读文件引入「只读前 N 行 / 跳读章节 / 忽略验收段」这类不可控风险；`-p` 把内容直接注入上下文，确定性最高（4 KB 级文件远低于 `ARG_MAX`）。

## 三条铁律

1. **只引用、不复制**：prompt 里只写「见 design §6.2」，不复制设计内容 —— 否则 design 升版后会留下错误指令（v0.3→v0.4 撤销语义检索就是实例）。`design_version` 字段用于事后扫出落后版本。
2. **kimi 不改 todo 状态**：它只输出验收结果；`todo` → `done` 由人核对后回写。让施工方自己签字验收，等于取消验收。
3. **执行前 git 必须干净**：`git status` 无改动再跑；跑完检查 `git log -1` 与三件套（`lint` / `format:check` / `test`）。

## frontmatter 字段

| 字段             | 含义                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `todo_id`        | 对应 `docs/ai-assistant-todo.md` 的任务编号                                                      |
| `design_version` | 编写该 prompt 时的 design 版本（落后即需复核）                                                   |
| `depends_on`     | 前置任务；未完成不应执行本 prompt                                                                |
| `prompt_status`  | `draft`（待补）/ `ready`（可执行）/ `superseded`（被新版本取代）。**任务完成状态以 todo 表为准** |

## 与其他文档的关系

| 文档                                          | 角色                                       |
| --------------------------------------------- | ------------------------------------------ |
| `docs/ai-assistant-design.md`                 | 设计**唯一事实源**（施工依据的最终解释权） |
| `docs/ai-assistant-todo.md`                   | 任务**唯一索引**（做什么、做到没做）       |
| `docs/kimi-prompts/*.md`                      | 任务的**执行体**（怎么让 agent 做）        |
| `.agents/rules/connect-store-ai-assistant.md` | 项目**硬约束**（每个 prompt 都要求先读）   |
