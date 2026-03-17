import { PricingOption, type SortMode } from '../types/product';

const VALID_SORT_MODES: SortMode[] = ['default', 'price-desc', 'price-asc'];

export interface CatalogUrlState {
    keyword: string;
    pricingOptions: PricingOption[];
    sortMode: SortMode;
}

const DEFAULT_STATE: CatalogUrlState = {
    keyword: '',
    pricingOptions: [],
    sortMode: 'default',
};

export function readCatalogUrlState(params: URLSearchParams): CatalogUrlState {
    const keyword = params.get('q') ?? DEFAULT_STATE.keyword;
    const sortRaw = params.get('sort');
    const sortMode = VALID_SORT_MODES.includes(sortRaw as SortMode)
        ? (sortRaw as SortMode)
        : DEFAULT_STATE.sortMode;

    const pricingRaw = params.get('pricing');
    const pricingOptions = pricingRaw
        ? pricingRaw
              .split(',')
              .map((item) => Number(item))
              .filter(
                  (value): value is PricingOption =>
                      value === PricingOption.PAID ||
                      value === PricingOption.FREE ||
                      value === PricingOption.VIEW_ONLY,
              )
        : DEFAULT_STATE.pricingOptions;

    return {
        keyword,
        pricingOptions,
        sortMode,
    };
}

export function writeCatalogUrlState(state: CatalogUrlState): URLSearchParams {
    const params = new URLSearchParams();

    if (state.keyword.trim()) {
        params.set('q', state.keyword.trim());
    }

    if (state.pricingOptions.length > 0) {
        params.set('pricing', state.pricingOptions.join(','));
    }

    if (state.sortMode !== 'default') {
        params.set('sort', state.sortMode);
    }

    return params;
}
