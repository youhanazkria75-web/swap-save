'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Upload, X, Plus, ImagePlus, ArrowLeft, Save,
  Info, Banknote, MapPin, Tag, AlignLeft,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label, Textarea } from '@/components/ui/form-elements'
import { useApp } from '@/contexts/app-context'
import { API_BASE_URL } from '@/lib/api-config'
import { PRODUCT_CATEGORIES } from '@/lib/product-categories'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { ProductCondition } from '@/types'

const CONDITIONS: { value: ProductCondition; label: string; desc: string }[] = [
  { value: 'new',      label: 'New',       desc: 'Never used, original packaging' },
  { value: 'like-new', label: 'Like New',  desc: 'Used once or twice, perfect condition' },
  { value: 'good',     label: 'Good',      desc: 'Light wear, fully functional' },
  { value: 'fair',     label: 'Fair',      desc: 'Visible wear but works well' },
  { value: 'poor',     label: 'Poor',      desc: 'Heavy wear, may need repairs' },
]

interface ProductFormProps { editId?: string }

export default function ProductFormPage({ editId }: ProductFormProps) {
  const router = useRouter()
  const { getCurrentUser } = useApp()
  const user = getCurrentUser()!
  const isEdit = !!editId

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    subcategory: '',
    condition: '' as ProductCondition | '',
    estimatedValue: '',
    location: user.city,
    tags: '',
  })
  const [images, setImages] = useState<string[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [loadingProduct, setLoadingProduct] = useState(isEdit)
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const set = (k: keyof typeof form, v: string) => {
    setForm(f => ({ ...f, [k]: v }))
    setErrors(e => ({ ...e, [k]: '' }))
  }

  const selectedCategory = PRODUCT_CATEGORIES.find(c => c.name === form.category)

  useEffect(() => {
    if (!editId) return

    let cancelled = false

    const loadProduct = async () => {
      try {
        setLoadingProduct(true)
        const response = await fetch(`${API_BASE_URL}/products/${editId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
          },
        })

        let data: unknown = null
        try {
          data = await response.json()
        } catch {
          data = null
        }

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token')
            router.push('/login')
            return
          }

          const message =
            typeof data === 'object' &&
            data !== null &&
            'message' in data &&
            typeof data.message === 'string'
              ? data.message
              : 'Failed to load product.'

          throw new Error(message)
        }

        const product =
          typeof data === 'object' &&
          data !== null &&
          'product' in data &&
          typeof data.product === 'object' &&
          data.product !== null
            ? data.product as Record<string, unknown>
            : null

        if (!product || cancelled) return

        setForm({
          title: typeof product.title === 'string' ? product.title : '',
          description: typeof product.description === 'string' ? product.description : '',
          category: typeof product.category === 'string' ? product.category : '',
          subcategory: typeof product.subcategory === 'string' ? product.subcategory : '',
          condition: (typeof product.condition === 'string' ? product.condition : '') as ProductCondition | '',
          estimatedValue: String(product.estimated_value ?? ''),
          location: typeof product.location === 'string' ? product.location : user.city,
          tags: Array.isArray(product.tags) ? product.tags.join(', ') : '',
        })
        setImages(Array.isArray(product.images) ? product.images.filter((image): image is string => typeof image === 'string') : [])
        setTags(Array.isArray(product.tags) ? product.tags.filter((tag): tag is string => typeof tag === 'string') : [])
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Network error while loading product.')
          router.push('/user/products')
        }
      } finally {
        if (!cancelled) {
          setLoadingProduct(false)
        }
      }
    }

    loadProduct()

    return () => {
      cancelled = true
    }
  }, [editId, router, user.city])

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase().replace(/\s+/g, '-')
    if (t && !tags.includes(t) && tags.length < 8) {
      setTags(ts => [...ts, t])
    }
    setTagInput('')
  }

  const removeTag = (tag: string) => setTags(ts => ts.filter(t => t !== tag))

  const handleImageAdd = () => {
    if (images.length >= 5) { toast.error('Maximum 5 images allowed'); return }
    if (uploading) return
    fileInputRef.current?.click()
  }

  const handleImageChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])

    if (files.length === 0) return

    const availableSlots = 5 - images.length
    if (availableSlots <= 0) {
      toast.error('Maximum 5 images allowed')
      event.target.value = ''
      return
    }

    const selectedFiles = files.slice(0, availableSlots)
    const formData = new FormData()
    selectedFiles.forEach(file => formData.append('images', file))

    setUploading(true)

    try {
      const response = await fetch(`${API_BASE_URL}/products/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
        },
        body: formData,
      })

      let data: unknown = null
      try {
        data = await response.json()
      } catch {
        data = null
      }

      if (!response.ok) {
        const message =
          typeof data === 'object' &&
          data !== null &&
          'message' in data &&
          typeof data.message === 'string'
            ? data.message
            : 'Failed to upload images. Please try again.'

        throw new Error(message)
      }

      const uploadedImages =
        typeof data === 'object' &&
        data !== null &&
        'images' in data &&
        Array.isArray(data.images)
          ? data.images.filter((image): image is string => typeof image === 'string')
          : []

      setImages(imgs => {
        const merged = [...imgs]
        uploadedImages.forEach(image => {
          if (!merged.includes(image)) merged.push(image)
        })
        return merged
      })
      setErrors(e => ({ ...e, images: '' }))

      if (files.length > availableSlots) {
        toast.error('Maximum 5 images allowed')
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Network error while uploading images. Please try again.'

      toast.error(message)
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  const removeImage = (i: number) => setImages(imgs => imgs.filter((_, idx) => idx !== i))

  const validate = () => {
    const e: Record<string, string> = {}
    if (!form.title.trim()) e.title = 'Title is required'
    else if (form.title.length < 5) e.title = 'Title must be at least 5 characters'
    if (!form.description.trim()) e.description = 'Description is required'
    else if (form.description.length < 20) e.description = 'Please write at least 20 characters'
    if (!form.category) e.category = 'Please select a category'
    if (!form.condition) e.condition = 'Please select a condition'
    if (!form.estimatedValue) e.estimatedValue = 'Estimated value is required'
    else if (isNaN(+form.estimatedValue) || +form.estimatedValue <= 0) e.estimatedValue = 'Enter a valid value'
    if (!form.location.trim()) e.location = 'Location is required'
    if (images.length === 0) e.images = 'At least one photo is required'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const handleSubmit = async () => {
    if (loadingProduct) return
    if (uploading) {
      toast.error('Please wait for image uploads to finish')
      return
    }

    if (!validate()) {
      toast.error('Please fix the errors before saving')
      return
    }
    setSaving(true)
    try {
      if (isEdit) {
        const response = await fetch(`${API_BASE_URL}/products/${editId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
          },
          body: JSON.stringify({
            title: form.title,
            description: form.description,
            category: form.category,
            subcategory: form.subcategory,
            condition: form.condition,
            estimated_value: +form.estimatedValue,
            location: form.location,
            images,
            tags,
          }),
        })

        let data: unknown = null
        try {
          data = await response.json()
        } catch {
          data = null
        }

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token')
            router.push('/login')
            return
          }

          const message =
            typeof data === 'object' &&
            data !== null &&
            'message' in data &&
            typeof data.message === 'string'
              ? data.message
              : 'Failed to update product. Please try again.'

          throw new Error(message)
        }

        toast.success('Product updated!')
        router.push('/user/products')
      } else {
        const response = await fetch(`${API_BASE_URL}/products`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
          },
          body: JSON.stringify({
            title: form.title,
            description: form.description,
            category: form.category,
            subcategory: form.subcategory,
            condition: form.condition,
            estimated_value: +form.estimatedValue,
            location: form.location,
            images,
            tags,
          }),
        })

        let data: unknown = null
        try {
          data = await response.json()
        } catch {
          data = null
        }

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            localStorage.removeItem('token')
            router.push('/login')
            return
          }

          const message =
            typeof data === 'object' &&
            data !== null &&
            'message' in data &&
            typeof data.message === 'string'
              ? data.message
              : 'Failed to create product. Please try again.'

          throw new Error(message)
        }

        toast.success('Product listed!', { description: 'Your item is now live on the marketplace.' })
        router.push('/user/products')
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Network error while creating product. Please try again.'

      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link href="/user/products"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{isEdit ? 'Edit product' : 'Add new product'}</h1>
          <p className="text-muted-foreground text-sm">
          {isEdit ? 'Update your listing details' : 'List an item to start swapping'}
          </p>
        </div>
      </div>

      {loadingProduct && (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          Loading product...
        </div>
      )}

      {!loadingProduct && (
        <>
      <div className="bg-card rounded-2xl border border-border p-6">
        <div className="flex items-center gap-2 mb-4">
          <ImagePlus className="h-5 w-5 text-primary" />
          <h2 className="font-semibold">Product photos</h2>
          <span className="text-xs text-muted-foreground ml-auto">{images.length}/5</span>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleImageChange}
        />

        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          {images.map((img, i) => (
            <div key={i} className="relative aspect-square rounded-xl overflow-hidden bg-muted group">
              <img src={img} alt="" className="h-full w-full object-cover" />
              <button
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
              {i === 0 && (
                <div className="absolute bottom-1 left-1">
                  <span className="text-[10px] bg-black/60 text-white px-1.5 py-0.5 rounded">Main</span>
                </div>
              )}
            </div>
          ))}
          {images.length < 5 && (
            <button
              onClick={handleImageAdd}
              disabled={uploading}
              className={cn(
                'aspect-square rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition-colors',
                errors.images ? 'border-destructive bg-destructive/5' : 'border-border hover:border-primary hover:bg-primary/5',
                uploading && 'opacity-60 cursor-not-allowed'
              )}
            >
              <Plus className="h-5 w-5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">{uploading ? 'Uploading...' : 'Add photo'}</span>
            </button>
          )}
        </div>

        {errors.images && <p className="text-xs text-destructive mt-2">{errors.images}</p>}
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5" />
          First photo is the main display image. More photos increase swap success rate.
        </p>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
        <h2 className="font-semibold">Basic information</h2>

        <div className="space-y-1.5">
          <Label htmlFor="title">Product title *</Label>
          <Input
            id="title"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            placeholder="e.g. Sony WH-1000XM5 Wireless Headphones"
            maxLength={100}
            className={cn(errors.title && 'border-destructive')}
          />
          <div className="flex justify-between">
            {errors.title
              ? <p className="text-xs text-destructive">{errors.title}</p>
              : <span />
            }
            <span className="text-xs text-muted-foreground">{form.title.length}/100</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="description">Description *</Label>
          <Textarea
            id="description"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Describe your product — condition details, included accessories, reason for swapping, any defects..."
            rows={5}
            maxLength={1000}
            className={cn(errors.description && 'border-destructive')}
          />
          <div className="flex justify-between">
            {errors.description
              ? <p className="text-xs text-destructive">{errors.description}</p>
              : <p className="text-xs text-muted-foreground">Be detailed and honest to build trust</p>
            }
            <span className="text-xs text-muted-foreground">{form.description.length}/1000</span>
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
        <h2 className="font-semibold">Category & condition</h2>

        <div className="space-y-1.5">
          <Label>Category *</Label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRODUCT_CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => { set('category', cat.name); set('subcategory', '') }}
                className={cn(
                  'flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center text-xs font-medium transition-all',
                  form.category === cat.name
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:border-primary/50 hover:bg-muted'
                )}
              >
                <span className="text-lg">{
                  { 'Electronics':'💻', 'Fashion':'👗', 'Home & Garden':'🏠', 'Sports & Outdoors':'🚴',
                    'Books & Media':'📚', 'Vehicles':'🚗', 'Kids & Baby':'🧸', 'Art & Collectibles':'🎨' }[cat.name] || '📦'
                }</span>
                <span className="leading-tight">{cat.name}</span>
              </button>
            ))}
          </div>
          {errors.category && <p className="text-xs text-destructive">{errors.category}</p>}
        </div>

        {selectedCategory && (
          <div className="space-y-1.5">
            <Label>Subcategory <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <div className="flex flex-wrap gap-2">
              {selectedCategory.subcategories.map(sub => (
                <button
                  key={sub}
                  onClick={() => set('subcategory', form.subcategory === sub ? '' : sub)}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-sm border transition-colors',
                    form.subcategory === sub ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
                  )}
                >
                  {sub}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label>Condition *</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CONDITIONS.map(c => (
              <button
                key={c.value}
                onClick={() => set('condition', c.value)}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-xl border text-left transition-all',
                  form.condition === c.value
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50 hover:bg-muted'
                )}
              >
                <div className={cn(
                  'h-4 w-4 rounded-full border-2 shrink-0 mt-0.5 transition-all',
                  form.condition === c.value ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                )} />
                <div>
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-xs text-muted-foreground">{c.desc}</p>
                </div>
              </button>
            ))}
          </div>
          {errors.condition && <p className="text-xs text-destructive">{errors.condition}</p>}
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6 space-y-5">
        <h2 className="font-semibold">Value & location</h2>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="value">Estimated value (EGP) *</Label>
            <div className="relative">
              <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="value"
                type="number"
                min="1"
                value={form.estimatedValue}
                onChange={e => set('estimatedValue', e.target.value)}
                placeholder="0"
                className={cn('pl-9', errors.estimatedValue && 'border-destructive')}
              />
            </div>
            {errors.estimatedValue
              ? <p className="text-xs text-destructive">{errors.estimatedValue}</p>
              : <p className="text-xs text-muted-foreground">Set a fair market value for matching</p>
            }
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="location">Location (city) *</Label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="location"
                value={form.location}
                onChange={e => set('location', e.target.value)}
                placeholder="e.g. Cairo"
                className={cn('pl-9', errors.location && 'border-destructive')}
              />
            </div>
            {errors.location && <p className="text-xs text-destructive">{errors.location}</p>}
          </div>
        </div>

        <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-start gap-2.5">
          <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700">
            Accurate value estimation leads to better AI matches and faster admin approval.
            Research the current market price before listing.
          </p>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border p-6 space-y-4">
        <div>
          <h2 className="font-semibold">Tags</h2>
          <p className="text-sm text-muted-foreground mt-0.5">Add up to 8 tags to improve searchability</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              placeholder="Add a tag and press Enter"
              className="pl-9"
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); addTag(tagInput) }
                if (e.key === ',' || e.key === ' ') { e.preventDefault(); addTag(tagInput) }
              }}
              maxLength={20}
            />
          </div>
          <Button variant="outline" onClick={() => addTag(tagInput)} disabled={!tagInput.trim()}>Add</Button>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => (
              <span key={tag} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary text-secondary-foreground text-sm">
                #{tag}
                <button onClick={() => removeTag(tag)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-3 pb-8">
        <Button asChild variant="outline" className="flex-1">
          <Link href="/user/products">Cancel</Link>
        </Button>
        <Button className="flex-2" onClick={handleSubmit} loading={saving} disabled={saving || uploading || loadingProduct} size="lg">
          <Save className="h-4 w-4" />
          {isEdit ? 'Save changes' : 'List product'}
        </Button>
      </div>
        </>
      )}
    </div>
  )
}
