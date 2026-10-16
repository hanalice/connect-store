# TypeScript 7 迁移实测

> 记录日期：2026-10-16。迁移结果：`tsc` 已升级到 TypeScript 7.0.2；按官方 side-by-side 方案为 `typescript-eslint` 保留 TypeScript 6.0 API。27 个存量测试、构建和 lint 均通过。

## 1. 最终依赖形态

TypeScript 7.0 不提供 `typescript-eslint` 所需的 JavaScript 编译器 API。根据 [TypeScript 官方 7.0 公告](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) 的 “Running Side-by-Side with TypeScript 6.0” 方案，最终 `devDependencies` 为：

```json
{
  "@typescript/native": "npm:typescript@^7.0.2",
  "typescript": "npm:@typescript/typescript6@^6.0.2",
  "typescript-eslint": "^8.71.2"
}
```

实测版本与职责：

- `npx tsc --version` → `Version 7.0.2`，用于 `tsc -b` 和 `npm run build`。
- `npx tsc6 --version` → `Version 6.0.3`；`require('typescript').version` 同为 6.0.3，且 `createProgram` 为函数，用于兼容需要 Classic API 的工具。
- `typescript-eslint` 从锁定安装的 8.57.0 适配到 8.71.2；8.57.0 的 peer range 为 `<6.0.0`，不能覆盖兼容层实际使用的 6.0.3。
- `tsconfig*.json`、`eslint.config.js`、`vite.config.ts`、Vitest 和 `@types/node` 均无需改动。
- 未使用 `--force` 或 `--legacy-peer-deps`；最终 `npm ci` 无 peer 冲突并成功完成。

## 2. 环境与统计口径

- 系统：Linux 6.6.87.2-microsoft-standard-WSL2 x86_64。
- CPU：Intel(R) Core(TM) Ultra 9 185H，22 个逻辑 CPU（`os.cpus().length`）。
- 内存：16,467,537,920 bytes（`os.totalmem()`）。
- Node.js：v22.23.1；npm：10.9.8。
- 基线：TypeScript 5.9.3；目标：`tsc` TypeScript 7.0.2。
- 代码规模：`git ls-files '*.ts' '*.tsx' | xargs wc -l` 汇总 26 个受 Git 跟踪文件，共 1,715 行；迁移未改动这些源文件。
- 安装：命令为 `npm ci`，会重建 `node_modules`；未清空 npm 缓存，按热缓存口径记录，但缓存命中率未测。
- 类型检查冷运行：删除 `node_modules/.tmp/tsconfig.app.tsbuildinfo` 和 `node_modules/.tmp/tsconfig.node.tsbuildinfo` 后执行 `npx tsc -b`；热运行：保留上述文件并立即再执行一次。
- 构建冷运行：删除 `dist/` 与上述两个 `.tsbuildinfo` 文件后执行 `npm run build`；热运行：保留这些文件并立即再执行一次。Vite 每次仍完整构建。
- `--incremental`：未显式传入，配置通过 `tsBuildInfoFile` 指定构建信息文件。“热运行”只表示保留构建信息的重复运行，不声称增量命中；TS7 的 `npx tsc -b --verbose` 诊断仍显示两个项目因输出文件不存在而构建（配置为 `noEmit: true`）。
- 单线程开关：所有基准命令均未传 `--singleThreaded`，TS7 使用其默认并行行为；单线程专项对照未测。
- 计时推导：Node.js `process.hrtime.bigint()` 在子进程启动前后各取一次单调时钟值，`耗时(ms) = (end_ns - start_ns) / 1,000,000`，结果四舍五入到 0.001 ms。每项只测一次，不据此推断其他机器或更大项目的性能。

## 3. 安装、类型检查与构建耗时

| 项目                |      TS 5.9.3 |      TS 7.0.2 | 前后对比推导                                  |
| ------------------- | ------------: | ------------: | --------------------------------------------- |
| 安装（热 npm 缓存） | 22,081.364 ms | 25,486.193 ms | 25,486.193 ms - 22,081.364 ms = +3,404.829 ms |
| 类型检查（冷）      |  1,439.504 ms |    346.133 ms | 1,439.504 ms / 346.133 ms = 4.159 倍          |
| 类型检查（热）      |  1,442.356 ms |    331.810 ms | 1,442.356 ms / 331.810 ms = 4.347 倍          |
| 构建（冷）          |  2,006.034 ms |    759.775 ms | 2,006.034 ms / 759.775 ms = 2.640 倍          |
| 构建（热）          |  1,853.255 ms |    768.584 ms | 1,853.255 ms / 768.584 ms = 2.411 倍          |

