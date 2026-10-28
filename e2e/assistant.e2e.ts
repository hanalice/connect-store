import { expect, test, type Locator, type Page } from '@playwright/test';

/** mock BFF 控制面（直连 mock 端口，不走页面代理）：放行 gated 场景的剩余帧。
 *  端口与 e2e/mock-bff.mjs 的监听端口同源（E2E_MOCK_PORT，默认 8787）。 */
const MOCK_BFF_ORIGIN = `http://localhost:${process.env.E2E_MOCK_PORT ?? 8787}`;

/** 最后一条 assistant 气泡（消息列表最后一行的气泡容器，选择器不依赖 CSS Module 哈希类名）。 */
function assistantBubble(page: Page): Locator {
    return page.getByRole('log').locator('> div').last().locator('> div');
}

async function send(page: Page, text: string): Promise<void> {
    await page.getByLabel('消息输入框').fill(text);
    await page.getByRole('button', { name: '发送' }).click();
}

test.beforeEach(async ({ page }) => {
    await page.goto('/#/assistant');
});

test('E2E-AI-01 页面加载：输入框与发送按钮可见', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'AI 导购助手' })).toBeVisible();
    await expect(page.getByLabel('消息输入框')).toBeVisible();
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible();
});

test('E2E-AI-02 逐块流式渲染：中间态文本逐步增长（INT-AI-01 / A11Y-04）', async ({ page }) => {
    await send(page, '__e2e_gated__');
    const bubble = assistantBubble(page);

    // 闸门未放行：流停在第一帧增量之后，DOM 呈现中间态（非一次性整段）
    await expect(bubble).toHaveText('推荐');
    const midwayText = await bubble.textContent();

    // A11Y-04：流式正文容器带 aria-live="polite"
    await expect(bubble.locator('[aria-live="polite"]')).toBeVisible();

    // 放行剩余帧：文本在中间态基础上继续增长到完整
    await fetch(`${MOCK_BFF_ORIGIN}/__release`);
    await expect(bubble).toHaveText('推荐免费素材');

    const finalText = await bubble.textContent();
    expect(midwayText).toBe('推荐');
    expect(finalText).toBe('推荐免费素材');
    expect(finalText!.startsWith(midwayText!)).toBe(true);

    // 流结束后回到 idle：输入框恢复可用
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
});

test('E2E-AI-03 停止：提示条出现、输入框恢复、部分文本保留、无错误横幅（INT-AI-02）', async ({
    page,
}) => {
    await send(page, '__e2e_hang__');
    const bubble = assistantBubble(page);
    await expect(bubble).toContainText('这段回复尚未完成，');

    await page.getByRole('button', { name: '停止' }).click();

    await expect(page.getByText('已停止生成，可继续发送新消息')).toBeVisible();
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
    // 已收到的部分文本保留
    await expect(bubble).toContainText('这段回复尚未完成，');
    // 主动取消 ≠ 失败：不出现错误横幅
    await expect(page.getByRole('alert')).toHaveCount(0);
});

