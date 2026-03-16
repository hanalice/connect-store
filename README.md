# CLO Connect Store

React + TypeScript + Vite project based on `docs/架构设计.md`.

## Tech Stack

- React
- TypeScript
- Vite
- Zustand
- React Router
- fetch
- SCSS Modules + CSS Custom Properties
- Vitest + React Testing Library
- ESLint + Prettier
- Husky + lint-staged + Commitlint

## Scripts

- `npm run dev`: start local development server
- `npm run build`: type-check and build production bundle
- `npm run preview`: preview build output
- `npm run lint`: run ESLint
- `npm run format`: format files with Prettier
- `npm run format:check`: check Prettier formatting
- `npm run test`: run unit tests
- `npm run test:watch`: run tests in watch mode

## Scope
- Client-side filtering + sorting selectors, use URL query state helpers (`q`, `pricing`, `sort`)
- Theme tokens and runtime theme switch (`dark`, `light`)
- Infinite scrolling skeleton structure with IntersectionObserver
- Commit and CI baseline configuration

## Project Structure

```txt
src/
  app/
  features/catalog/
  shared/
  styles/
  test/
```
