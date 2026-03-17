import { createHashRouter } from 'react-router-dom';

import { CatalogPage } from '../features/catalog/CatalogPage';

export const router = createHashRouter([
    {
        path: '/',
        element: <CatalogPage />,
    },
]);