test('E2E-AI-04 reasoning 折叠：默认收起显示「思考过程」，点击展开可见内容', async ({ page }) => {
    await send(page, '__e2e_reasoning__');
    await expect(page.getByLabel('消息输入框')).toBeEnabled();

    const details = page.locator('details');
    await expect(details).toBeVisible();
    await expect(details.locator('summary')).toHaveText('思考过程');
    // 默认收起：open 属性为 false，内容不可见
    expect(await details.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
    await expect(details.locator('div')).toBeHidden();

    await details.locator('summary').click();
    expect(await details.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(true);
    await expect(details.locator('div')).toBeVisible();
    await expect(details.locator('div')).toContainText('用户在要素材，先确认预算与风格。');
});

test('E2E-AI-05 智能滚动：流式上滑不抢 scrollTop，回底恢复跟随', async ({ page }) => {
    await send(page, '__e2e_long__');
    const list = page.getByRole('log');

    // 等内容溢出出现滚动条
    await expect
        .poll(async () => list.evaluate((el) => el.scrollHeight - el.clientHeight))
        .toBeGreaterThan(100);

    // 上滑到顶部阅读：流继续推进，scrollTop 不被抢
    await list.evaluate((el) => {
        el.scrollTop = 0;
    });
    await page.waitForTimeout(600);
    const topAfterScrollUp = await list.evaluate((el) => el.scrollTop);
    expect(topAfterScrollUp).toBeLessThan(40);

    // 回到底部：恢复跟随，流结束时停在底部
    await list.evaluate((el) => {
        el.scrollTop = el.scrollHeight;
    });
    await expect(page.getByLabel('消息输入框')).toBeEnabled({ timeout: 15_000 });
    const distanceToBottom = await list.evaluate(
        (el) => el.scrollHeight - el.scrollTop - el.clientHeight,
    );
    expect(distanceToBottom).toBeLessThan(40);
});

test('E2E-AI-06 错误态-网络断：route.abort → 横幅「无法连接服务器」，不白屏', async ({ page }) => {
    await page.route('**/api/chat', (route) => route.abort());
    await send(page, '断网场景');

    await expect(page.getByRole('alert')).toContainText('无法连接服务器');
    // 不白屏：消息列表与输入框仍在，且输入框恢复可用
    await expect(page.getByRole('log')).toBeVisible();
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
});

test('E2E-AI-07 错误态-502：route 返 502（= 停 BFF 时的 proxy 行为）→ 横幅含 HTTP 502', async ({
    page,
}) => {
    await page.route('**/api/chat', (route) =>
        route.fulfill({
            status: 502,
            contentType: 'text/html',
            body: '<html><body>Bad Gateway</body></html>',
        }),
    );
    await send(page, '502 场景');

    await expect(page.getByRole('alert')).toContainText('HTTP 502');
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
});

test('E2E-AI-08 错误态-error chunk：流中推 error 帧 → 横幅显示上游文案', async ({ page }) => {
    await send(page, '__e2e_error_chunk__');

    await expect(page.getByRole('alert')).toContainText('上游模型服务错误（HTTP 500）');
    // error chunk 之前收到的部分文本保留，输入框恢复可用
    await expect(assistantBubble(page)).toContainText('前半段内容');
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
});

test('E2E-AI-10 工具卡实时显示：闸门停在执行中（工具名/参数/spinner）→ 成功 + 耗时 → 回复完成（INT-AI-03）', async ({
    page,
}) => {
    await send(page, '__e2e_tool__');

    // 放行至工具输入帧，闸门停在「执行中」：工具名 / 格式化参数 / spinner 态 / 不显示耗时
    await fetch(`${MOCK_BFF_ORIGIN}/__release?gate=pre`);
    const runningCard = page.locator('div[data-state="running"]');
    await expect(runningCard).toBeVisible();
    await expect(runningCard).toContainText('searchCatalog');
    await expect(runningCard).toContainText('"pricingOption": 1');
    await expect(runningCard).toContainText('执行中');
    await expect(runningCard.getByText(/\d+ ms/)).toHaveCount(0);

    // 放行输出帧：成功态 + 耗时出现 + 回复完成
    await fetch(`${MOCK_BFF_ORIGIN}/__release?gate=post`);
    const successCard = page.locator('div[data-state="success"]');
    await expect(successCard).toBeVisible();
    await expect(successCard).toContainText('成功');
    await expect(successCard.getByText(/\d+ ms/)).toBeVisible();
    await expect(assistantBubble(page)).toContainText('为你找到 1 个免费素材');
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
});

test('E2E-AI-11 状态投影序列：badge 随 thinking → tool_calling → tool_result → streaming → done 逐步变化（INT-AI-05）', async ({
    page,
}) => {
    const badge = page.getByRole('status', { name: '助手状态' });
    await expect(badge).toHaveText('待命');

    await send(page, '__e2e_tool__');
    // 闸门 pre 未放行：停在 thinking
    await expect(badge).toHaveText('思考中');

    await fetch(`${MOCK_BFF_ORIGIN}/__release?gate=pre`);
    // 工具输入帧已下发、输出帧被闸门 post 拦住：停在 tool_calling
    await expect(badge).toHaveText('调用工具');

    await fetch(`${MOCK_BFF_ORIGIN}/__release?gate=post`);
    // 输出帧与正文帧之间留有观察窗口，轮询断言中间投影
    await expect
        .poll(async () => badge.textContent(), { intervals: [20, 50, 100], timeout: 5_000 })
        .toBe('工具结果');
    await expect
        .poll(async () => badge.textContent(), { intervals: [20, 50, 100], timeout: 5_000 })
        .toBe('生成回复');
    await expect(badge).toHaveText('已完成');
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
});

test('E2E-AI-12 工具执行中停止：aborted 提示、无 alert 错误横幅、输入恢复（INT-AI-02）', async ({
    page,
}) => {
    await send(page, '__e2e_tool_hang__');
    const runningCard = page.locator('div[data-state="running"]');
    await expect(runningCard).toContainText('执行中');

    await page.getByRole('button', { name: '停止' }).click();

    // 取消 ≠ 失败：aborted 提示出现、无错误横幅、输入恢复
    await expect(page.getByText('已停止生成，可继续发送新消息')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
});

test('E2E-AI-13 工具失败恢复：错误横幅含工具失败文案，再发新消息正常回复（error 恢复链路）', async ({
    page,
}) => {
    await send(page, '__e2e_tool_error__');

    await expect(page.getByRole('alert')).toContainText('工具调用失败');
    await expect(page.getByRole('alert')).toContainText('catalog snapshot unavailable');
    await expect(page.getByLabel('消息输入框')).toBeEnabled();

    // error 后用户直接发新消息：RETRY → USER_SEND 恢复，正常走完一个回合
    await send(page, '换个问题');
    await expect(assistantBubble(page)).toContainText('你好，我是 AI 导购助手。');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
});

test('E2E-AI-14 真实商品卡：searchCatalog 输出 → 气泡内 2 列 ProductGrid + 2 张真实 ProductCard（INT-AI-04 / 裁决⑥）', async ({
    page,
}) => {
    await send(page, '__e2e_tool_ui__');
    const bubble = assistantBubble(page);

    // 存量 ProductGrid（复用组件渲染 section.grid）+ assistant 侧 2 列 wrapper
    const gridWrapper = bubble.getByTestId('tool-search-catalog-grid');
    await expect(gridWrapper).toBeVisible();
    const gridSection = gridWrapper.locator('section');
    await expect(gridSection).toBeVisible();

    // 计算样式列数 = 2（裁决⑥：wrapper 覆盖媒体查询，全视口恒定 2 列）
    await expect
        .poll(async () =>
            gridSection.evaluate(
                (el) => getComputedStyle(el).gridTemplateColumns.split(' ').length,
            ),
        )
        .toBe(2);

    // 真实 ProductCard（非纯文本）：命名 article + aria-label 结构
    const cards = gridSection.locator('article');
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(0)).toHaveAttribute(
        'aria-label',
        '免费素材 Alpha by Creator A, price Free',
    );
    await expect(cards.nth(1)).toHaveAttribute(
        'aria-label',
        '免费素材 Beta by Creator B, price Free',
    );
    await expect(bubble).toContainText('免费素材 Alpha');
    await expect(bubble).toContainText('免费素材 Beta');

    // 过程卡（ToolCallPanel 职责）与最终回复照常
    await expect(bubble.locator('div[data-state="success"]')).toContainText('searchCatalog');
    await expect(bubble).toContainText('为你找到 2 个免费素材');
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
});

test('E2E-AI-15 未注册 fallback：deleteAccount 输出 → 气泡内无商品卡 + fallback 文本 + 回复正常完成（UT-REG-02 E2E 侧）', async ({
    page,
}) => {
    await send(page, '__e2e_tool_unknown__');
    const bubble = assistantBubble(page);

    // 白名单外 toolName → 降级 fallback 文本（裁决⑤），绝不渲染任意组件
    await expect(bubble).toContainText('暂不支持展示该工具的结果');
    await expect(bubble.locator('article')).toHaveCount(0);
    await expect(bubble.locator('section')).toHaveCount(0);

    // 过程卡仍在（裁决③：过程归面板），回复正常完成
    await expect(bubble.locator('div[data-state="success"]')).toContainText('deleteAccount');
    await expect(bubble).toContainText('未知工具已执行，回复继续');
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
});

test('E2E-AI-16 加购旅程：addToCart 回执 → drawer 自动打开、条目正确 → 关闭 → badge 计数 → badge 重开（UT-CART-01）', async ({
    page,
}) => {
    await send(page, '__e2e_cart__');

    // 闸门 cart 未放行：回执未达，drawer 保持关闭（自动打开的反向断言）
    await expect(page.getByRole('dialog', { name: '购物车' })).toHaveCount(0);

    await fetch(`${MOCK_BFF_ORIGIN}/__release?gate=cart`);
    const drawer = page.getByRole('dialog', { name: '购物车' });
    await expect(drawer).toBeVisible();

    // 条目断言：标题 / 数量 / 小计（12.5×1）+ 合计联动
    const row = drawer.getByTestId('cart-item-p-cart-1');
    await expect(row).toContainText('付费模板 Gamma');
    await expect(row.getByTestId('cart-quantity')).toHaveText('1');
    await expect(row.getByTestId('cart-subtotal')).toHaveText('$12.50');
    await expect(drawer.getByTestId('cart-total')).toHaveText('$12.50');
    // 气泡内加购确认卡（tool-addToCart registry 分支）
    await expect(assistantBubble(page).getByTestId('cart-confirm-card')).toContainText(
        '已加入 1 件「付费模板 Gamma」',
    );

    // 关闭 drawer → badge 计数（条目数）→ badge 点击重开
    await drawer.getByRole('button', { name: '关闭购物车' }).click();
    await expect(drawer).toBeHidden();
    const badge = page.getByRole('button', { name: '购物车，1 件商品' });
    await expect(badge).toBeVisible();
    await badge.click();
    await expect(page.getByRole('dialog', { name: '购物车' })).toBeVisible();
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
});

test('E2E-AI-17 只读投影与持久化：加购回执 → drawer 只读校验数量 / 小计 / 合计 → reload → badge 与 drawer 内容恢复（G5.1 方向 D，映射 UT-CART-02/03）', async ({
    page,
}) => {
    await send(page, '__e2e_cart__');
    await fetch(`${MOCK_BFF_ORIGIN}/__release?gate=cart`);
    const drawer = page.getByRole('dialog', { name: '购物车' });
    const row = drawer.getByTestId('cart-item-p-cart-1');
    await expect(row.getByTestId('cart-quantity')).toHaveText('1');
    await expect(row.getByTestId('cart-subtotal')).toHaveText('$12.50');
    await expect(drawer.getByTestId('cart-total')).toHaveText('$12.50');

    // G5.1 只读收口：drawer 无步进 / 单行删除 / 清空写控件（single-writer，写动作只由 AI 回执触发）
    await expect(drawer.getByRole('button', { name: '增加 付费模板 Gamma' })).toHaveCount(0);
    await expect(drawer.getByRole('button', { name: '减少 付费模板 Gamma' })).toHaveCount(0);
    await expect(drawer.getByRole('button', { name: '删除 付费模板 Gamma' })).toHaveCount(0);
    await expect(drawer.getByRole('button', { name: '清空购物车' })).toHaveCount(0);

    // 刷新：persist 恢复——badge 计数与 drawer 内容（数量 1 / 合计 12.50）都在
    // drawer 开关属 UI 态不持久化（裁决③），reload 后通过 badge 重开
    await page.reload();
    const badge = page.getByRole('button', { name: '购物车，1 件商品' });
    await expect(badge).toBeVisible();
    await badge.click();
    const restored = page.getByRole('dialog', { name: '购物车' });
    const restoredRow = restored.getByTestId('cart-item-p-cart-1');
    await expect(restoredRow.getByTestId('cart-quantity')).toHaveText('1');
    await expect(restoredRow.getByTestId('cart-subtotal')).toHaveText('$12.50');
    await expect(restored.getByTestId('cart-total')).toHaveText('$12.50');
    // 只读口径 reload 后同样成立
    await expect(restored.getByRole('button', { name: '清空购物车' })).toHaveCount(0);
});

test('E2E-AI-18 目录页只读浏览：page.route 回放远程商品 → 目录页无加购按钮、badge 初始为 0 → assistant 页加购后回目录页 badge 可见（persist 跨页实证，G5.1 方向 D）', async ({
    page,
}) => {
    // catalog 数据来自远程绝对 URL，不经 vite proxy / mock-bff——对该 URL 确定性回放 2 件商品
    await page.route('https://closet-recruiting-api.azurewebsites.net/api/data', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    id: 'catalog-a',
                    creator: 'Creator A',
                    title: '目录回放 A',
                    pricingOption: 1,
                    imagePath: '',
                    price: 0,
                },
                {
                    id: 'catalog-b',
                    creator: 'Creator B',
                    title: '目录回放 B',
                    pricingOption: 0,
                    imagePath: '',
                    price: 12.5,
                },
            ]),
        }),
    );

    await page.goto('/#/');
    // 回放数据落卡：存量 ProductCard 命名 article + aria-label
    await expect(
        page.getByRole('article', { name: '目录回放 A by Creator A, price Free' }),
    ).toBeVisible();
    await expect(
        page.getByRole('article', { name: '目录回放 B by Creator B, price $12.50' }),
    ).toBeVisible();

    // G5.1 只读收口：目录页无任何加购按钮（浏览归人、交易归 AI，single-writer）
    await expect(page.getByRole('button', { name: /加入购物车/ })).toHaveCount(0);
    // badge 初始为 0，购物车仍可见（G3.1a 挂载保留）
    const badge0 = page.getByRole('button', { name: '购物车，0 件商品' });
    await expect(badge0).toBeVisible();

    // persist 跨页角标同源链路（G3.1a）：assistant 页 AI 加购 → 回目录页 badge 可见。
    // 注意：goto 仅变 hash = 同文档导航（SPA 不重建，zustand 存活）——
    // 离页前先关 drawer，否则 overlay 盖住 header，badge click 被拦截。
    await page.goto('/#/assistant');
    await send(page, '__e2e_cart__');
    await fetch(`${MOCK_BFF_ORIGIN}/__release?gate=cart`);
    await expect(page.getByRole('dialog', { name: '购物车' })).toBeVisible();
    await expect(page.getByRole('button', { name: '购物车，1 件商品' })).toBeVisible();
    await page.getByRole('button', { name: '关闭购物车' }).click();
    await expect(page.getByRole('dialog', { name: '购物车' })).toBeHidden();

    await page.goto('/#/');
    await expect(
        page.getByRole('article', { name: '目录回放 A by Creator A, price Free' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /加入购物车/ })).toHaveCount(0);
    const badge = page.getByRole('button', { name: '购物车，1 件商品' });
    await expect(badge).toBeVisible();
    // badge 重开 drawer：只读投影条目与合计（12.5×1）
    await badge.click();
    const drawer = page.getByRole('dialog', { name: '购物车' });
    await expect(drawer.getByTestId('cart-item-p-cart-1')).toBeVisible();
    await expect(drawer.getByTestId('cart-total')).toHaveText('$12.50');
    await expect(drawer.getByRole('button', { name: '清空购物车' })).toHaveCount(0);

    // reload：items 持久化恢复（persist 跨页同源链路的目录页侧实证）
    await page.reload();
    await expect(page.getByRole('button', { name: '购物车，1 件商品' })).toBeVisible();
    await expect(page.getByRole('dialog', { name: '购物车' })).toHaveCount(0);
});

