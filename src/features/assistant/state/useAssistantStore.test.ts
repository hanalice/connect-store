import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIMessageChunk } from 'ai';

import { ChatApiError } from '../services/chatApi';
import { useCartStore } from '../../cart/store/useCartStore';
import { useAssistantStore } from './useAssistantStore';

// mock 传输层：用受控 chunk 序列驱动 store，保证测试确定性（LLM 是不确定依赖）
vi.mock('../services/chatApi', async (importOriginal) => {
    const original = await importOriginal<typeof import('../services/chatApi')>();
    return { ...original, streamChat: vi.fn() };
});

// spy 状态机工厂：捕获 machine 实例以断言事件序列与日志（不改变表与 send 语义）
vi.mock('./assistantMachine', async (importOriginal) => {
    const original = await importOriginal<typeof import('./assistantMachine')>();
    return { ...original, createAssistantMachine: vi.fn(original.createAssistantMachine) };
});

import { streamChat } from '../services/chatApi';
import { createAssistantMachine } from './assistantMachine';

const mockStreamChat = vi.mocked(streamChat);
const mockCreateMachine = vi.mocked(createAssistantMachine);

type StreamChatOptions = Parameters<typeof streamChat>[0];

/** 让 mock 的 streamChat 按序吐出 chunks 后正常结束（同步连发，中间态不可观察）。 */
function streamChunks(chunks: UIMessageChunk[]) {
    mockStreamChat.mockImplementation(async ({ onChunk }: StreamChatOptions) => {
        for (const chunk of chunks) {
            onChunk(chunk);
        }
    });
}

/** 步进闸门驱动（A6 单测版）：测试按帧 emit 并断言中间态，无 sleep 赌时序。 */
function streamChunksStepwise() {
    const queue: UIMessageChunk[] = [];
    let ended = false;
    let notify: (() => void) | null = null;
    mockStreamChat.mockImplementation(({ onChunk }: StreamChatOptions) =>
        (async () => {
            for (;;) {
                while (queue.length === 0 && !ended) {
                    await new Promise<void>((resolve) => {
                        notify = resolve;
                    });
                }
                if (queue.length === 0 && ended) return;
                const chunk = queue.shift();
                if (chunk === undefined) continue;
                onChunk(chunk);
            }
        })(),
    );
    return {
        emit(chunk: UIMessageChunk) {
            queue.push(chunk);
            notify?.();
        },
        end() {
            ended = true;
            notify?.();
        },
    };
}

const SEARCH_INPUT = {
    type: 'tool-input-available',
    toolCallId: 'call-1',
    toolName: 'searchCatalog',
    input: { query: '免费素材', pricingOption: 1 },
} as UIMessageChunk;
const SEARCH_OUTPUT = {
    type: 'tool-output-available',
    toolCallId: 'call-1',
    output: { items: [{ id: 'p1' }], total: 1 },
} as UIMessageChunk;

/** G3.1 接线测试用的 addToCart 输入帧 / 成功回执帧（镜像 server 契约三字段）。 */
const CART_PRODUCT = {
    id: 'p-cart-1',
    creator: 'Creator C',
    title: '付费模板 Gamma',
    pricingOption: 0,
    imagePath: '',
    price: 12.5,
} as const;
const ADD_TO_CART_INPUT = {
    type: 'tool-input-available',
    toolCallId: 'call-cart',
    toolName: 'addToCart',
    input: { productId: 'p-cart-1', quantity: 1 },
} as UIMessageChunk;
const ADD_TO_CART_OUTPUT = {
    type: 'tool-output-available',
    toolCallId: 'call-cart',
    output: { productId: 'p-cart-1', quantity: 1, product: CART_PRODUCT },
} as UIMessageChunk;
const TEXT_TAIL = [
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: '回复' },
    { type: 'text-end', id: 't1' },
    { type: 'finish', finishReason: 'stop' },
] as UIMessageChunk[];

