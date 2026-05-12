'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { API_BASE_URL } from '@/lib/api-config'
import { PRODUCT_CATEGORIES } from '@/lib/product-categories'

const CATEGORY_ICONS: Record<string, string> = {
  'Electronics': '💻', 'Fashion': '👗', 'Home & Garden': '🏠',
  'Sports & Outdoors': '🚴', 'Books & Media': '📚', 'Vehicles': '🚗',
  'Kids & Baby': '🧸', 'Art & Collectibles': '🎨',
}

const CATEGORY_COLORS: Record<string, string> = {
  'Electronics':       'from-blue-500/20 to-blue-600/10 border-blue-200 hover:border-blue-400',
  'Fashion':           'from-pink-500/20 to-pink-600/10 border-pink-200 hover:border-pink-400',
  'Home & Garden':     'from-green-500/20 to-green-600/10 border-green-200 hover:border-green-400',
  'Sports & Outdoors': 'from-orange-500/20 to-orange-600/10 border-orange-200 hover:border-orange-400',
  'Books & Media':     'from-amber-500/20 to-amber-600/10 border-amber-200 hover:border-amber-400',
  'Vehicles':          'from-gray-500/20 to-gray-600/10 border-gray-200 hover:border-gray-400',
  'Kids & Baby':       'from-purple-500/20 to-purple-600/10 border-purple-200 hover:border-purple-400',
  'Art & Collectibles':'from-teal-500/20 to-teal-600/10 border-teal-200 hover:border-teal-400',
}

const normalizeCategoryLabel = (category: unknown): string => {
  if (typeof category !== 'string') {
    return ''
  }

  return category
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function CategoriesPage() {
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let cancelled = false

    const loadCategoryCounts = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/products/category-counts`)

        let data: unknown = null
        try {
          data = await response.json()
        } catch {
          data = null
        }

        if (!response.ok) {
          throw new Error('Failed to load category counts.')
        }

        const countsRaw =
          typeof data === 'object' &&
          data !== null &&
          'counts' in data &&
          typeof data.counts === 'object' &&
          data.counts !== null
            ? data.counts as Record<string, unknown>
            : {}

        const counts = Object.fromEntries(
          Object.entries(countsRaw)
            .map(([category, count]) => [normalizeCategoryLabel(category), Number(count)])
            .filter(([category, count]) => category && Number.isFinite(count))
        )

        if (!cancelled) {
          setCategoryCounts(counts)
        }
      } catch {
        if (!cancelled) {
          setCategoryCounts({})
        }
      }
    }

    loadCategoryCounts()

    return () => {
      cancelled = true
    }
  }, [])

  const categories = useMemo(
    () =>
      PRODUCT_CATEGORIES.map((category) => ({
        ...category,
        productCount: categoryCounts[category.name] || 0,
      })),
    [categoryCounts]
  )

  return (
    <div>
      {/* Hero */}
      <div className="bg-gradient-to-br from-brand-950 to-teal-900 text-white py-14">
        <div className="page-container text-center">
          <h1 className="text-3xl font-bold mb-2">Browse Categories</h1>
          <p className="text-white/60">Explore thousands of items across all product types</p>
        </div>
      </div>

      <div className="page-container py-12">
        {/* Main grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {categories.map(cat => (
            <Link
              key={cat.id}
              href={`/marketplace?category=${encodeURIComponent(cat.name)}`}
              className={`group flex flex-col p-6 rounded-2xl border bg-gradient-to-br transition-all duration-200 hover:shadow-card-hover hover:-translate-y-0.5 ${CATEGORY_COLORS[cat.name] || ''}`}
            >
              <span className="text-4xl mb-4 group-hover:scale-110 transition-transform duration-200 inline-block">
                {CATEGORY_ICONS[cat.name] || '📦'}
              </span>
              <h3 className="font-semibold text-lg mb-1">{cat.name}</h3>
              <p className="text-sm text-muted-foreground mb-4 leading-relaxed">{cat.description}</p>
              
              {/* Subcategory pills */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {cat.subcategories.slice(0, 4).map(sub => (
                  <span key={sub} className="text-[11px] px-2 py-0.5 rounded-full bg-background/50 border border-border text-muted-foreground">
                    {sub}
                  </span>
                ))}
                {cat.subcategories.length > 4 && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-background/50 border border-border text-muted-foreground">
                    +{cat.subcategories.length - 4} more
                  </span>
                )}
              </div>

              <div className="mt-auto flex items-center justify-between">
                <span className="text-sm font-medium text-primary">{cat.productCount.toLocaleString()} products</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors">
                  Browse <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