test('E2E-AI-25 清空购物车：clearCart 回执（G5.1 裁决①-b）→ 购物车归零 + drawer 只读投影空态 → reload persist 恢复', async ({
    page,
}) => {
    // 先加购 1 件（AI 主路径，与 E2E-AI-16 同模式）
    await send(page, '__e2e_cart__');
    await fetch(`${MOCK_BFF_ORIGIN}/__release?gate=cart`);
    const drawer = page.getByRole('dialog', { name: '购物车' });
    await expect(drawer.getByTestId('cart-item-p-cart-1')).toBeVisible();
    await expect(drawer.getByTestId('cart-total')).toHaveText('$12.50');
    // drawer 只读收口：清空无人工入口，唯一通道 = AI clearCart 回执
    await expect(drawer.getByRole('button', { name: '清空购物车' })).toHaveCount(0);
    await drawer.getByRole('button', { name: '关闭购物车' }).click();
    await expect(drawer).toBeHidden();

    // 用户要求清空 → 工具调用挂起在闸门 clear：回执未达，购物车保持原状（反向断言）
    await send(page, '__e2e_clear_cart__');
    await expect(page.getByRole('button', { name: '购物车，1 件商品' })).toBeVisible();
    await fetch(`${MOCK_BFF_ORIGIN}/__release?gate=clear`);

    // clearCart 回执应用：购物车清空 + drawer 自动打开（镜像 addToCart 接线），空态 + 合计 $0.00
    const cleared = page.getByRole('dialog', { name: '购物车' });
    await expect(cleared).toBeVisible();
    await expect(cleared.getByText('购物车是空的')).toBeVisible();
    await expect(cleared.getByTestId('cart-total')).toHaveText('$0.00');
    // 气泡内清空确认卡（tool-clearCart registry 分支）
    await expect(assistantBubble(page).getByTestId('clear-cart-confirm-card')).toContainText(
        '✓ 已清空购物车',
    );
    await expect(assistantBubble(page)).toContainText('购物车已清空');

    // 关闭 → badge 归零；reload → persist 恢复空车（清空结果同样持久化）
    await cleared.getByRole('button', { name: '关闭购物车' }).click();
    await expect(cleared).toBeHidden();
    await expect(page.getByRole('button', { name: '购物车，0 件商品' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: '购物车，0 件商品' })).toBeVisible();
    await page.getByRole('button', { name: '购物车，0 件商品' }).click();
    await expect(
        page.getByRole('dialog', { name: '购物车' }).getByText('购物车是空的'),
    ).toBeVisible();
});

