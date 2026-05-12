import type { Category } from '@/types'

export type ProductCategory = Omit<Category, 'productCount'>

export const PRODUCT_CATEGORIES: ProductCategory[] = [
  { id: 'cat-1', name: 'Electronics', slug: 'electronics', description: 'Phones, laptops, gadgets and more', icon: 'Laptop', color: 'blue', subcategories: ['Phones', 'Laptops', 'Tablets', 'Audio', 'Cameras', 'Gaming', 'Accessories'] },
  { id: 'cat-2', name: 'Fashion', slug: 'fashion', description: 'Clothing, shoes, and accessories', icon: 'Shirt', color: 'pink', subcategories: ['Tops', 'Bottoms', 'Outerwear', 'Shoes', 'Bags', 'Jewelry', 'Watches'] },
  { id: 'cat-3', name: 'Home & Garden', slug: 'home-garden', description: 'Furniture, appliances, decor', icon: 'Home', color: 'green', subcategories: ['Furniture', 'Appliances', 'Decor', 'Garden', 'Kitchen', 'Bedding'] },
  { id: 'cat-4', name: 'Sports & Outdoors', slug: 'sports', description: 'Fitness, cycling, outdoor gear', icon: 'Dumbbell', color: 'orange', subcategories: ['Fitness', 'Cycling', 'Running', 'Team Sports', 'Camping', 'Water Sports'] },
  { id: 'cat-5', name: 'Books & Media', slug: 'books-media', description: 'Books, music, movies, games', icon: 'BookOpen', color: 'amber', subcategories: ['Books', 'Textbooks', 'Music', 'Movies', 'Video Games', 'Board Games'] },
  { id: 'cat-6', name: 'Vehicles', slug: 'vehicles', description: 'Cars, bikes, accessories', icon: 'Car', color: 'gray', subcategories: ['Cars', 'Motorcycles', 'Bicycles', 'Parts', 'Accessories'] },
  { id: 'cat-7', name: 'Kids & Baby', slug: 'kids-baby', description: 'Toys, clothes, and gear for kids', icon: 'Baby', color: 'purple', subcategories: ['Toys', 'Clothing', 'Baby Gear', 'Books', 'Furniture'] },
  { id: 'cat-8', name: 'Art & Collectibles', slug: 'art', description: 'Artwork, antiques, collectibles', icon: 'Palette', color: 'teal', subcategories: ['Paintings', 'Sculpture', 'Antiques', 'Coins', 'Stamps', 'Memorabilia'] },
]
