import { createBrowserRouter } from 'react-router-dom'

import { CatalogPage } from '../features/catalog/CatalogPage'

export const router = createBrowserRouter([
  {
    path: '/',
    element: <CatalogPage />,
  },
])