/** G3.3 订单审批场景：目录快照路由（审批卡条目标题 / 现价解析源，p-order-1/2 与 mock 帧一致）。 */
async function routeOrderProducts(page: Page): Promise<void> {
    await page.route('https://closet-recruiting-api.azurewebsites.net/api/data', (route) =>
        route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
                {
                    id: 'p-order-1',
                    creator: 'Creator A',
                    title: '付费模板 Alpha',
                    pricingOption: 0,
                    imagePath: '',
                    price: 10,
                },
                {
                    id: 'p-order-2',
                    creator: 'Creator B',
                    title: '音效包 Beta',
                    pricingOption: 0,
                    imagePath: '',
                    price: 7.5,
                },
            ]),
        }),
    );
}

/** 跑到审批卡可操作态：发送订单场景 → badge 等待确认 + 卡渲染。 */
async function reachApprovalCard(page: Page) {
    await send(page, '__e2e_order__');
    const badge = page.getByRole('status', { name: '助手状态' });
    await expect(badge).toHaveText('等待确认');
    const card = page.getByTestId('approval-card');
    await expect(card).toBeVisible();
    return { badge, card };
}

test('E2E-AI-19 审批通过闭环：approval-request → 卡 → approve → 回放执行回执 + 订单号；badge await_human 投影序列（INT-HITL-01）', async ({
    page,
}) => {
    await routeOrderProducts(page);
    const badge = page.getByRole('status', { name: '助手状态' });
    await expect(badge).toHaveText('待命');

    await send(page, '__e2e_order__');
    // 投影序列：待命 → 思考中/生成回复（瞬态）→ 等待确认（APPROVAL_REQUEST 边真实可达）
    await expect(badge).toHaveText('等待确认');
    await expect(page.getByLabel('消息输入框')).toBeDisabled();
    await expect(page.getByLabel('消息输入框')).toHaveAttribute(
        'placeholder',
        '请先完成上方订单审批',
    );

    // 卡数据：条目（标题 / 数量 / 小计）+ 合计 + 审批单号 + TTL 倒计时
    const card = page.getByTestId('approval-card');
    await expect(card).toContainText('审批单号 appr-e2e-1');
    await expect(card).toContainText('剩余 4:');
    await expect(card).toContainText('付费模板 Alpha');
    await expect(card.getByText('× 1')).toBeVisible();
    await expect(card).toContainText('$10.00');
    await expect(card).toContainText('音效包 Beta');
    await expect(card.getByText('× 2')).toBeVisible();
    await expect(card).toContainText('$15.00');
    await expect(card).toContainText('合计 $25.00');

    // approve → 卡转执行中 → badge 调用工具 → 工具结果 → 生成回复 → 已完成
    await card.getByRole('button', { name: '确认下单' }).click();
    await expect(card).toContainText('订单执行中…');
    await expect(badge).toHaveText('调用工具');
    await expect
        .poll(async () => badge.textContent(), { intervals: [20, 50, 100], timeout: 5_000 })
        .toBe('工具结果');
    await expect
        .poll(async () => badge.textContent(), { intervals: [20, 50, 100], timeout: 5_000 })
        .toBe('生成回复');
    await expect(badge).toHaveText('已完成');

    // 执行回执：registry 订单结果卡 + 回复文本含订单号 + 工具成功卡
    await expect(page.getByTestId('order-result-card')).toContainText('订单号：order-e2e0001');
    await expect(page.getByTestId('order-result-card')).toContainText('实付金额：$25.00');
    await expect(assistantBubble(page)).toContainText('订单号 order-e2e0001');
    await expect(page.locator('div[data-state="success"]')).toContainText('placeOrder');
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
});

