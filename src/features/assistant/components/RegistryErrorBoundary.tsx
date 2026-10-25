import { Component, type ReactNode } from 'react';

import styles from './RegistryErrorBoundary.module.scss';

interface RegistryErrorBoundaryProps {
    children: ReactNode;
}

interface RegistryErrorBoundaryState {
    hasError: boolean;
}

/**
 * registry 卡片的渲染错误边界（UT-REG-04）：注册组件抛错时渲染本地化 fallback，
 * 不向上冒泡——对话流与兄弟节点不受影响。仅捕获渲染期错误，不处理事件回调错误。
 */
export class RegistryErrorBoundary extends Component<
    RegistryErrorBoundaryProps,
    RegistryErrorBoundaryState
> {
    state: RegistryErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): RegistryErrorBoundaryState {
        return { hasError: true };
    }

    render() {
        if (this.state.hasError) {
            return <span className={styles.fallback}>该工具结果卡片渲染失败</span>;
        }
        return this.props.children;
    }
}
