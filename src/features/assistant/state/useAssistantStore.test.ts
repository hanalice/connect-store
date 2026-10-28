import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UIMessageChunk } from 'ai';

import { ChatApiError } from '../services/chatApi';
import { useCartStore } from '../../cart/store/useCartStore';
import { useCatalogStore } from '../../catalog/store/useCatalogStore';
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
/** G5.1 裁决①-b 接线测试用的 clearCart 输入帧 / 成功回执帧（镜像 server 契约 { cleared: true }）。 */
const CLEAR_CART_INPUT = {
    type: 'tool-input-available',
    toolCallId: 'call-clear',
    toolName: 'clearCart',
    input: {},
} as UIMessageChunk;
const CLEAR_CART_OUTPUT = {
    type: 'tool-output-available',
    toolCallId: 'call-clear',
    output: { cleared: true },
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

    it('G5.1 clearCart 接线（裁决①-b）：成功回执 → 购物车清空 + drawer 自动打开（唯一清空通道）', async () => {
        // 预置条目（等价于此前 addToCart 回执已写入）：
        // CART_PRODUCT 是 as const 夹具，Product 数字枚举兼容字面量 0（pricingOption: PricingOption）
        useCartStore.getState().add({ ...CART_PRODUCT }, 2);
        useCartStore.getState().close();

        streamChunks([CLEAR_CART_INPUT, CLEAR_CART_OUTPUT, ...TEXT_TAIL]);
        await useAssistantStore.getState().sendMessage('清空购物车');

        const cart = useCartStore.getState();
        expect(cart.items).toHaveLength(0); // 清空生效
        expect(cart.itemCount()).toBe(0);
        expect(cart.totalPrice()).toBe(0);
        expect(cart.isOpen).toBe(true); // 镜像 addToCart：回执成功 drawer 自动打开（投影确认）
    });

    it('G5.1 clearCart 接线：error 回执 / 畸形回执（cleared 非 true）→ 不清空、不打开 drawer', async () => {
        useCartStore.getState().add({ ...CART_PRODUCT }, 1);
        useCartStore.getState().close();

        streamChunks([
            CLEAR_CART_INPUT,
            {
                type: 'tool-output-available',
                toolCallId: 'call-clear',
                output: { error: 'clear failed' },
            } as UIMessageChunk,
            ...TEXT_TAIL,
        ]);
        await useAssistantStore.getState().sendMessage('清空购物车（error 变体）');
        expect(useCartStore.getState().items).toHaveLength(1); // 未清空
        expect(useCartStore.getState().isOpen).toBe(false);

        streamChunks([
            CLEAR_CART_INPUT,
            {
                type: 'tool-output-available',
                toolCallId: 'call-clear',
                output: { cleared: false },
            } as UIMessageChunk,
            ...TEXT_TAIL,
        ]);
        await useAssistantStore.getState().sendMessage('清空购物车（畸形变体）');
        expect(useCartStore.getState().items).toHaveLength(1); // zod 校验失败不写
        expect(useCartStore.getState().isOpen).toBe(false);
    });
});

/** G3.3 审批接线测试用的 placeOrder 帧序列（镜像 ai@7 帧字段，裁决④类型核对结论）。 */
const ORDER_INPUT_RAW = {
    items: [
        { productId: 'p-order-1', quantity: 1 },
        { productId: 'p-order-2', quantity: 2 },
    ],
};
const ORDER_INPUT = {
    type: 'tool-input-available',
    toolCallId: 'call-order-1',
    toolName: 'placeOrder',
    input: ORDER_INPUT_RAW,
} as UIMessageChunk;
const ORDER_APPROVAL = {
    type: 'tool-approval-request',
    approvalId: 'appr-1',
    toolCallId: 'call-order-1',
    reason: 'placeOrder requires approval',
    signature: 'sig-1',
} as UIMessageChunk;
/** 首回合：正文 → 下单工具调用 → 审批请求（hang but safe：帧后流即结束）。 */
const ORDER_ROUND = [
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: '已为你选好商品，请确认订单。' },
    { type: 'text-end', id: 't1' },
    ORDER_INPUT,
    ORDER_APPROVAL,
    { type: 'finish', finishReason: 'tool-calls' },
] as UIMessageChunk[];

/** 首回合跑到 await_human + approval pending（审批卡可操作态）。 */
async function reachAwaitHuman() {
    streamChunks(ORDER_ROUND);
    await useAssistantStore.getState().sendMessage('帮我下单');
    expect(useAssistantStore.getState().status).toBe('await_human');
    expect(useAssistantStore.getState().approval).toMatchObject({
        approvalId: 'appr-1',
        toolCallId: 'call-order-1',
        toolName: 'placeOrder',
        signature: 'sig-1',
        requestReason: 'placeOrder requires approval',
        phase: 'pending',
    });
}