test('E2E-AI-20 reject 修正链路：deny 复放 → 修正文本出现 + 卡展示拒绝原因（INT-HITL-02）', async ({
    page,
}) => {
    await routeOrderProducts(page);
    const { badge, card } = await reachApprovalCard(page);

    // 预设 reason 最小形态：默认「太贵了」，确认拒绝
    await card.getByRole('button', { name: '拒绝' }).click();
    await card.getByRole('button', { name: '确认拒绝' }).click();
    await expect(card).toContainText('已拒绝：太贵了');
    // deny ≠ 失败：无错误横幅
    await expect(page.getByRole('alert')).toHaveCount(0);

    // 修正方案文本（execution-denied → 模型续跑生成）
    await expect(assistantBubble(page)).toContainText('免费的替代商品');
    await expect(badge).toHaveText('已完成');
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
});

test('E2E-AI-21 edit 重新发起：卡内改数量 / 移除条目 → edit 用户消息（D11 方案 B）→ 模型重新发起 → 新审批卡替换旧卡 → 通过新卡完成（INT-HITL-03）', async ({
    page,
}) => {
    await routeOrderProducts(page);
    const { badge, card } = await reachApprovalCard(page);

    // 卡内修改：音效包 Beta 2 → 1，移除付费模板 Alpha（合计 25.00 → 7.50 实时重算）
    await card.getByRole('button', { name: '修改' }).click();
    await card.getByRole('button', { name: '减少 音效包 Beta' }).click();
    await expect(card.getByTestId('edit-qty-p-order-2')).toHaveText('1');
    // 合计实时重算：25.00 →（Beta 2→1）17.50 →（移除 Alpha）7.50
    await expect(card).toContainText('合计 $17.50');
    await card.getByRole('button', { name: '移除 付费模板 Alpha' }).click();
    await expect(card).toContainText('合计 $7.50');
    // D11 方案 B（G3.3b）：确认修改 = 追加「[订单修改重发]」用户消息进官方消息流，
    // 由模型重新发起 placeOrder（不再伪造 toolCall part——live 100% MissingToolResultsError 根因修复）
    await card.getByRole('button', { name: '确认修改并重新发起' }).click();

    // 旧卡被替换为失效提示（<p>，非卡），新卡（新审批单号 + 修改后 items）渲染
    await expect(page.getByText('已修改并重新发起', { exact: true })).toBeVisible();
    const newCard = page.getByTestId('approval-card');
    await expect(newCard).toContainText('审批单号 appr-e2e-2');
    await expect(newCard).toContainText('音效包 Beta');
    await expect(newCard.getByText('× 1')).toBeVisible();
    await expect(newCard).toContainText('合计 $7.50');
    await expect(newCard).not.toContainText('付费模板 Alpha');
    await expect(badge).toHaveText('等待确认');

    // 通过新卡 approve 完成闭环：新执行回执（edit 订单号）
    await newCard.getByRole('button', { name: '确认下单' }).click();
    await expect(page.getByTestId('order-result-card')).toContainText('订单号：order-e2e0002');
    await expect(assistantBubble(page)).toContainText('订单号 order-e2e0002');
    await expect(badge).toHaveText('已完成');
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
});

