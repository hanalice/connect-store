# MAF 子代理挂起排障手册

> 版本：v1.0（2026-10-25）
> 适用范围：本仓库 maf 工作流（Kimi Code CLI 子代理：coder / QA / PM）的"长时间无活动"排障。
> 事故来源：2026-10-24 G2.3 循环（coder 挂起 1 次、QA 挂起 2 次，均恢复成功、零状态丢失）。

---

## 1. 现象定义

子代理（Agent 工具派出的 coder / QA / PM）长时间没有任何动静：

- 工作区无新写入（`find src server e2e -mmin -10` 为空）；
- 无测试 / 构建进程（`ps aux | grep -E 'vitest|playwright|vite'` 为空）;
- 任务状态仍显示 running，且无中间输出。

"长时间"参考阈值：**>15 分钟**无文件 + 无进程活动即可按本手册介入，不必等到 1 小时。

## 2. 五分钟定位流程

按序执行，逐步排除三种根因（特征对照见 §3）：

```bash
# ① 系统层：是否整机冻结过（WSL2 宿主睡眠）
date                                  # 当前时间
uptime                                # up 时长
last -x | head                        # 重启/睡眠记录
journalctl --list-boots 2>/dev/null   # 启动时间线

# ② 应用层：子代理是否真的没写文件
find src server e2e docs -type f -mmin -15 2>/dev/null

# ③ 进程层：有没有在跑测试/服务
ps aux | grep -E 'vitest|playwright|vite|tsx' | grep -v grep
```

若 ②③ 均空而系统 `uptime` 明显小于"journal 启动时间至今"——**整机被冻结过**（根因 A）。

若 ②③ 均空且系统一直醒着——用 wire 日志区分根因 B / C（§4）。

## 3. 三种根因特征对照

|               | A. WSL2 宿主睡眠                      | B. API 请求卡死                                                                 | C. API 不稳定窗口                                                            |
| ------------- | ------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 本质          | Windows 睡眠 → 整个 VM 冻结，时间静止 | 单次 LLM 请求流静默，客户端干等                                                 | 连接被反复拒绝，指数退避重试                                                 |
| 影响范围      | 整机所有进程（含主会话）              | 只有等该请求的 agent                                                            | 单个 agent，但会持续刷重试                                                   |
| 典型时长      | 数小时（过夜）                        | 19~55 分钟，偶发 5 小时级 outlier                                               | 数分钟~数十分钟                                                              |
| wire 日志签名 | 所有 agent 同时静默                   | 缺口前事件 = `llm.request`，缺口后 = `turn.step.retrying`（error=`terminated`） | 连续多条 `turn.step.retrying`（error=`Connection error.`），delayMs 指数增长 |
| 恢复方式      | 唤醒 Windows 自动继续                 | 报错→重试自愈；或手动 stop+resume 加速                                          | 自愈（backoff 上限后放弃该步）                                               |
| 能否预防      | Windows 电源设置                      | 降思考档 / 缩短单请求静默期                                                     | 不可控，取决于上游                                                           |

**注意**：A 与 B/C 外表完全相同（都是"没动静"），必须靠 §2 的系统层检查 + wire 日志区分。白天也会发生 B（G2.3 的 11:03→16:06 五小时卡死发生在系统正常运行时段），不要因为"现在是白天"就排除。

## 4. wire 日志分析

子代理事件日志位置（agent-N 的 N 按派单顺序从 0 递增，跨会话复用，须先确认会话）：

```bash
ls -lt ~/.kimi-code/sessions/wd_connect-store_*/session_*/agents/agent-*/wire.jsonl
# 取 mtime 最新且属于当前会话（看首行时间）的那个
```

缺口分析脚本（输出每个 >5 分钟的时间缺口及其前后事件）：

```bash
cd ~/.kimi-code/sessions/wd_connect-store_*/session_*/agents && python3 - << 'EOF'
import json, datetime
def ts(ms): return datetime.datetime.fromtimestamp(ms/1000).strftime('%m-%d %H:%M:%S')
for agent in ['agent-0','agent-1','agent-2','agent-3']:
    events=[]
    for line in open(f'{agent}/wire.jsonl'):
        try: e=json.loads(line)
        except: continue
        t=e.get('time') or e.get('created_at')
        if t: events.append((t, e.get('type'), e))
    if not events: continue
    print(f'== {agent} 首 {ts(events[0][0])} 末 {ts(events[-1][0])} ==')
    prev=events[0]
    for cur in events[1:]:
        gap=(cur[0]-prev[0])/1000
        if gap>300:
            print(f'  缺口 {gap/60:.1f}min  前:{prev[1]}  后:{cur[1]}')
        prev=cur
EOF
```