“倍”列为 TS5 耗时除以 TS7 耗时；安装列改为耗时差，未把依赖数量不同的两次 `npm ci` 解释为编译器性能。

### 原始计时推导链

以下数值均直接来自对应命令输出的 `start_ns` / `end_ns`，未凭空补数：

- 安装：
  - TS5：`(78,136,910,302,732 ns - 78,114,828,938,404 ns) / 1,000,000 = 22,081.364 ms`。
  - TS7：`(83,553,485,346,109 ns - 83,527,999,153,312 ns) / 1,000,000 = 25,486.193 ms`。
- 类型检查（冷）：
  - TS5：`(78,166,046,598,499 ns - 78,164,607,094,790 ns) / 1,000,000 = 1,439.504 ms`。
  - TS7：`(83,562,119,608,511 ns - 83,561,773,475,481 ns) / 1,000,000 = 346.133 ms`。
- 类型检查（热）：
  - TS5：`(78,173,903,357,884 ns - 78,172,461,001,695 ns) / 1,000,000 = 1,442.356 ms`。
  - TS7：`(83,568,458,816,185 ns - 83,568,127,006,647 ns) / 1,000,000 = 331.810 ms`。
- 构建（冷）：
  - TS5：`(78,452,820,767,446 ns - 78,450,814,733,187 ns) / 1,000,000 = 2,006.034 ms`。
  - TS7：`(84,016,561,430,711 ns - 84,015,801,655,909 ns) / 1,000,000 = 759.775 ms`。
- 构建（热）：
  - TS5：`(78,461,950,937,105 ns - 78,460,097,682,229 ns) / 1,000,000 = 1,853.255 ms`。
  - TS7：`(84,025,224,953,729 ns - 84,024,456,369,916 ns) / 1,000,000 = 768.584 ms`。

## 4. 报错分类与处理

### 4.1 工具链 API 不兼容（已解决）

直接把 `typescript` 指向 7.0.2 后，`npm run lint` 在加载 `typescript-eslint@8.57.0` 时失败，尚未进入项目规则执行阶段：

```text
TypeError: Cannot read properties of undefined (reading 'Cjs')
    at Object.<anonymous> (/home/alice/workspace/connect-store/node_modules/typescript-eslint/node_modules/@typescript-eslint/typescript-estree/dist/create-program/shared.js:59:18)
    at Module._compile (node:internal/modules/cjs/loader:1781:14)
    at Object.<anonymous> (node:internal/modules/cjs/loader:1813:10)
    at Module.load (node:internal/modules/cjs/loader:1283:32)
    at Module._load (node:internal/modules/cjs/loader:1113:12)
```

实测 `require('typescript')` 在直接安装 7.0.2 时只有 `version` 和 `versionMajorMinor`，出错位置读取的 `ts.Extension` 不存在。处理：采用官方 `@typescript/native` + `@typescript/typescript6` alias 组合，而不是修改 `node_modules` 或绕过 peer 校验。

### 4.2 依赖 peer range 冲突（已解决）

直接安装 TS7 时，查询到 `typescript-eslint@8.71.2` 的 peer range 为 `typescript >=4.8.4 <6.1.0`；canary 8.71.3-alpha.7 也不包含 TS7。直接组合会返回：

```text
npm error code ERESOLVE
npm error ERESOLVE unable to resolve dependency tree
npm error Found: typescript@7.0.2
npm error Could not resolve dependency:
npm error peer typescript@">=4.8.4 <6.1.0" from typescript-eslint@8.71.2
```

处理：先用兼容包满足 `typescript` import 的 API 与 peer range，再将 `typescript-eslint` 从 8.57.0 升到支持 TypeScript 6.0 的 8.71.2。最终干净 `npm ci` 成功。

### 4.3 项目源码与配置类型错误

本轮未出现项目源码或 `tsconfig*.json` 的 TS7 报错，因此没有为消除错误而修改业务源码或编译配置。

## 5. 最终验收

- `npx tsc -b`：通过。
- `npm run build`：冷、热两次均通过，59 个模块完成转换。
- `npm run lint`：通过，`--max-warnings 0` 下无 warning。
- `npm test`：4 个测试文件通过，27 个测试通过，0 回归。
- 测试输出仍有迁移前已存在的 React `act(...)` stderr 提示，但对应测试通过；它不是本轮新增失败或 lint warning。
