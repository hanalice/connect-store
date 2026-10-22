import { expect, test } from '@playwright/test';

/**
 * live 冒烟：真打 BFF + 上游 LLM，防「BFF 流格式漂移而 mock 过期」。
 * 不进默认门禁：默认 test:e2e 用 grepInvert 排除 @live。
 * 手动触发：先 npm run dev:bff，再 npm run test:e2e:live。
 */
test(
    'E2E-AI-09 live 冒烟：真打 BFF 发一条消息，增量文本出现',
    { tag: '@live' },
    async ({ page }) => {
        test.setTimeout(90_000);
        await page.goto('/#/assistant');
        await page.getByLabel('消息输入框').fill('请用三句话介绍你自己');
        await page.getByRole('button', { name: '发送' }).click();

        const bubble = page.getByRole('log').locator('> div').last().locator('> div');

        // 采样首个非「思考中」的正文文本作为增量起点
        let firstText = '';
        await expect
            .poll(
                async () => {
                    const text = (await bubble.textContent()) ?? '';
                    if (text && text !== '思考中…' && !firstText) {
                        firstText = text;
                    }
                    return firstText;
                },
                { timeout: 30_000 },
            )
            .not.toBe('');

        // 流正常结束：输入框恢复可用，最终文本比起始采样更长（增量渲染，非一次性整段）
        await expect(page.getByLabel('消息输入框')).toBeEnabled({ timeout: 60_000 });
        const finalText = (await bubble.textContent()) ?? '';
        expect(finalText.length).toBeGreaterThan(firstText.length);
        await expect(page.getByRole('alert')).toHaveCount(0);
    },
);