test('E2E-AI-22 错误恢复：route.abort → error 横幅含重试按钮 + 降级链接 → 点重试重发原消息新回合正常回复', async ({
    page,
}) => {
    // 第一次请求断网（abort），其后放行（模拟「断网 → 恢复」）
    let chatCount = 0;
    await page.route('**/api/chat', (route) => {
        chatCount += 1;
        if (chatCount === 1) {
            route.abort();
        } else {
            route.continue();
        }
    });

    await send(page, '断网后重试的原始问题');
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('无法连接服务器');
    // 重试按钮 + 降级链接（裁决②③）
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible();
    await expect(page.getByRole('link', { name: '或回目录浏览商品 →' })).toHaveAttribute(
        'href',
        '#/',
    );

    // 点重试：重发原消息的新回合，正常回复（请求 2 已放行）
    await page.getByRole('button', { name: '重试' }).click();
    await expect(page.getByRole('log').getByText('断网后重试的原始问题')).toHaveCount(2);
    await expect(assistantBubble(page)).toContainText('你好，我是 AI 导购助手。');
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel('消息输入框')).toBeEnabled();

    // 降级链接点击跳转目录页（恢复路径之外的兜底出口）
    await page.unroute('**/api/chat');
    await page.route('**/api/chat', (route) => route.abort());
    await send(page, '再次断网的问题');
    await expect(page.getByRole('alert')).toContainText('无法连接服务器');
    await page.getByRole('link', { name: '或回目录浏览商品 →' }).click();
    await expect(page).toHaveURL(/#\/$/);
});

