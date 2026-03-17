# Connect Store

A professional-grade digital asset catalog platform built with a focus on performance, scalability, and maintainability.

## 🌟 Key Features

- **Performance-Optimized Rendering**: Implements highly efficient infinite scrolling using `IntersectionObserver` to ensure smooth content discovery.
- **State-Managed Filtering & Search**: Advanced catalog management featuring debounced real-time search and multi-criteria filtering, fully synchronized with URL state for persistent navigation.
- **Advanced Sorting Logic**: Features a categorical priority sorting engine (Paid > Free > View Only) with deterministic alphabetical fallback for consistent data presentation.
- **Architectural UI Consistency**: Utilizes precision-matched Skeleton components to eliminate Cumulative Layout Shift (CLS) during asynchronous data loading.
- **Robust Design System**: Implements a theme-aware architecture using CSS Custom Properties, supporting system-level theme detection and persistence.
- **Production-Ready CI/CD**: Integrated with automated workflows for type-checking, linting, unit testing, and continuous deployment.

## 🛠 Technical Stack

- **Framework**: React 19 + TypeScript
- **State Management**: Zustand
- **Routing**: React Router 7
- **Styling**: SCSS Modules + CSS Variables (Design Tokens)
- **Testing**: Vitest + React Testing Library
- **Code Quality**: ESLint, Prettier, Husky, Commitlint
- **Build Infrastructure**: Vite 8 (+ GitHub Actions for CI/CD)

## ⚖️ Quality Assurance & Testing

We maintain a high standard of quality with 100% test coverage for core business logic and critical UI interactions.

- **[Execution Report](docs/qa_report.md)**: View the latest test results, pass rates, and bug fix verifications.
- **[Test Case Design](docs/test_cases.md)**: Deep dive into our test strategies, coverage mapping, and integration scenarios.

## 🚀 Development Lifecycle

- `npm run dev`: Start development server
- `npm run build`: Type-check and build production assets
- `npm run preview`: Preview production build
- `npm run test`: Execution of test suites (unit/integration)
- `npm run lint`: Static analysis and linting
- `npm run format`: Code formatting

## 📂 Architecture Overview

```txt
src/
├── app/          # Global configuration and routing
├── features/     # Domain-specific logic (Catalog modules)
├── styles/       # Global styling and design tokens
└── test/         # Testing infrastructure
```
