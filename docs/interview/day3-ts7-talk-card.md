# Day 3 话术卡：TS 5.9.3 → 7.0.2 迁移实测讲述

> 用途：Day 3「TS7 迁移」面试讲述 + 08-08 补考素材。全部数字取自
> `docs/ts7-migration.md`（2026-10-16 实测，含原始计时推导链，可逐字引用）。
> 口径声明：单机单次实测（WSL2 / Ultra 9 185H / Node 22.23.1），不推断其他机器。

## 三个可引用数字（必背）

1. **类型检查冷启动 1,439.504 ms → 346.133 ms = 4.159 倍**；热启动 1,442.356 → 331.810 ms
   = 4.347 倍。（`tsc -b`，删除 tsbuildinfo 为冷、保留为热）
2. **构建冷 2,006.034 ms → 759.775 ms = 2.640 倍**；热 1,853.255 → 768.584 ms = 2.411 倍。
3. **安装 +3,404.829 ms**（22,081.364 → 25,486.193，热 npm 缓存口径）——TS7 不是全面变快，
   安装因双编译器并存（`@typescript/native` 7.0.2 + `@typescript/typescript6` 6.0.3）反而略慢，
   诚实讲出这个 trade-off 是加分点。

备选数字：26 个 TS/TSX 受跟踪文件 1,715 行；typescript-eslint 8.57.0 → 8.71.2；
`npx tsc --version` = 7.0.2（`tsc6` = 6.0.3 并存）。

## 迁移叙事骨架（~90s）

1. **动机（15s）**：TS7 走官方原生编译器通道（`@typescript/native`），想拿真实性能数字，
   不想拿官方 benchmark 转述——自己的项目自己测。
2. **坑 ① 工具链 API（25s）**：直接升 7.0.2 后 `npm run lint` 崩在
   `typescript-eslint` 加载期——`ts.Extension` 等 Classic API 在 7.0.2 里不存在
   （报错 `Cannot read properties of undefined (reading 'Cjs')`）。
3. **方案（20s）**：采用官方 side-by-side 方案：`typescript` 槽位装
   `@typescript/typescript6`（6.0.3）保 Classic API + peer range，
   `@typescript/native` 装真正的 7.0.2 给 `tsc -b` / build 用——**不 hack
   node_modules、不绕过 peer 校验**，最终干净 `npm ci` 成功。
4. **坑 ② peer 冲突（15s）**：`typescript-eslint@8.57.0` peer range `<6.0.0` 覆盖不了
   6.0.3 → `ERESOLVE`；升到 8.71.2（peer `>=4.8.4 <6.1.0`）解决。
5. **实测数字（10s）**：报三个可引用数字 + 口径声明（单机单次、热缓存、每项一次）。
6. **收尾（5s）**：源码零改动——26 文件 1,715 行无一个 TS7 类型报错；27 个存量测试
   全绿零回归。

## 报错分类（追问预案）

| 分类                 | 现象                                    | 处理                              | 状态   |
| -------------------- | --------------------------------------- | --------------------------------- | ------ |
| 工具链 API 不兼容    | lint 加载期 `undefined (reading 'Cjs')` | 官方 side-by-side 双编译器方案    | 已解决 |
| 依赖 peer range 冲突 | `ERESOLVE`（eslint peer <6.0.0）        | typescript-eslint 8.57.0 → 8.71.2 | 已解决 |
| 项目源码/配置错误    | 无                                      | 无需改业务源码或 tsconfig         | 零报错 |

## 可能的追问

- **为什么不用 `--force` / `--legacy-peer-deps`？** → 会留下不可重现的依赖树；
  side-by-side 是官方方案，最终 `npm ci` 零冲突可重现。
- **数字可信吗？** → 原始推导链在文档 §3：每次计时的 `start_ns/end_ns` 都贴了，
  只测一次、不外推；冷/热定义（tsbuildinfo 有无）写清。
- **TS7 值得升吗？** → 类型检查 ~4.2 倍、构建 ~2.5 倍（本机实测口径）；安装略慢
  +3.4s 是双编译器并存的固定成本，CI/本地高频跑类型检查的场景净赚。