test('E2E-AI-23 中断恢复：hang 场景点停止 → aborted 横幅无重试按钮 + 降级链接 → 直发新消息正常回复', async ({
    page,
}) => {
    await send(page, '__e2e_hang__');
    await expect(assistantBubble(page)).toContainText('这段回复尚未完成，');

    await page.getByRole('button', { name: '停止' }).click();
    // 取消 ≠ 失败：aborted 横幅在、无错误横幅、无重试按钮（aborted 三约束①）
    await expect(page.getByText('已停止生成，可继续发送新消息')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '重试' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '或回目录浏览商品 →' })).toHaveAttribute(
        'href',
        '#/',
    );

    // 恢复 = 直发新消息（aborted + USER_SEND → thinking，表内 #20 边）
    await send(page, '继续聊聊');
    await expect(assistantBubble(page)).toContainText('你好，我是 AI 导购助手。');
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
});

test('E2E-AI-24 审批中断恢复：审批 pending 中流错误 → 保位 await_human（无错误横幅 + 卡内提示）→ 卡仍可决策完成订单（裁决①）', async ({
    page,
}) => {
    await routeOrderProducts(page);
    const badge = page.getByRole('status', { name: '助手状态' });

    // 首请求：审批挂起后流推 error chunk（断网/上游错误发生在审批 pending 中）
    await send(page, '__e2e_order_fail__');
    await expect(badge).toHaveText('等待确认');
    const card = page.getByTestId('approval-card');
    await expect(card).toBeVisible();

    // 保位实证：无错误横幅、状态停驻 await_human、审批卡保留 + 卡内最小提示
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(card).toContainText('操作失败，可重试');
    await expect(page.getByLabel('消息输入框')).toBeDisabled();

    // 恢复：server 侧审批仍有效，卡决策（approve）→ 续跑完成订单闭环
    await card.getByRole('button', { name: '确认下单' }).click();
    await expect(page.getByTestId('order-result-card')).toContainText('订单号：order-e2e0001');
    await expect(assistantBubble(page)).toContainText('订单号 order-e2e0001');
    await expect(badge).toHaveText('已完成');
    await expect(page.getByLabel('消息输入框')).toBeEnabled();
});
