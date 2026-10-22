import { createHashRouter } from 'react-router-dom';

import { AssistantPage } from '../features/assistant/AssistantPage';
import { CatalogPage } from '../features/catalog/CatalogPage';

export const router = createHashRouter([
    {
        path: '/',
        element: <CatalogPage />,
    },
    {
        path: '/assistant',
        element: <AssistantPage />,
    },
]);
