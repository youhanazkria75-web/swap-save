'use client'

import { useParams } from 'next/navigation'
import ProductFormPage from '../../new/product-form-page'

export default function EditProductPage() {
  const { id } = useParams<{ id: string }>()
  return <ProductFormPage editId={id} />
}
