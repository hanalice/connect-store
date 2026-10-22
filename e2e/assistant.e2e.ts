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
