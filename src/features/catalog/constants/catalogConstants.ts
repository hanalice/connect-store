export const CATALOG_CONSTANTS = {
    /** Time in ms to wait before appending next chunk (simulates loading feel) */
    APPEND_DELAY_MS: 200,
    /** Default search debounce time in ms */
    SEARCH_DEBOUNCE_MS: 500,
    /** Buffer width for CustomSelect to ensure text fits with arrow */
    SELECT_WIDTH_BUFFER: 48,
    /** Font size used for measuring CustomSelect content width */
    SELECT_MEASURE_FONT_SIZE: '12px',
} as const;
