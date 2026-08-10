# Test Case Design: Connect Store Project

## 1. Testing Strategy

- **Unit Testing (UT)**: Focus on core logic (selectors, store, API helpers) using Vitest.
- **Integration Testing**: Focus on component interaction and user flows using React Testing Library.

## 2. Unit Test Cases (UT)

### 2.1 Catalog Selectors (`catalogSelectors.ts`)

| ID    | Title                    | Description                                            | Expected Result                             |
| ----- | ------------------------ | ------------------------------------------------------ | ------------------------------------------- |
| UT-01 | Keyword Search (Creator) | Search for an existing creator name.                   | Returns matched items only.                 |
| UT-02 | Keyword Search (Title)   | Search for an existing title substring.                | Returns matched items only.                 |
| UT-11 | Multiple Pricing Options | Select "Paid" and "Free".                              | Returns items matching either.              |
| UT-20 | Sort: Default            | Sort by title A-Z.                                     | Sorted alphabetically.                      |
| UT-21 | Sort: Higher Price       | Paid items first (desc by price), then Free/View Only. | Paid desc by price, followed by categories. |
| UT-22 | Sort: Lower Price        | View Only/Free first, then Paid (asc by price).        | Paid asc by price, following others.        |
| UT-23 | Sort Fallback            | Same category/price items.                             | Sorted by title A-Z.                        |

### 2.2 Catalog Store (`useCatalogStore.ts`)

| ID          | Title           | Description                        | Expected Result                          |
| ----------- | --------------- | ---------------------------------- | ---------------------------------------- |
| UT-STORE-01 | Fetch Success   | Call `fetchProducts` successfully. | `products` populated, `loading` false.   |
| UT-STORE-02 | Fetch Failure   | Mock rejection of `getProducts`.   | `error` populated with message.          |
| UT-STORE-03 | Scroll Chunking | Trigger `increaseVisibleCount`.    | `visibleCount` increases by `chunkSize`. |

## 3. Integration Test Cases

### 3.1 UX Flows (`CatalogPage.test.tsx`)

| ID     | Title                                      | Description                                                 | Expected Result                                                                                                        |
| ------ | ------------------------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| INT-01 | Initial Load                               | Mount page and fetch data.                                  | Skeleton shown then Grid rendered.                                                                                     |
| INT-02 | Combined Flow                              | Search keyword, select pricing, and change Sort option.     | Grid and URL updated with intersection + sort order.                                                                   |
| INT-03 | URL Sync                                   | Change filter and check URL.                                | URL query params match state.                                                                                          |
| INT-04 | State Restoration                          | Load page with existing query params.                       | UI initialized with correct filters.                                                                                   |
| INT-05 | Reset Action                               | Click the "Reset" button.                                   | Filters cleared in UI and URL; Search and Sort remain unchanged.                                                       |
| INT-06 | Infinite Scroll                            | Scroll to bottom sentinel.                                  | Next set of products appended.                                                                                         |
| INT-07 | Responsive Grid                            | Resize window across 480, 768, 1200px.                      | Columns change to 1, 2, 3, 4 accordingly.                                                                              |
| INT-08 | Empty State                                | Search for a non-existent keyword.                          | "No contents matched..." / EmptyState component is displayed.                                                          |
| INT-09 | Loading State                              | Trigger initial fetch or scroll.                            | Skeleton cards are visible before products render.                                                                     |
| INT-10 | Theme Switching                            | Change theme from Dark to Light via UI.                     | `data-theme` attribute on root/body updates correctly.                                                                 |
| INT-11 | Skeleton Visual Alignment (CLS Prevention) | Compare `ProductSkeletonCard` and `ProductCard` DOM/Styles. | Pixel-perfect alignment between skeleton and actual card; no layout shift when data loads.                             |
| INT-12 | Theme Persistence                          | Toggle theme and refresh the page.                          | Selected theme is saved in `localStorage` and restored on page load.                                                   |
| INT-13 | Theme-aware Skeletons                      | Switch theme and check skeleton colors.                     | Skeleton shimmer colors update immediately to match the current theme (e.g., light gray in light mode).                |
| INT-14 | Scroll-Search Concurrency                  | Change search keyword while a "Load More" chunk is pending. | Pending load is cleanly canceled/reset; new search results render without stuck skeletons.                             |
| INT-15 | Contextual Skeleton Count                  | Trigger loading for a small remaining set of items.         | Number of skeleton cards shown does not exceed the remaining item count (or at least reflects the actual data volume). |
| INT-16 | Infinite Scroll Continuation               | Verify scroll works consistently for 3+ chunks.             | No logic deadlocks occur; scroll triggers correctly until `hasMore` is false.                                          |
| INT-17 | Image Load Error Fallback                  | Manually trigger `onError` on a ProductCard image.          | Image element is replaced by a placeholder with "Image not available" text.                                            |

## 4. Accessibility (A11y)

| ID      | Title            | Description                                            | Expected Result                             |
| ------- | ---------------- | ------------------------------------------------------ | ------------------------------------------- |
| A11Y-01 | Semantic HTML    | Verify usage of main, section, header, nav tags.       | Landmark regions correctly identified.      |
| A11Y-02 | Input Labels     | Check Search and Filter inputs for aria-labels/labels. | Screen readers can identify input purpose.  |
| A11Y-03 | Focus Management | Interact with filters using keyboard.                  | Visible focus ring on interactive elements. |

## 5. API Resilience & Basics (External API)

### 5.1 API Testing

| ID     | Title               | Description                                    | Expected Result                                     |
| ------ | ------------------- | ---------------------------------------------- | --------------------------------------------------- |
| API-01 | Retry Logic         | Mock 2 consecutive failures then 1 success.    | UI should succeed after retries (3 attempts total). |
| API-02 | Error Normalization | API returns malformed JSON or 500.             | ErrorState shown with meaningful message.           |
| API-03 | Field Validation    | Mock items missing required fields (e.g., id). | App should handle gracefully (skip or default).     |

## 5. Automation Plan

- Execute `npm test` or `vitest run` on PR and push.
- Target coverage for business logic: > 90%.