关键事件语义：

- `llm.request` = 一次模型请求发出（缺口从此开始 = 请求卡死）；
- `turn.step.retrying` = 运行时放弃该次请求并自动重试（`errorMessage` 区分 `terminated` / `Connection error.`）；
- `usage.record` = 请求正常完成；
- `context.append_loop_event` / `context.append_message` = 循环继续 / 收到新消息（缺口从此结束）。

参考基线（G2.3 实测）：正常请求 p50≈6s、p90≈0.2~1.3min；卡死请求 19/27/30/35/42/55min 与 303min。全部为 `kimi-for-coding` + `thinking_effort=max`（该模型 `always_thinking` + 默认 max 档，流式响应静默期长，卡死暴露面最大）。

## 5. 恢复 SOP（已验证 3/3，零状态损失）

maf 的设计前提：**文件即现场**。现场 = `maf_manifest.json`（到哪了）+ `docs/reports/Gx.y.md`（结论）+ git log（交付物）。任何会话死了都能由新会话接管，不依赖任何会话记忆。

1. **杀**：`TaskStop` 卡死的子代理（reason 注明疑似挂起）。
2. **清**：检查并清理孤儿进程（dev server / Playwright webServer 占用端口会坑后续 E2E）：
   `ps aux | grep -E 'vite|tsx|playwright'`，`kill` 之，`ss -tlnp` 确认端口释放。
3. **续**：`Agent(resume="<agent_id>")` 恢复同一子代理（会话历史保留，省上下文）。恢复 prompt 要点：
   - 告知"上轮疑似挂起被中断，历史仍在"；
   - 给出编排器核实的事实（工作区现状、基线数字）；
   - 明确要求**不重跑已完成项**、先盘点缺口；
   - 对耗时项限时（如 live 冒烟最多 1~2 次）。
4. **验**：恢复交付后跑廉价门禁：`git log --oneline` 有提交 + `npm test` 绿，再进下一步（QA/PM）。

若 resume 两次仍失败：派新子代理从文件现场重建（读工单 + git log + manifest），上下文损失可接受。

## 6. 预防清单

| 措施                   | 说明                                                                                                                                                              | 代价         |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 前台派单优先           | 需要结果才能往下走的子代理用前台（完成即返回、可及时干预）；后台只用于真有并行活                                                                                  | 无           |
| 15 分钟心检            | 子代理 >15min 无文件+无进程活动即 stop+resume，别等 1 小时                                                                                                        | 极低         |
| 降思考档               | 施工/验收类长任务把 effort 从 max 降 high（config.toml `default_effort` 或换 k3 系别名），缩短请求静默期                                                          | 推理深度略降 |
| 限时重试               | live 冒烟 / 真 BFF 走查等耗时项，子代理 prompt 里写明上限（1~2 次）                                                                                               | 无           |
| 不过夜挂机             | WSL2 随 Windows 睡眠冻结一切；长任务在白天连续推进（maf 触发模型本就如此）。必须过夜：Windows 电源设"从不睡眠"（`powercfg /change standby-timeout-ac 0`）+ 不合盖 | 电费         |
| 退出应用前处理后台任务 | 退出 CLI 后后台子代理失联，只能杀                                                                                                                                 | 无           |

## 7. 附录：2026-10-24 G2.3 事故数据

| agent   | 角色         | 静默缺口（min）        | 根因                                 |
| ------- | ------------ | ---------------------- | ------------------------------------ |
| agent-0 | coder        | 35 / **303** / 35 / 27 | B（白天 5h outlier + 三次 30min 级） |
| agent-1 | QA           | 19 / 30                | B + C（18:03~18:35 退避风暴）        |
| agent-1 | QA（resume） | 104                    | B                                    |
| agent-2 | QA（窄口径） | 55 / 485               | B + A（00:28→08:33 = 宿主睡眠）      |
| agent-3 | PM           | 无                     | —                                    |

处置记录：3 次 stop+resume 全部成功；G2.3 最终 60 单测绿、E2E 三连跑 12/12/12、QA/PM 一次通过。
同类事件前科：2026-10-23 旧会话 agent-3 曾有 58.7min 同签名缺口——**此问题与本仓库无关，是运行时/上游层行为，任何项目都会遇到**。