describe('useAssistantStore G3.3 审批接线（裁决③④⑤）', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        useCartStore.setState({ items: [], isOpen: false });
        // G3.3b（D11 方案 B）：edit 重发用户消息的标题解析读目录快照（与审批卡同款数据源，
        // ChatPanel 解析 ApprovalCardItem 的同一份）——种子两条订单夹具商品
        useCatalogStore.setState({
            products: [
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
            ],
        });
        useAssistantStore.getState().reset();
    });

    it('tool-approval-request 帧 → APPROVAL_REQUEST 事件 + await_human 投影 + 审批数据落状态（含 TTL 推导）', async () => {
        await reachAwaitHuman();

        const { approval } = useAssistantStore.getState();
        expect(approval).not.toBeNull();
        expect(approval!.items).toEqual([
            { productId: 'p-order-1', quantity: 1 },
            { productId: 'p-order-2', quantity: 2 },
        ]);
        // 帧无 expiresAt：客户端推导 = 收帧时刻 + APPROVAL_TTL_MS（300_000，server 同口径）
        expect(approval!.expiresAt - approval!.requestedAt).toBe(300_000);
        expect(Date.now() - approval!.requestedAt).toBeLessThan(5_000);

        const machine = mockCreateMachine.mock.results[0]?.value;
        expect(machine.state).toBe('await_human');
        // 裁决⑥表缺口：streaming + TOOL_CALL 不在表内（模型先正文后调工具）——
        // 查表静默跳过（无 TOOL_CALL 日志 entry），工具卡照常登记，APPROVAL_REQUEST 从 streaming 合法出边
        expect(machine.log.map((entry: { event: string }) => entry.event)).toEqual([
            'USER_SEND',
            'STREAM_START',
            'APPROVAL_REQUEST',
        ]);
        expect(machine.log[2]).toMatchObject({ from: 'streaming', to: 'await_human' });
    });

    it('多步回合（先搜索后下单）：approval-request 时 machine 滞留 tool_calling，收尾兜底不得顶掉 await_human（live 2026-10-26 复现回归）', async () => {
        // 模型先 searchCatalog（TOOL_CALL/TOOL_RESULT）再 placeOrder —— 审批帧到达时
        // machine 在 tool_calling（APPROVAL_REQUEST 表缺口，store 兜底 await_human）；
        // 流收尾时 machine 仍滞留 tool_calling：忙碌态兜底必须让位审批 pending
        streamChunks([
            SEARCH_INPUT,
            SEARCH_OUTPUT,
            ORDER_INPUT,
            ORDER_APPROVAL,
            { type: 'finish', finishReason: 'tool-calls' },
        ] as UIMessageChunk[]);
        await useAssistantStore.getState().sendMessage('找免费素材并下单');

        const state = useAssistantStore.getState();
        expect(state.status).toBe('await_human'); // 不得被收尾兜底顶成 done
        expect(state.approval).toMatchObject({ approvalId: 'appr-1', phase: 'pending' });
        // 审批卡可操作：compose 锁定语义成立（abort 可取消）
        useAssistantStore.getState().cancelOrder();
        expect(useAssistantStore.getState().status).toBe('aborted');
    });

    it('await_human 期间发送新消息被拒（输入由审批卡承接，防表缺口死锁）', async () => {
        await reachAwaitHuman();
        await useAssistantStore.getState().sendMessage('换个话题');
        expect(mockStreamChat).toHaveBeenCalledTimes(1);
        expect(useAssistantStore.getState().status).toBe('await_human');
    });

    it('approve → APPROVE 事件（→tool_calling）+ 回放 part（approved + 签名回环）→ 订单回执 → done（INT-HITL-01）', async () => {
        await reachAwaitHuman();

        // 回放响应：执行回执 + 订单号文本
        mockStreamChat.mockImplementation(async ({ onChunk }: StreamChatOptions) => {
            onChunk({
                type: 'tool-output-available',
                toolCallId: 'call-order-1',
                output: { orderId: 'ord-1', orderNumber: 'order-test01', amount: 25 },
            } as UIMessageChunk);
            onChunk({ type: 'text-start', id: 't2' } as UIMessageChunk);
            onChunk({
                type: 'text-delta',
                id: 't2',
                delta: '订单已提交，订单号 order-test01，合计 $25.00。',
            } as UIMessageChunk);
            onChunk({ type: 'text-end', id: 't2' } as UIMessageChunk);
            onChunk({ type: 'finish', finishReason: 'stop' } as UIMessageChunk);
        });
        useAssistantStore.getState().approve();
        expect(useAssistantStore.getState().approval?.phase).toBe('approved');

        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('done');
        });

        // 回放请求体：历史 + 目标 assistant 消息含 approval-responded part（approved + 签名回环）
        expect(mockStreamChat).toHaveBeenCalledTimes(2);
        const replayMessages = mockStreamChat.mock.calls[1][0].messages;
        expect(replayMessages[1].parts[1]).toEqual({
            type: 'tool-placeOrder',
            toolCallId: 'call-order-1',
            state: 'approval-responded',
            input: ORDER_INPUT_RAW,
            approval: {
                id: 'appr-1',
                approved: true,
                requestReason: 'placeOrder requires approval',
                signature: 'sig-1',
            },
        });

        const state = useAssistantStore.getState();
        // 订单回执落在发起审批的旧消息工具卡上（全局按 toolCallId 补登）
        expect(state.messages[1]?.toolCalls?.[0]?.output).toMatchObject({
            orderNumber: 'order-test01',
            amount: 25,
        });
        expect(state.messages[2]?.text).toContain('order-test01');

        const machine = mockCreateMachine.mock.results[0]?.value;
        expect(machine.state).toBe('done');
        expect(machine.log.map((entry: { event: string }) => entry.event)).toEqual([
            'USER_SEND',
            'STREAM_START',
            'APPROVAL_REQUEST',
            'APPROVE',
            'TOOL_RESULT',
            'STREAM_START',
            'STREAM_END',
        ]);
        expect(machine.log[3]).toMatchObject({ from: 'await_human', to: 'tool_calling' });
    });

    it('reject(reason) → REJECT 事件（→thinking）+ 回放 part 携带 reason + tool-output-denied 落卡 + 修正文本（INT-HITL-02）', async () => {
        await reachAwaitHuman();

        // 回放响应：deny（execution-denied 的 UI 帧）+ 修正方案文本
        mockStreamChat.mockImplementation(async ({ onChunk }: StreamChatOptions) => {
            onChunk({
                type: 'tool-output-denied',
                toolCallId: 'call-order-1',
                toolName: 'placeOrder',
            } as UIMessageChunk);
            onChunk({ type: 'text-start', id: 't2' } as UIMessageChunk);
            onChunk({
                type: 'text-delta',
                id: 't2',
                delta: '明白，用户觉得太贵了。推荐免费的替代商品：免费素材 Alpha。',
            } as UIMessageChunk);
            onChunk({ type: 'text-end', id: 't2' } as UIMessageChunk);
            onChunk({ type: 'finish', finishReason: 'stop' } as UIMessageChunk);
        });
        useAssistantStore.getState().reject('太贵了');
        expect(useAssistantStore.getState().approval).toMatchObject({
            phase: 'rejected',
            decisionReason: '太贵了',
        });

        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('done');
        });

        const replayMessages = mockStreamChat.mock.calls[1][0].messages;
        expect(replayMessages[1].parts[1]).toMatchObject({
            type: 'tool-placeOrder',
            state: 'approval-responded',
            approval: { id: 'appr-1', approved: false, reason: '太贵了' },
        });

        const state = useAssistantStore.getState();
        // deny 帧落工具卡（deniedReason），修正文本落在回放的新 assistant 消息
        expect(state.messages[1]?.toolCalls?.[0]?.deniedReason).toBe('太贵了');
        expect(state.messages[2]?.text).toContain('免费的替代商品');

        const machine = mockCreateMachine.mock.results[0]?.value;
        expect(machine.log.map((entry: { event: string }) => entry.event)).toEqual([
            'USER_SEND',
            'STREAM_START',
            'APPROVAL_REQUEST',
            'REJECT',
            'STREAM_START',
            'STREAM_END',
        ]);
        expect(machine.log[3]).toMatchObject({ from: 'await_human', to: 'thinking' });
        expect(machine.log[4]).toMatchObject({ from: 'thinking', to: 'streaming' });
    });

    it('editOrder（D11 方案 B，G3.3b）：请求体 = 截断历史（剔除含未应答审批的 assistant 消息）+ [订单修改重发] 用户消息，纯 text part 无 tool 残留', async () => {
        await reachAwaitHuman();
        const oldMessageId = useAssistantStore.getState().messages[1]?.id;

        // 第二回合（edit 重发）：模型按 prompt 硬约束重新发起 placeOrder → 新审批挂起
        mockStreamChat.mockImplementation(async ({ onChunk }: StreamChatOptions) => {
            onChunk({
                type: 'tool-input-available',
                toolCallId: 'call-edit-1',
                toolName: 'placeOrder',
                input: { items: [{ productId: 'p-order-2', quantity: 1 }] },
            } as UIMessageChunk);
            onChunk({
                type: 'tool-approval-request',
                approvalId: 'appr-2',
                toolCallId: 'call-edit-1',
                reason: 'placeOrder requires approval',
                signature: 'sig-2',
            } as UIMessageChunk);
            onChunk({ type: 'finish', finishReason: 'tool-calls' } as UIMessageChunk);
        });
        useAssistantStore.getState().editOrder([{ productId: 'p-order-2', quantity: 1 }]);

        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('await_human');
        });

        // 消息历史截断不变式（G3.3b 裁决①，防 MissingToolResultsError 复发）：
        // 请求体 = [user 帮我下单, user edit 重发] —— 发起旧审批的 assistant 消息整体剔除
        const replayMessages = mockStreamChat.mock.calls[1][0].messages;
        expect(replayMessages).toHaveLength(2);
        expect(replayMessages[0]).toEqual({
            role: 'user',
            parts: [{ type: 'text', text: '帮我下单' }],
        });
        // 末条 = edit 用户消息：固定标记 + 人读清单（标题 × 数量，目录快照解析，单测锁格式）
        expect(replayMessages[1].role).toBe('user');
        expect(replayMessages[1].parts).toEqual([
            {
                type: 'text',
                text: '[订单修改重发] 请按以下清单重新下单：音效包 Beta × 1。请直接调用 placeOrder 工具提交（会再次经过审批），无需向我确认。',
            },
        ]);
        // 任何消息不含 tool-placeOrder part / tool-approval-request 的未应答残留（请求体纯 text）
        const serialized = JSON.stringify(replayMessages);
        expect(serialized).not.toContain('tool-');
        expect(serialized).not.toContain('call-order-1');
        expect(serialized).not.toContain('input-available');
        expect(serialized).not.toContain('approval-responded');
        expect(serialized).not.toContain('已为你选好商品'); // 旧 assistant 文本一并剔除
        // 本地面板保留旧消息（approvalSuperseded 投影锚点）+ 追加 edit 用户消息
        expect(useAssistantStore.getState().messages[1]?.id).toBe(oldMessageId);
        expect(useAssistantStore.getState().messages[2]).toMatchObject({
            role: 'user',
            text: expect.stringContaining('[订单修改重发]'),
        });
    });

    it('editOrder（D11 方案 B，G3.3b）：USER_SEND 查表静默跳过（machine 无 entry）+ EDIT 事件不再发送 + 新审批卡替换旧卡 + superseded 投影（INT-HITL-03）', async () => {
        await reachAwaitHuman();
        const oldMessageId = useAssistantStore.getState().messages[1]?.id;

        // 第二回合（edit 重发）：模型重新发起 placeOrder → 新审批挂起（新 toolCall 先登记，再挂起）
        mockStreamChat.mockImplementation(async ({ onChunk }: StreamChatOptions) => {
            onChunk({
                type: 'tool-input-available',
                toolCallId: 'call-edit-1',
                toolName: 'placeOrder',
                input: { items: [{ productId: 'p-order-2', quantity: 1 }] },
            } as UIMessageChunk);
            onChunk({
                type: 'tool-approval-request',
                approvalId: 'appr-2',
                toolCallId: 'call-edit-1',
                reason: 'placeOrder requires approval',
                signature: 'sig-2',
            } as UIMessageChunk);
            onChunk({ type: 'finish', finishReason: 'tool-calls' } as UIMessageChunk);
        });
        useAssistantStore.getState().editOrder([{ productId: 'p-order-2', quantity: 1 }]);

        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('await_human');
        });

        // 新审批卡替换旧卡：approval 状态整体换新；旧卡失效提示落 approvalSuperseded
        expect(useAssistantStore.getState().approvalSuperseded).toEqual({
            messageId: oldMessageId,
            note: '已修改并重新发起',
        });
        expect(useAssistantStore.getState().approval).toMatchObject({
            approvalId: 'appr-2',
            toolCallId: 'call-edit-1',
            signature: 'sig-2',
            items: [{ productId: 'p-order-2', quantity: 1 }],
            phase: 'pending',
        });

        // machine（G3.3b 裁决①）：await_human 无 USER_SEND 出边 → 查表静默跳过（无日志 entry）；
        // EDIT 事件不再发送（edit 不再是机器语义边的行使）；机器滞留 await_human，
        // 新审批帧到达时 store 兜底直设 await_human（新表缺口，登记报告 §三）
        const machine = mockCreateMachine.mock.results[0]?.value;
        expect(machine.log.map((entry: { event: string }) => entry.event)).toEqual([
            'USER_SEND',
            'STREAM_START',
            'APPROVAL_REQUEST',
        ]);
        expect(machine.state).toBe('await_human'); // machine 滞留，store 兜底 await_human
        expect(useAssistantStore.getState().status).toBe('await_human');
    });

    it('editOrder（D11 代价口径）：模型未重新发起 placeOrder（纯文本回复）→ 收尾兜底直设 done，UI 不滞留 await_human', async () => {
        await reachAwaitHuman();

        // 第二回合：模型只回文本、不调工具（D11 代价：edit→新卡非确定性 100%，护栏外场景）
        mockStreamChat.mockImplementation(async ({ onChunk }: StreamChatOptions) => {
            onChunk({ type: 'text-start', id: 't2' } as UIMessageChunk);
            onChunk({
                type: 'text-delta',
                id: 't2',
                delta: '抱歉，没能按清单发起下单，请换个说法。',
            } as UIMessageChunk);
            onChunk({ type: 'text-end', id: 't2' } as UIMessageChunk);
            onChunk({ type: 'finish', finishReason: 'stop' } as UIMessageChunk);
        });
        useAssistantStore.getState().editOrder([{ productId: 'p-order-2', quantity: 1 }]);

        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('done');
        });
        // 无新审批挂起：回合正常收官、输入恢复（EDIT_GAP_STATES 含 await_human 的兜底，
        // 防 machine 滞留 await_human 导致 composer 永久锁定）
        const state = useAssistantStore.getState();
        expect(state.approval?.phase).toBe('edited'); // 旧卡保持已修改投影，无 pending 新卡
        expect(state.error).toBeNull();
        expect(state.messages.at(-1)?.text).toContain('没能按清单发起下单');
    });

    it('edit 重发后的新卡 approve（D11 后全程表内边）：APPROVE 从 await_human 合法出边 → 执行回执 → done', async () => {
        await reachAwaitHuman();
        // 第一回合 edit 重发（新用户回合）：模型重新发起 placeOrder → 新审批挂起；
        // machine 滞留 await_human（USER_SEND 查表跳过，缺口登记 §三），store 兜底投影
        mockStreamChat.mockImplementationOnce(async ({ onChunk }: StreamChatOptions) => {
            onChunk({
                type: 'tool-input-available',
                toolCallId: 'call-edit-1',
                toolName: 'placeOrder',
                input: { items: [{ productId: 'p-order-2', quantity: 1 }] },
            } as UIMessageChunk);
            onChunk({
                type: 'tool-approval-request',
                approvalId: 'appr-2',
                toolCallId: 'call-edit-1',
                signature: 'sig-2',
            } as UIMessageChunk);
            onChunk({ type: 'finish', finishReason: 'tool-calls' } as UIMessageChunk);
        });
        useAssistantStore.getState().editOrder([{ productId: 'p-order-2', quantity: 1 }]);
        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('await_human');
        });

        // 第二轮回放：新卡 approve —— APPROVE 从 await_human → tool_calling（:97 表内边，
        // D11 后 edit 重发不再制造 machine 滞留缺口），回放帧全程合法出边
        mockStreamChat.mockImplementationOnce(async ({ onChunk }: StreamChatOptions) => {
            onChunk({
                type: 'tool-output-available',
                toolCallId: 'call-edit-1',
                output: { orderId: 'ord-2', orderNumber: 'order-edit02', amount: 7.5 },
            } as UIMessageChunk);
            onChunk({ type: 'text-start', id: 't3' } as UIMessageChunk);
            onChunk({
                type: 'text-delta',
                id: 't3',
                delta: '订单已提交，订单号 order-edit02。',
            } as UIMessageChunk);
            onChunk({ type: 'text-end', id: 't3' } as UIMessageChunk);
            onChunk({ type: 'finish', finishReason: 'stop' } as UIMessageChunk);
        });
        useAssistantStore.getState().approve();
        expect(useAssistantStore.getState().approval?.phase).toBe('approved');

        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('done');
        });

        // 全程表内边：APPROVE（await_human→tool_calling）→ TOOL_RESULT → STREAM_START → STREAM_END
        const machine = mockCreateMachine.mock.results[0]?.value;
        expect(machine.log.map((entry: { event: string }) => entry.event)).toEqual([
            'USER_SEND',
            'STREAM_START',
            'APPROVAL_REQUEST',
            'APPROVE',
            'TOOL_RESULT',
            'STREAM_START',
            'STREAM_END',
        ]);
        expect(machine.state).toBe('done');
        expect(useAssistantStore.getState().messages.at(-1)?.text).toContain('order-edit02');
    });

    it('G3.3c edit 同步（裁决①，PM 修订窄读）：editOrder 确认点 → 订单内对齐数量 + 移除删行；订单外手动加购行保留（Q-D-01 回归锁）', async () => {
        await reachAwaitHuman();
        // 预置购物车（await_human 期间手动加购 p-cart-1 属订单外行）：
        // p-order-1 ×5（原订单含，draft 改 ×2 → 对齐）、p-order-2 ×1（原订单含，draft 移除 → 删行）、
        // p-cart-1 ×1（订单外 → 必须保留）
        const products = useCatalogStore.getState().products;
        const productOrder1 = products.find((product) => product.id === 'p-order-1')!;
        const productOrder2 = products.find((product) => product.id === 'p-order-2')!;
        useCartStore.getState().add(productOrder1, 5);
        useCartStore.getState().add(productOrder2, 1);
        useCartStore.getState().add(CART_PRODUCT, 1);
        expect(useCartStore.getState().items).toHaveLength(3);

        // 第二回合（edit 重发）：模型纯文本回复（D11 代价口径），回合收尾 done
        mockStreamChat.mockImplementation(async ({ onChunk }: StreamChatOptions) => {
            onChunk({ type: 'text-start', id: 't2' } as UIMessageChunk);
            onChunk({
                type: 'text-delta',
                id: 't2',
                delta: '已按新清单重新发起。',
            } as UIMessageChunk);
            onChunk({ type: 'text-end', id: 't2' } as UIMessageChunk);
            onChunk({ type: 'finish', finishReason: 'stop' } as UIMessageChunk);
        });
        // 修改后 draft：p-order-1 数量改为 2、移除 p-order-2（editOrder 入参 = 审批卡 draft items；
        // align 作用域 = 被 edit 卡的原订单 items，即 approval.items）
        useAssistantStore.getState().editOrder([{ productId: 'p-order-1', quantity: 2 }]);
        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('done');
        });

        // editOrder 确认点（与 superseded 投影同处）cart 已按窄读语义对齐：
        // p-order-1 ×5→×2（draft 对齐）；p-order-2 删行（原订单含而 draft 移除）；
        // p-cart-1 订单外行保留（Q-D-01 回归锁：手动加购不被 edit 误删）
        const { items, isOpen } = useCartStore.getState();
        expect(items).toEqual([
            { product: productOrder1, quantity: 2 },
            { product: CART_PRODUCT, quantity: 1 },
        ]);
        expect(items.some((item) => item.product.id === 'p-order-2')).toBe(false);
        expect(isOpen).toBe(false); // 裁决③：edit 同步无任何 UI 行为变更（不自动开 drawer）
    });

    it('G3.3c 执行扣减（裁决②）：placeOrder 成功回执 → 按被 approve 卡的审批 items 扣减（clamp ≤0 删行），未含条目不动、不开 drawer', async () => {
        await reachAwaitHuman();
        // 预置购物车：p-order-1 ×2（订单含 1 → 扣后 ×1）、p-order-2 ×1（订单含 2 → clamp 归零删行）、
        // p-cart-1 ×3（订单未含 → 不动）
        const products = useCatalogStore.getState().products;
        useCartStore.getState().add(products.find((product) => product.id === 'p-order-1')!, 2);
        useCartStore.getState().add(products.find((product) => product.id === 'p-order-2')!, 1);
        useCartStore.getState().add(CART_PRODUCT, 3);

        // 回放：执行回执帧（镜像 server 契约：{orderId, orderNumber, amount}，无 items 字段——
        // 数据源必须是被 approve 那张卡的审批记录 items，而非输出帧）
        mockStreamChat.mockImplementation(async ({ onChunk }: StreamChatOptions) => {
            onChunk({
                type: 'tool-output-available',
                toolCallId: 'call-order-1',
                output: { orderId: 'ord-1', orderNumber: 'order-test01', amount: 25 },
            } as UIMessageChunk);
            onChunk({ type: 'text-start', id: 't2' } as UIMessageChunk);
            onChunk({
                type: 'text-delta',
                id: 't2',
                delta: '订单已提交，订单号 order-test01。',
            } as UIMessageChunk);
            onChunk({ type: 'text-end', id: 't2' } as UIMessageChunk);
            onChunk({ type: 'finish', finishReason: 'stop' } as UIMessageChunk);
        });
        useAssistantStore.getState().approve();
        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('done');
        });

        const { items, isOpen } = useCartStore.getState();
        expect(items).toHaveLength(2);
        expect(items.find((item) => item.product.id === 'p-order-1')).toMatchObject({
            quantity: 1, // 2 − 1 = 1
        });
        expect(items.some((item) => item.product.id === 'p-order-2')).toBe(false); // clamp ≤0 删行
        expect(items.find((item) => item.product.id === 'p-cart-1')).toMatchObject({
            quantity: 3, // 订单未含 → 不动
        });
        expect(isOpen).toBe(false); // 裁决③：执行扣减无任何 UI 行为变更（不自动开 drawer）
    });

    it('G3.3c 执行扣减（裁决②）：查无审批记录（无 approval-request 帧的无据场景）→ 跳过扣减，cart 不写', async () => {
        const products = useCatalogStore.getState().products;
        useCartStore.getState().add(products.find((product) => product.id === 'p-order-1')!, 2);
        useCartStore.getState().add(CART_PRODUCT, 3);

        // 模型发起 placeOrder 但无 approval-request 帧（刷新后回放等无据场景）：
        // tool-output-available 到达时 store 无 toolCallId 对应的审批记录 → 不得扣减
        streamChunks([
            ORDER_INPUT,
            {
                type: 'tool-output-available',
                toolCallId: 'call-order-1',
                output: { orderId: 'ord-x', orderNumber: 'order-noref01', amount: 10 },
            } as UIMessageChunk,
            ...TEXT_TAIL,
        ]);
        await useAssistantStore.getState().sendMessage('帮我下单');

        expect(useAssistantStore.getState().status).toBe('done');
        const { items } = useCartStore.getState();
        expect(items.find((item) => item.product.id === 'p-order-1')).toMatchObject({
            quantity: 2, // 查无审批记录 → 跳过扣减，数量原样
        });
        expect(items.find((item) => item.product.id === 'p-cart-1')).toMatchObject({
            quantity: 3,
        });
    });

    it('取消订单（cancelOrder）→ await_human + USER_ABORT → aborted 停驻 + 审批 cancelled + 无回放（裁决⑤）', async () => {
        await reachAwaitHuman();

        useAssistantStore.getState().cancelOrder();
        expect(useAssistantStore.getState().status).toBe('aborted');
        expect(useAssistantStore.getState().approval?.phase).toBe('cancelled');
        // 取消不发回放：仅首回合一次请求；订单未执行（无 tool-output 帧）
        expect(mockStreamChat).toHaveBeenCalledTimes(1);

        const machine = mockCreateMachine.mock.results[0]?.value;
        expect(machine.state).toBe('aborted');
        const last = machine.log[machine.log.length - 1];
        expect(last).toMatchObject({ from: 'await_human', to: 'aborted', event: 'USER_ABORT' });
    });

    it('abort 在 await_human 直接可用（只增不改纳入 await_human，裁决⑤）：停驻 aborted + 审批 cancelled', async () => {
        await reachAwaitHuman();

        useAssistantStore.getState().abort();
        expect(useAssistantStore.getState().status).toBe('aborted');
        expect(useAssistantStore.getState().approval?.phase).toBe('cancelled');
        expect(mockStreamChat).toHaveBeenCalledTimes(1);
    });
});

