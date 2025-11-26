
export interface PricePoint {
  date: string; // ISO string
  price: number;
}

export type StockStatus = 'in_stock' | 'out_of_stock' | 'contact' | 'unknown';

export interface Competitor {
  id: string;
  name: string;
  url: string;
  currentPrice: number | null;
  stockStatus: StockStatus; // New: Stock tracking
  promotion?: string;
  lastUpdated: string | null;
  priceHistory: PricePoint[];
  status: 'stable' | 'increased' | 'decreased' | 'unknown';
  error?: string;
}

export type Category = 
  | 'Laptop' 
  | 'PC Desktop' 
  | 'Màn hình' 
  | 'Linh kiện PC' 
  | 'Chuột & Bàn phím' 
  | 'Tai nghe & Loa' 
  | 'Thiết bị mạng' 
  | 'Khác';

export const CATEGORIES: Category[] = [
  'Laptop', 
  'PC Desktop', 
  'Màn hình', 
  'Linh kiện PC', 
  'Chuột & Bàn phím', 
  'Tai nghe & Loa', 
  'Thiết bị mạng', 
  'Khác'
];

export type PricingStrategy = 'manual' | 'match_lowest' | 'beat_lowest_5k' | 'beat_lowest_10k';

export interface Product {
  id: string;
  name: string;
  sku?: string; // New: Product Identifier
  myPrice: number;
  myPromotion?: string; // New: My Promotion
  costPrice?: number; // New: For margin protection
  minPrice?: number; // New: Floor price guardrail
  strategy: PricingStrategy; // New: Repricing rule
  suggestedPrice?: number; // New: Calculated dynamic price
  category: Category;
  competitors: Competitor[];
  loading: boolean;
}

// For form handling
export interface CompetitorFormData {
  name: string;
  url: string;
}

export interface AddProductFormData {
  name: string;
  sku?: string;
  myPrice: number;
  myPromotion?: string;
  costPrice?: number;
  minPrice?: number;
  strategy: PricingStrategy;
  category: Category;
  competitors: CompetitorFormData[];
}

export interface Notification {
  id: string;
  type: 'info' | 'warning' | 'danger' | 'success';
  message: string;
  timestamp: Date;
  read: boolean;
}
