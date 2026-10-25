import { expect, test, type Locator, type Page } from '@playwright/test';

/** mock BFF 控制面（直连 8787，不走页面代理）：放行 gated 场景的剩余帧。 */
const MOCK_BFF_ORIGIN = 'http://localhost:8787';

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

    // 真实 ProductCard（非纯文本）：aria-label 结构 {title} by {creator}, price …
    const cards = gridSection.locator('[role="button"]');
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
    await expect(bubble.locator('[role="button"]')).toHaveCount(0);
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

test('E2E-AI-17 删改与持久化：步进加量 / 删除 → 合计联动 → reload → badge 与 drawer 内容恢复（UT-CART-02/03）', async ({
    page,
}) => {
    await send(page, '__e2e_cart__');
    await fetch(`${MOCK_BFF_ORIGIN}/__release?gate=cart`);
    const drawer = page.getByRole('dialog', { name: '购物车' });
    const row = drawer.getByTestId('cart-item-p-cart-1');
    await expect(row.getByTestId('cart-quantity')).toHaveText('1');

    // 步进加量：1 → 2，小计 / 合计联动（12.50 → 25.00）
    await drawer.getByRole('button', { name: '增加 付费模板 Gamma' }).click();
    await expect(row.getByTestId('cart-quantity')).toHaveText('2');
    await expect(row.getByTestId('cart-subtotal')).toHaveText('$25.00');
    await expect(drawer.getByTestId('cart-total')).toHaveText('$25.00');

    // 刷新：persist 恢复——badge 计数与 drawer 内容（数量 2 / 合计 25.00）都在
    // drawer 开关属 UI 态不持久化（裁决③），reload 后通过 badge 重开
    await page.reload();
    const badge = page.getByRole('button', { name: '购物车，1 件商品' });
    await expect(badge).toBeVisible();
    await badge.click();
    const restored = page.getByRole('dialog', { name: '购物车' });
    const restoredRow = restored.getByTestId('cart-item-p-cart-1');
    await expect(restoredRow.getByTestId('cart-quantity')).toHaveText('2');
    await expect(restoredRow.getByTestId('cart-subtotal')).toHaveText('$25.00');
    await expect(restored.getByTestId('cart-total')).toHaveText('$25.00');

    // 删除单项：合计归零、空态文案出现
    await restored.getByRole('button', { name: '删除 付费模板 Gamma' }).click();
    await expect(restored.getByTestId('cart-total')).toHaveText('$0.00');
    await expect(restored.getByText('购物车是空的')).toBeVisible();
});