describe('useAssistantStore G3.4 失败恢复（裁决①②）', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        localStorage.clear();
        useCartStore.setState({ items: [], isOpen: false });
        useAssistantStore.getState().reset();
    });

    it('失败恢复：error 落态存 lastFailedText，retryLast 重发原消息（error→idle→thinking，RETRY+USER_SEND 两事件记日志）', async () => {
        // 首回合：streaming 中流错误（streaming+ERROR 在表内，machine 真实落 error 态）
        mockStreamChat.mockImplementationOnce(async ({ onChunk }: StreamChatOptions) => {
            onChunk({ type: 'text-start', id: 't1' } as UIMessageChunk);
            onChunk({ type: 'text-delta', id: 't1', delta: '前半段' } as UIMessageChunk);
            throw new ChatApiError('stream', '上游模型服务错误（HTTP 500）');
        });
        await useAssistantStore.getState().sendMessage('推荐免费的素材');
        expect(useAssistantStore.getState().status).toBe('error');
        expect(useAssistantStore.getState().error).toContain('上游模型服务错误');
        expect(useAssistantStore.getState().lastFailedText).toBe('推荐免费的素材');

        // 点重试：重发原消息的新回合，正常走完
        streamChunks([
            { type: 'text-start', id: 't2' },
            { type: 'text-delta', id: 't2', delta: '恢复后的回复' },
            { type: 'text-end', id: 't2' },
            { type: 'finish', finishReason: 'stop' },
        ] as UIMessageChunk[]);
        await useAssistantStore.getState().retryLast();

        const state = useAssistantStore.getState();
        expect(state.status).toBe('done');
        expect(state.lastFailedText).toBeNull(); // 重发成功后清除
        // 新回合 = 重发的 user 消息 + 新 assistant 消息对
        expect(state.messages).toHaveLength(4);
        expect(state.messages[2]).toMatchObject({ role: 'user', text: '推荐免费的素材' });
        expect(state.messages[3]?.text).toBe('恢复后的回复');
        // 请求体重发的是原消息文本
        expect(mockStreamChat.mock.calls[1][0].messages.at(-1)).toEqual({
            role: 'user',
            parts: [{ type: 'text', text: '推荐免费的素材' }],
        });

        // error → idle（RETRY）→ thinking（USER_SEND）两事件记日志（G2.3 裁决① 两事件路径）
        const machine = mockCreateMachine.mock.results[0]?.value;
        expect(machine.state).toBe('done');
        expect(machine.log.map((entry: { event: string }) => entry.event)).toEqual([
            'USER_SEND',
            'STREAM_START',
            'ERROR',
            'RETRY',
            'USER_SEND',
            'STREAM_START',
            'STREAM_END',
        ]);
        expect(machine.log[3]).toMatchObject({ from: 'error', to: 'idle', event: 'RETRY' });
        expect(machine.log[4]).toMatchObject({ from: 'idle', to: 'thinking', event: 'USER_SEND' });
    });

    it('retryLast 守卫：仅 error 态可重试——aborted / done 态调用为 no-op，不重发（aborted 三约束①：无重试语义）', async () => {
        // aborted 态：取消 ≠ 失败，无重试语义
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

        await useAssistantStore.getState().retryLast();
        expect(mockStreamChat).toHaveBeenCalledTimes(1); // no-op：未发新请求
        expect(useAssistantStore.getState().status).toBe('aborted');

        // done 态：回合已成功，重试无意义
        streamChunks([
            { type: 'text-start', id: 't1' },
            { type: 'text-delta', id: 't1', delta: '正常回复' },
            { type: 'text-end', id: 't1' },
            { type: 'finish', finishReason: 'stop' },
        ] as UIMessageChunk[]);
        await useAssistantStore.getState().sendMessage('第二条');
        expect(useAssistantStore.getState().status).toBe('done');
        await useAssistantStore.getState().retryLast();
        expect(mockStreamChat).toHaveBeenCalledTimes(2); // 仍 no-op
        expect(useAssistantStore.getState().messages).toHaveLength(4);
    });

    it('裁决① 主流 catch：审批 pending 中流错误 → 保位 await_human + approval 保留 + 无 error 横幅 + 卡内提示', async () => {
        // 多步回合：正文 → 下单工具 → 审批请求（pending）→ error chunk（流错误发生在审批 pending 中）
        mockStreamChat.mockImplementation(async ({ onChunk }: StreamChatOptions) => {
            onChunk({ type: 'text-start', id: 't1' } as UIMessageChunk);
            onChunk(ORDER_INPUT);
            onChunk(ORDER_APPROVAL);
            throw new ChatApiError('stream', '上游模型服务错误（HTTP 500）');
        });
        await useAssistantStore.getState().sendMessage('帮我下单');

        const state = useAssistantStore.getState();
        expect(state.status).toBe('await_human'); // 保位：不回写 error 态
        expect(state.error).toBeNull(); // banner 不现
        expect(state.approval).toMatchObject({ approvalId: 'appr-1', phase: 'pending' }); // 审批卡保留
        expect(state.approvalNotice).toBe('操作失败，可重试'); // 卡内最小提示
        expect(state.lastFailedText).toBeNull(); // 仅非 pending 路径存重试文本

        // 保位不发 ERROR 路径事件（machine 只到 APPROVAL_REQUEST，无 ERROR entry）
        const machine = mockCreateMachine.mock.results[0]?.value;
        expect(machine.log.map((entry: { event: string }) => entry.event)).toEqual([
            'USER_SEND',
            'STREAM_START',
            'APPROVAL_REQUEST',
        ]);

        // 卡仍可有效决策：approve → 回放成功 → done（server 侧审批未被流错误作废）
        mockStreamChat.mockImplementation(async ({ onChunk }: StreamChatOptions) => {
            onChunk({
                type: 'tool-output-available',
                toolCallId: 'call-order-1',
                output: { orderId: 'ord-1', orderNumber: 'order-test01', amount: 25 },
            } as UIMessageChunk);
            onChunk({ type: 'text-start', id: 't2' } as UIMessageChunk);
            onChunk({
                type: 'text-delta',
                id: 't2',
                delta: '订单已提交，订单号 order-test01。',
            } as UIMessageChunk);
            onChunk({ type: 'text-end', id: 't2' } as UIMessageChunk);
            onChunk({ type: 'finish', finishReason: 'stop' } as UIMessageChunk);
        });
        useAssistantStore.getState().approve();
        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('done');
        });
        expect(useAssistantStore.getState().approvalNotice).toBeNull(); // 决策后清提示
        expect(useAssistantStore.getState().messages.at(-1)?.text).toContain('order-test01');
    });

    it('裁决① 回放 catch：edit 重发后新审批 pending 中流错误 → 保位 await_human + 新卡保留 + 卡内提示', async () => {
        await reachAwaitHuman();

        // 第二回合（edit 重发，D11 方案 B）：模型重新发起 placeOrder → 新审批挂起（pending），随后流错误
        mockStreamChat.mockImplementationOnce(async ({ onChunk }: StreamChatOptions) => {
            onChunk({
                type: 'tool-input-available',
                toolCallId: 'call-edit-1',
                toolName: 'placeOrder',
                input: { items: [{ productId: 'p-order-2', quantity: 1 }] },
            } as UIMessageChunk);
            onChunk({
                type: 'tool-approval-request',
                approvalId: 'appr-2',
                toolCallId: 'call-edit-1',
                reason: 'placeOrder requires approval',
                signature: 'sig-2',
            } as UIMessageChunk);
            throw new ChatApiError('stream', '上游模型服务错误（HTTP 500）');
        });
        useAssistantStore.getState().editOrder([{ productId: 'p-order-2', quantity: 1 }]);

        await vi.waitFor(() => {
            expect(useAssistantStore.getState().approvalNotice).toBe('操作失败，可重试');
        });
        const state = useAssistantStore.getState();
        expect(state.status).toBe('await_human'); // 保位：新卡不被流错误顶掉
        expect(state.error).toBeNull();
        expect(state.approval).toMatchObject({ approvalId: 'appr-2', phase: 'pending' });

        // 新卡仍可完成订单：approve → 第二轮回放成功 → done
        mockStreamChat.mockImplementationOnce(async ({ onChunk }: StreamChatOptions) => {
            onChunk({
                type: 'tool-output-available',
                toolCallId: 'call-edit-1',
                output: { orderId: 'ord-2', orderNumber: 'order-edit02', amount: 7.5 },
            } as UIMessageChunk);
            onChunk({ type: 'text-start', id: 't3' } as UIMessageChunk);
            onChunk({
                type: 'text-delta',
                id: 't3',
                delta: '订单已提交，订单号 order-edit02。',
            } as UIMessageChunk);
            onChunk({ type: 'text-end', id: 't3' } as UIMessageChunk);
            onChunk({ type: 'finish', finishReason: 'stop' } as UIMessageChunk);
        });
        useAssistantStore.getState().approve();
        await vi.waitFor(() => {
            expect(useAssistantStore.getState().status).toBe('done');
        });
        expect(useAssistantStore.getState().messages.at(-1)?.text).toContain('order-edit02');
    });
});
