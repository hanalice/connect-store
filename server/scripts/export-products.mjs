// 冻结快照导出脚本（一次性动作，ADR D10）：拉取远程 /api/data 全量数组，
// 逐条校验字段形状后落盘 server/data/products.json（格式化输出，便于 git diff 审阅）。
// 运行时不直连远程；快照文件随仓库提交，重新导出 = 换一个数据文件。
// 用法：npm run export:snapshot（纯 node 运行，零依赖）。

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REMOTE_URL = 'https://closet-recruiting-api.azurewebsites.net/api/data';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = join(SCRIPT_DIR, '..', 'data', 'products.json');

const PRICING_OPTIONS = new Set([0, 1, 2]);

/** 逐条校验快照字段形状（与 Product 类型一致），不合法即抛错中止导出。 */
function validateProduct(item, index) {
    const where = `第 ${index} 条（id=${item && typeof item === 'object' ? item.id : '未知'}）`;
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
        throw new Error(`${where}：不是对象`);
    }
    for (const field of ['id', 'creator', 'title', 'imagePath']) {
        if (typeof item[field] !== 'string' || item[field].length === 0) {
            throw new Error(`${where}：字段 ${field} 缺失或不是非空字符串`);
        }
    }
    if (!PRICING_OPTIONS.has(item.pricingOption)) {
        throw new Error(`${where}：pricingOption=${item.pricingOption}，期望 0/1/2`);
    }
    if (typeof item.price !== 'number' || !Number.isFinite(item.price)) {
        throw new Error(`${where}：price=${item.price}，期望有限 number`);
    }
}

const response = await fetch(REMOTE_URL);
if (!response.ok) {
    throw new Error(`远程数据源返回 HTTP ${response.status}`);
}
const products = await response.json();
if (!Array.isArray(products)) {
    throw new Error('远程数据源返回的不是数组');
}

products.forEach(validateProduct);

const ids = products.map((p) => p.id);
const duplicateCount = ids.length - new Set(ids).size;
if (duplicateCount > 0) {
    throw new Error(`存在 ${duplicateCount} 个重复 id，快照无法保证按 id 查找的唯一性`);
}

await mkdir(dirname(OUT_PATH), { recursive: true });
await writeFile(OUT_PATH, `${JSON.stringify(products, null, 2)}\n`, 'utf8');

// 统计输出：验收报告的事实基础（pricingOption 0=Paid / 1=Free / 2=View Only）
console.log(`导出日期: ${new Date().toISOString()}`);
console.log(`数据源: ${REMOTE_URL}`);
console.log(`落盘: ${OUT_PATH}`);
console.log(`商品总条数: ${products.length}`);
for (const option of [0, 1, 2]) {
    const prices = products.filter((p) => p.pricingOption === option).map((p) => p.price);
    console.log(
        `pricingOption=${option}: 条数=${prices.length}, price min=${Math.min(...prices)}, max=${Math.max(...prices)}`,
    );
}
