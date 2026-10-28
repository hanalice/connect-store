# GA 报告（connect-store AI 导购 · 项目收官）

> 日期：2026-10-28 ｜ 分支：`feat/ai-assistant`（全部 commit 未 push）｜
> 签核链：PM 子代理全程 15 个 G 签核（G2.3 → G5.2，含补票 G3.1a/G3.3b/G3.3c/H2 热修）｜
> 本报告输入：19 份阶段报告 §六签核节 + G5.2 sweep 终态（docs/reports/G5.2.md）

## 一、交付结论（先行）

**做完了，能交付。** connect-store 从存量目录平台升级为 AI 导购 Showcase：
**AI 是唯一购物车写者（single-writer cart）、HITL 审批收口全部资金动作
（SDK 原生 toolApproval + HMAC 签名 + TTL + 内存订单表）、状态机投影驱动 UI、
Generative UI 白名单渲染**——「浏览归人、交易归 AI、审批归人」，
对齐 agentic commerce 主流形态（N1 story，h6-spot-check.md）。

三个交付面齐态：产品面（对话→推荐→加购→下单→审批→订单号全链闭环）、
工程面（三层 249 测试全绿 + CI 全 step + pre-commit 四件套）、文档面
（design v0.5 final + README 5 分钟 story + A1~A19 资产登记 + 双门面数字同源）。

## 二、范围与账目

- **todo 全表 25 个 G 行全部签核 done 在案**（G5.2 于本日签核，⑨ 回写后终态）：
  G0.1–G0.4（开工实测）/ G1.1–G1.4（骨架）/ G2.1–G2.4（工具+状态机+Generative UI）/
  G3.1–G3.4 + 补票 G3.1a、G3.3b、G3.3c（购物车 / 审批 / 失败恢复）/
  G4.1–G4.4（测试矩阵 / README / design 终版 / 验收）/ G5.1–G5.2（single-writer 收口 /
  GA 前 sweep）。
- **MAF 四段循环**（PM 起草工单 → coder 施工 → QA 独立验收 → PM 签核）全程 15 个
  签核节在案（docs/reports/ 19 份 G 报告）；打回 3 次全部 1 轮收敛
  （G3.3c Q-D-01 / G5.2 D-1 / 早期 E2E-AI-09 环境项）。

## 三、质量终态（数字 = 249 终版口径）

| 层            | 终版                                   | 门禁            | 关键证据                                                                      |
| ------------- | -------------------------------------- | --------------- | ----------------------------------------------------------------------------- |
| 根 vitest     | **19 文件 / 144**                      | pre-commit + CI | G5.2 QA 亲跑 4.60s 全绿                                                       |
| server vitest | **11 文件 / 81**                       | pre-commit + CI | G5.2 QA 亲跑 692ms 全绿                                                       |
| E2E mock      | **24 条**（E2E-AI-01~25）              | CI + 本地三连跑 | G5.2 标准端口全量 24/24（25.9s）留证                                          |
| live 冒烟     | E2E-AI-09 + edit live + clearCart live | 手动不进 CI     | edit transcript 四重核验（G3.3b-qa §二.8）；clearCart 用户实测关闭（6de1461） |

- **pre-commit 四件套**（lint / format:check / 双 vitest）+ **CI 八 step**
  （+build / BFF typecheck / Playwright browsers / E2E mock）连续绿；E2E 24 条含
  审批闭环旅程（E2E-AI-19：approve → 回放 → 订单号）。

## 四、架构与文档终态

- **design v0.5 (final)**：G4.3 收敛八条 + 三次签核后极小补丁（G4.4 / G3.3b / G5.2），
  G5.2 补丁行签核栏已翻 **✅（2026-10-28）**；在途语义保护全程成立（§4/§6.2/§11/ADR
  决策语句零改写，G4.3/G5.2 程序化核对）。