describe('useAssistantStore', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // G3.1：购物车隔离——清 localStorage 并重置 cart store，防接线用例间污染
        localStorage.clear();
        useCartStore.setState({ items: [], isOpen: false });
        useAssistantStore.getState().reset();
    });

    it('发送消息：text-delta 与 reasoning-delta 分开累积，text-start 才进 streaming，回合终态 done（9 态语义）', async () => {
        const driver = streamChunksStepwise();

        const sending = useAssistantStore.getState().sendMessage('推荐免费的素材');
        driver.emit({ type: 'start' });
        driver.emit({ type: 'reasoning-start', id: 'r1' });
        driver.emit({ type: 'reasoning-delta', id: 'r1', delta: '用户在找' });
        driver.emit({ type: 'reasoning-delta', id: 'r1', delta: '免费素材' });
        // reasoning 期仍为 thinking（reasoning-delta 不产生 machine 事件）
        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('thinking');
        });
        expect(useAssistantStore.getState().messages[1]?.reasoning).toBe('用户在找免费素材');

        driver.emit({ type: 'text-start', id: 't1' });
        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('streaming');
        });
        driver.emit({ type: 'text-delta', id: 't1', delta: '推荐这些' });
        driver.emit({ type: 'text-end', id: 't1' });
        driver.emit({ type: 'finish', finishReason: 'stop' });
        driver.end();
        await sending;

        const { messages, status } = useAssistantStore.getState();
        // 流正常结束 → STREAM_END → done（G2.3 9 态终态，不再回 idle）
        expect(status).toBe('done');
        expect(messages).toHaveLength(2);
        expect(messages[0]).toMatchObject({ role: 'user', text: '推荐免费的素材' });
        expect(messages[1]).toMatchObject({
            role: 'assistant',
            text: '推荐这些',
            reasoning: '用户在找免费素材',
        });
        // 请求体只包含 user 消息（assistant 占位消息不应发出去）
        const sentMessages = mockStreamChat.mock.calls[0][0].messages;
        expect(sentMessages).toEqual([
            { role: 'user', parts: [{ type: 'text', text: '推荐免费的素材' }] },
        ]);
    });

    it('点停止：abort 触发、状态停驻 aborted、保留已收到的部分内容（INT-AI-02）', async () => {
        mockStreamChat.mockImplementation(
            ({ signal, onChunk }: StreamChatOptions) =>
                new Promise<void>((_resolve, reject) => {
                    onChunk({ type: 'text-delta', id: 't1', delta: '前半段' } as UIMessageChunk);
                    signal.addEventListener('abort', () => {
                        reject(new DOMException('Aborted', 'AbortError'));
                    });
                }),
        );

        const sending = useAssistantStore.getState().sendMessage('讲个长答案');
        // text-delta 不产生 machine 事件：status 保持 thinking 直到 abort
        await vi.waitFor(() => {
            expect(useAssistantStore.getState().messages[1]?.text).toBe('前半段');
        });
        expect(useAssistantStore.getState().status).toBe('thinking');

        useAssistantStore.getState().abort();
        await sending;

        const { messages, status, error } = useAssistantStore.getState();
        expect(status).toBe('aborted');
        expect(error).toBeNull();
        expect(messages[1]?.text).toBe('前半段');
    });

    it('传输层失败：状态 error 且带明确文案，不清空消息（INT-AI-02）', async () => {
        const warnSpy = vi.spyOn(console, 'warn');
        mockStreamChat.mockRejectedValue(
            new ChatApiError('network', '无法连接服务器，请检查网络后重试'),
        );

        await useAssistantStore.getState().sendMessage('测试错误');

        const { messages, status, error } = useAssistantStore.getState();
        expect(status).toBe('error');
        expect(error).toContain('无法连接服务器');
        expect(messages).toHaveLength(2);
        // 查表预判静默跳过（thinking 无 ERROR 边的表缺口兜底），不产生 warn 噪音
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('aborted 后继续发消息：USER_SEND 直接恢复 thinking，无自动重发（design §5 出边约束，INT-AI-02）', async () => {
        mockStreamChat.mockImplementation(
            ({ signal }: StreamChatOptions) =>
                new Promise<void>((_resolve, reject) => {
                    signal.addEventListener('abort', () => {
                        reject(new DOMException('Aborted', 'AbortError'));
                    });
                }),
        );
        const first = useAssistantStore.getState().sendMessage('第一条');
        useAssistantStore.getState().abort();
        await first;
        expect(useAssistantStore.getState().status).toBe('aborted');

        streamChunks([
            { type: 'text-start', id: 't2' },
            { type: 'text-delta', id: 't2', delta: '新回复' },
            { type: 'text-end', id: 't2' },
            { type: 'finish', finishReason: 'stop' },
        ] as UIMessageChunk[]);
        await useAssistantStore.getState().sendMessage('第二条');

        const { messages, status } = useAssistantStore.getState();
        // 第二回合正常走完：streaming → done
        expect(status).toBe('done');
        expect(messages).toHaveLength(4);
        expect(messages[3]?.text).toBe('新回复');
    });

    it('streaming/thinking/tool 态中重复发送被忽略', async () => {
        mockStreamChat.mockImplementation(
            () => new Promise<void>(() => {}), // 永不结束
        );

        void useAssistantStore.getState().sendMessage('第一条');
        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('thinking');
        });
        await useAssistantStore.getState().sendMessage('第二条');

        expect(mockStreamChat).toHaveBeenCalledTimes(1);
        expect(useAssistantStore.getState().messages).toHaveLength(2);
        useAssistantStore.getState().reset();
    });

    it('流式错误分流：error chunk → error 态带文案，再发送 RETRY → USER_SEND 恢复（INT-AI-02）', async () => {
        const warnSpy = vi.spyOn(console, 'warn');
        // 对齐真实 chatApi 行为：error chunk 抛出 ChatApiError（前半段帧已透传）
        mockStreamChat.mockImplementationOnce(async ({ onChunk }: StreamChatOptions) => {
            onChunk({ type: 'text-start', id: 't1' } as UIMessageChunk);
            onChunk({ type: 'text-delta', id: 't1', delta: '前半段' } as UIMessageChunk);
            throw new ChatApiError('stream', '上游模型服务错误（HTTP 500）');
        });

        await useAssistantStore.getState().sendMessage('会失败的问题');
        let state = useAssistantStore.getState();
        expect(state.status).toBe('error');
        expect(state.error).toContain('上游模型服务错误');
        expect(state.messages[1]?.text).toBe('前半段');

        streamChunks([
            { type: 'text-start', id: 't2' },
            { type: 'text-delta', id: 't2', delta: '恢复后的回复' },
            { type: 'text-end', id: 't2' },
            { type: 'finish', finishReason: 'stop' },
        ] as UIMessageChunk[]);
        await useAssistantStore.getState().sendMessage('再试一次');

        state = useAssistantStore.getState();
        expect(state.status).toBe('done');
        expect(state.messages).toHaveLength(4);
        expect(state.messages[3]?.text).toBe('恢复后的回复');
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('工具失败分流：tool-output-error → error 态带工具失败文案（INT-AI-02）', async () => {
        streamChunks([
            SEARCH_INPUT,
            {
                type: 'tool-output-error',
                toolCallId: 'call-1',
                errorText: 'catalog snapshot unavailable',
            } as UIMessageChunk,
            { type: 'finish', finishReason: 'stop' },
        ] as UIMessageChunk[]);

        await useAssistantStore.getState().sendMessage('查一下素材');

        const { status, error, messages } = useAssistantStore.getState();
        expect(status).toBe('error');
        expect(error).toContain('工具调用失败');
        expect(error).toContain('catalog snapshot unavailable');
        const call = messages[1]?.toolCalls?.[0];
        expect(call).toMatchObject({
            toolName: 'searchCatalog',
            error: 'catalog snapshot unavailable',
        });
        expect(call?.endedAt).toBeDefined();
    });

    it('单工具全链路：tool_calling → tool_result → streaming → done，toolCalls 与 machine 事件序列断言（INT-AI-03）', async () => {
        const driver = streamChunksStepwise();

        const sending = useAssistantStore.getState().sendMessage('找免费素材');
        driver.emit({ type: 'start' });
        driver.emit({ type: 'start-step' });
        driver.emit(SEARCH_INPUT);
        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('tool_calling');
        });
        driver.emit(SEARCH_OUTPUT);
        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('tool_result');
        });
        driver.emit({ type: 'text-start', id: 't1' });
        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('streaming');
        });
        driver.emit({ type: 'text-delta', id: 't1', delta: '为你找到 1 个免费素材' });
        driver.emit({ type: 'text-end', id: 't1' });
        driver.emit({ type: 'finish', finishReason: 'stop' });
        driver.end();
        await sending;

        const { status, messages } = useAssistantStore.getState();
        expect(status).toBe('done');
        const call = messages[1]?.toolCalls?.[0];
        expect(call).toMatchObject({
            toolCallId: 'call-1',
            toolName: 'searchCatalog',
            input: { query: '免费素材', pricingOption: 1 },
            output: { items: [{ id: 'p1' }], total: 1 },
        });
        expect(call?.startedAt).toBeDefined();
        expect(call?.endedAt).toBeGreaterThanOrEqual(call?.startedAt ?? 0);

        // machine 事件序列（渲染层不读 log，此处仅审计接线正确性）
        const machine = mockCreateMachine.mock.results[0]?.value;
        expect(machine).toBeDefined();
        expect(machine.state).toBe('done');
        expect(machine.log.map((entry: { event: string }) => entry.event)).toEqual([
            'USER_SEND',
            'TOOL_CALL',
            'TOOL_RESULT',
            'STREAM_START',
            'STREAM_END',
        ]);
        expect(machine.log[1]).toMatchObject({
            from: 'thinking',
            to: 'tool_calling',
            tool: 'searchCatalog',
            args: { query: '免费素材', pricingOption: 1 },
        });
        expect(machine.log[2]).toMatchObject({ from: 'tool_calling', to: 'tool_result' });
        expect(machine.log[2].durationMs).toBeGreaterThanOrEqual(0);
        expect(machine.log[3]).toMatchObject({ from: 'tool_result', to: 'streaming' });
        expect(machine.log[4]).toMatchObject({ from: 'streaming', to: 'done' });
    });

    it('多工具循环：searchCatalog → getProductDetails 两卡并行累积，tool_result → tool_calling 再入（INT-AI-03）', async () => {
        streamChunks([
            SEARCH_INPUT,
            SEARCH_OUTPUT,
            {
                type: 'tool-input-available',
                toolCallId: 'call-2',
                toolName: 'getProductDetails',
                input: { id: 'p1' },
            } as UIMessageChunk,
            {
                type: 'tool-output-available',
                toolCallId: 'call-2',
                output: { product: { id: 'p1', title: '免费素材 A' } },
            } as UIMessageChunk,
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: '详情如上' },
            { type: 'text-end', id: 't1' },
            { type: 'finish', finishReason: 'stop' },
        ] as UIMessageChunk[]);

        await useAssistantStore.getState().sendMessage('找素材并看详情');

        const { status, messages } = useAssistantStore.getState();
        expect(status).toBe('done');
        const toolCalls = messages[1]?.toolCalls ?? [];
        expect(toolCalls).toHaveLength(2);
        expect(toolCalls[0]).toMatchObject({ toolName: 'searchCatalog', toolCallId: 'call-1' });
        expect(toolCalls[1]).toMatchObject({
            toolName: 'getProductDetails',
            toolCallId: 'call-2',
            output: { product: { id: 'p1', title: '免费素材 A' } },
        });

        const machine = mockCreateMachine.mock.results[0]?.value;
        expect(machine.log.map((entry: { event: string }) => entry.event)).toEqual([
            'USER_SEND',
            'TOOL_CALL',
            'TOOL_RESULT',
            'TOOL_CALL',
            'TOOL_RESULT',
            'STREAM_START',
            'STREAM_END',
        ]);
        // UT-ASM-03 口径：tool_result → TOOL_CALL 再入 tool_calling
        expect(machine.log[3]).toMatchObject({ from: 'tool_result', to: 'tool_calling' });
    });

    it('回合边界：done 后第二回合新建机且首回合日志不污染；abort 后旧流收尾不顶 aborted 且零 warn（INT-AI-03）', async () => {
        const warnSpy = vi.spyOn(console, 'warn');
        // 第一回合：正常文本回合 → done
        streamChunks([
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: '第一回合回复' },
            { type: 'text-end', id: 't1' },
            { type: 'finish', finishReason: 'stop' },
        ] as UIMessageChunk[]);
        await useAssistantStore.getState().sendMessage('第一回合');
        expect(useAssistantStore.getState().status).toBe('done');
        const firstMachine = mockCreateMachine.mock.results[0]?.value;
        expect(firstMachine.log).toHaveLength(3); // USER_SEND / STREAM_START / STREAM_END

        // 第二回合：done 终态 → 新建机，第一回合日志不被污染
        streamChunks([
            { type: 'text-start', id: 't2' },
            { type: 'text-delta', id: 't2', delta: '第二回合回复' },
            { type: 'text-end', id: 't2' },
            { type: 'finish', finishReason: 'stop' },
        ] as UIMessageChunk[]);
        await useAssistantStore.getState().sendMessage('第二回合');
        expect(mockCreateMachine).toHaveBeenCalledTimes(2);
        const secondMachine = mockCreateMachine.mock.results[1]?.value;
        expect(secondMachine).not.toBe(firstMachine);
        expect(firstMachine.log).toHaveLength(3);
        expect(secondMachine.state).toBe('done');

        // 第三回合：tool_calling 中 abort，旧流收尾帧（TOOL_RESULT / STREAM_START）不得顶掉 aborted
        mockStreamChat.mockImplementation(
            ({ signal, onChunk }: StreamChatOptions) =>
                new Promise<void>((_resolve, reject) => {
                    onChunk(SEARCH_INPUT);
                    signal.addEventListener('abort', () => {
                        onChunk(SEARCH_OUTPUT);
                        onChunk({ type: 'text-start', id: 't3' } as UIMessageChunk);
                        onChunk({ type: 'finish', finishReason: 'stop' } as UIMessageChunk);
                        reject(new DOMException('Aborted', 'AbortError'));
                    });
                }),
        );
        const sending = useAssistantStore.getState().sendMessage('第三回合');
        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('tool_calling');
        });
        useAssistantStore.getState().abort();
        await sending;

        expect(useAssistantStore.getState().status).toBe('aborted');
        const thirdMachine = mockCreateMachine.mock.results[2]?.value;
        expect(thirdMachine.state).toBe('aborted');
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('网络失败后 machine 滞留态续跑新回合：正常完成且零 warn（表缺口兜底，INT-AI-02）', async () => {
        const warnSpy = vi.spyOn(console, 'warn');
        // 首回合：首帧前网络失败（thinking 无 ERROR 边，machine 滞留 thinking，store 直设 error）
        mockStreamChat.mockRejectedValueOnce(
            new ChatApiError('network', '无法连接服务器，请检查网络后重试'),
        );
        await useAssistantStore.getState().sendMessage('第一条');
        expect(useAssistantStore.getState().status).toBe('error');
        const machine = mockCreateMachine.mock.results[0]?.value;
        expect(machine.state).toBe('thinking'); // 表缺口：machine 未达 error

        // 再发送：滞留态无 RETRY/USER_SEND 边可发（静默跳过），新流事件从 thinking 续跑
        streamChunks([
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: '恢复后的回复' },
            { type: 'text-end', id: 't1' },
            { type: 'finish', finishReason: 'stop' },
        ] as UIMessageChunk[]);
        await useAssistantStore.getState().sendMessage('第二条');

        expect(useAssistantStore.getState().status).toBe('done');
        expect(mockCreateMachine).toHaveBeenCalledTimes(1); // 一回合一机，未弃机
        expect(machine.log.map((entry: { event: string }) => entry.event)).toEqual([
            'USER_SEND',
            'STREAM_START',
            'STREAM_END',
        ]);
        expect(warnSpy).not.toHaveBeenCalled();
    });

    it('G3.1 addToCart 接线（裁决④）：成功回执 → 写入购物车 + drawer 自动打开；重复加购数量合并', async () => {
        streamChunks([ADD_TO_CART_INPUT, ADD_TO_CART_OUTPUT, ...TEXT_TAIL]);
        await useAssistantStore.getState().sendMessage('把付费模板 Gamma 加进购物车');

        const cart = useCartStore.getState();
        expect(cart.items).toHaveLength(1);
        expect(cart.items[0]).toEqual({ product: CART_PRODUCT, quantity: 1 });
        expect(cart.isOpen).toBe(true); // 裁决⑤ 触发①：回执成功 drawer 自动打开

        // 同商品再次加购：数量合并不新增条目行（UT-CART-01 接线侧）
        streamChunks([ADD_TO_CART_INPUT, ADD_TO_CART_OUTPUT, ...TEXT_TAIL]);
        await useAssistantStore.getState().sendMessage('再买一件');
        expect(useCartStore.getState().items).toHaveLength(1);
        expect(useCartStore.getState().items[0].quantity).toBe(2);
        expect(useCartStore.getState().isOpen).toBe(true);
    });

    it('G3.1 addToCart 接线：error 回执（product not found）→ 不写购物车、不打开 drawer', async () => {
        streamChunks([
            ADD_TO_CART_INPUT,
            {
                type: 'tool-output-available',
                toolCallId: 'call-cart',
                output: { error: 'product not found: p-x' },
            } as UIMessageChunk,
            ...TEXT_TAIL,
        ]);
        await useAssistantStore.getState().sendMessage('加一个不存在的东西');

        expect(useCartStore.getState().items).toHaveLength(0);
        expect(useCartStore.getState().isOpen).toBe(false);
    });

    it('G3.1 addToCart 接线：zod 校验失败的畸形回执（quantity 非正整数）→ 不写购物车', async () => {
        streamChunks([
            ADD_TO_CART_INPUT,
            {
                type: 'tool-output-available',
                toolCallId: 'call-cart',
                output: { productId: 'p-cart-1', quantity: -1, product: CART_PRODUCT },
            } as UIMessageChunk,
            ...TEXT_TAIL,
        ]);
        await useAssistantStore.getState().sendMessage('触发畸形回执');

        expect(useCartStore.getState().items).toHaveLength(0);
        expect(useCartStore.getState().isOpen).toBe(false);
    });

    it('G3.1 addToCart 接线：非 addToCart 工具（searchCatalog）回执 → 不触发购物车写入', async () => {
        streamChunks([SEARCH_INPUT, SEARCH_OUTPUT, ...TEXT_TAIL]);
        await useAssistantStore.getState().sendMessage('找免费素材');

        expect(useCartStore.getState().items).toHaveLength(0);
        expect(useCartStore.getState().isOpen).toBe(false);
    });
});