- **ADR D1–D11** 齐备，D6（语义检索撤销）/ D8（官方消息流）/ D9（审批分层）/
  **D11（edit 方案 B）**为面试叙事主锚。
- **偏离审计 6 项清零**（G5.2 sweep：门面数字 / 方向 D 增补 / 注释漂移 / a11y D2 /
  第 6 缺口登记 / D-1 同族 4 处）；功能层偏离审计结论 = **零偏离**。
- 双门面（README / design）数字同源 249；A1~A19 工程资产登记完毕。

## 五、H 系列人工闸门状态

| 闸门         | 状态               | 说明                                                                                                                                                                                     |
| ------------ | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 wiki 合入 | **用户自取形态**   | 草稿就绪（docs/wiki/，138 行 + INSERT 锚点）；誊写归用户本人                                                                                                                             |
| H2 demo 走查 | **已闭环**         | edit live ✅（transcript 四重核验）/ clearCart live ✅（6de1461）/ 主闭环 live 复跑 ✅（2026-10-28 用户验证）/ prompt 两时刻热修已裁；余：用完杀纪律属常设操作项（h2-demo-checklist.md） |
| H3 README 审 | **材料齐，待真人** | 三件套在案（G4.2 签核 + 对账表 + 大纲）；口述 ≤300s 终判 + 超时回删预案归用户（h3-readme-package.md）                                                                                    |
| H4 / H5      | 未触发             | 无打回超轮 / 无排期冲突仲裁                                                                                                                                                              |
| H6 批量抽验  | **已执行并转化**   | N1 → G5.1 方向 D 收口；N2/D2 → a11y 修复（G5.2 合批）                                                                                                                                    |

## 六、诚实节（环境备注与已知约束）

1. **live 依赖真模型 key**：全部 live 证据在生产-like key 环境取得；本地无 key 时
   live 项按「待 H2」标注，mock 链路不等价于模型行为（prompt 条款生效 = L3，
   已由用户 live 实测关闭）。
2. **E2E 端口面**：标准端口（5173/8787）需环境空闲（`reuseExistingServer:false`
   防静默复用是设计）；非标准端口三腿同源（`E2E_MOCK_PORT`）为已验证等价路径
   （G4.1 根因修复）；QA harness 有 env 双注入坑（webServer env ≠ runner env，
   G5.1-qa §二记录）。
3. **已知架构约束**（设计如此，非缺陷）：订单表 / 签发时刻表单会话内存单例
   （重启即失）；cart persist 为加购时刻快照（下单计价以 server 实时价为准，
   G3.2 裁决①）；客户端 TTL 为收帧推导（提示性，server 校验为唯一权威）。

## 七、遗留与后续

1. **分支合并 → main**：时机由用户定；合并触发 CI（八 step）+ push main 触发
   GitHub Pages 部署（deploy.yml）；未 push 前一切证据在本分支。
2. **wiki 誊写**：归用户本人（H1 自取形态，草稿 + 插入说明就绪）。
3. **备查项**：D-obs1（design §10 历史指针句，披露备查不返工，GA pass 顺手可改）。
4. **Roadmap**（story 诚实边界）：多会话 / 订单持久化、a11y 深化（N2 残余）、
   目录页功能 parity——当前工程预算全投 AI 闭环（h6-spot-check.md N1 story 要点 5）。

## 八、追溯索引（关键锚）

- 交付链：G2.3 `1f65474` → G3.3 `f91aede`+`f0e866a` → G4.4 收官 `08cebc2` →
  G5.1 `8c365ee` → **G5.2 `40bc2ab`+`dbd905d`（GA 基线）**。
- 决策链：ADR D11 `57e22c7`（edit 方案 B）；H2 热修 `b8fddc7`（prompt 两时刻）。
- 索引：`docs/regression-index.md` §1（数字唯一事实源）/
  `docs/ai-assistant-shared-assets.md` A1~A19 / `docs/interview/`（H 材料五件）。

**PM 签名：全程 15 签核闭环，GA 通过，准予交付。**
