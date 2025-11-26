import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Activity, Server, Search, Bell, Download, ShieldAlert, ArrowDown, Clock, LayoutGrid, Table as TableIcon } from 'lucide-react';
import { Product, AddProductFormData, CATEGORIES, Category, Competitor, Notification } from './types';
import { checkCompetitorPrice } from './services/geminiService';
import ProductCard from './components/ProductCard';
import ProductTable from './components/ProductTable';
import AddProductModal from './components/AddProductModal';
import * as XLSX from 'xlsx';

// Mock initial data or empty array
const INITIAL_PRODUCTS: Product[] = [];

// Rate Limit Safety Delay (ms)
// Free tier is approx 15 RPM, but to be safe we aim for ~6 RPM (1 request every 10 seconds)
const SAFETY_DELAY_MS = 10000;

const App: React.FC = () => {
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('tracked_products_v3');
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
  });
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [lastGlobalUpdate, setLastGlobalUpdate] = useState<Date | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | 'All'>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');

  // Save to local storage whenever products change
  useEffect(() => {
    localStorage.setItem('tracked_products_v3', JSON.stringify(products));
  }, [products]);

  // Add a notification
  const addNotification = useCallback((type: Notification['type'], message: string) => {
    const newNotif: Notification = {
      id: Date.now().toString() + Math.random(),
      type,
      message,
      timestamp: new Date(),
      read: false
    };
    setNotifications(prev => [newNotif, ...prev].slice(0, 50));
  }, []);

  // --- Core Business Logic: Repricing Engine ---
  const calculateSuggestedPrice = useCallback((product: Product, competitors: Competitor[]): number | undefined => {
    if (product.strategy === 'manual') return undefined;

    // Filter valid competitors (In Stock, Has Price)
    const validCompetitorPrices = competitors
      .filter(c => c.stockStatus === 'in_stock' && c.currentPrice !== null)
      .map(c => c.currentPrice as number);

    if (validCompetitorPrices.length === 0) return undefined;

    const minMarketPrice = Math.min(...validCompetitorPrices);
    let rawSuggested = minMarketPrice;

    // Apply Strategy
    if (product.strategy === 'beat_lowest_5k') {
      rawSuggested = minMarketPrice - 5000;
    } else if (product.strategy === 'beat_lowest_10k') {
      rawSuggested = minMarketPrice - 10000;
    } else if (product.strategy === 'match_lowest') {
      rawSuggested = minMarketPrice;
    }

    // Apply Guardrails (Floor Price & Cost Price)
    const guardrails = [];
    if (product.minPrice) guardrails.push(product.minPrice);
    if (product.costPrice) guardrails.push(product.costPrice);

    const floor = guardrails.length > 0 ? Math.max(...guardrails) : 0;
    
    return Math.max(rawSuggested, floor);
  }, []);


  // Update a single competitor
  const updateCompetitor = async (productName: string, competitor: Competitor): Promise<Competitor> => {
    const result = await checkCompetitorPrice(productName, competitor.url, competitor.name);
    
    if (!result) {
      return {
        ...competitor,
        lastUpdated: new Date().toISOString(),
        error: 'Không tìm thấy giá',
      };
    }

    let status: Competitor['status'] = 'stable';
    if (competitor.currentPrice) {
      if (result.price > competitor.currentPrice) status = 'increased';
      if (result.price < competitor.currentPrice) status = 'decreased';
    }

    // Check for alerts
    if (status === 'decreased') {
      addNotification('warning', `Đối thủ ${competitor.name} vừa GIẢM giá sản phẩm ${productName} xuống ${result.price.toLocaleString()}đ`);
    }
    if (competitor.stockStatus === 'in_stock' && result.stockStatus === 'out_of_stock') {
      addNotification('info', `Đối thủ ${competitor.name} vừa HẾT HÀNG sản phẩm ${productName}`);
    }

    const newHistory = [...competitor.priceHistory];
    if (competitor.currentPrice !== result.price || newHistory.length === 0) {
      newHistory.push({
        date: new Date().toISOString(),
        price: result.price
      });
    }
    if (newHistory.length > 30) newHistory.shift();

    return {
      ...competitor,
      currentPrice: result.price,
      stockStatus: result.stockStatus,
      promotion: result.promotion || undefined,
      lastUpdated: new Date().toISOString(),
      priceHistory: newHistory,
      status,
      error: undefined
    };
  };

  // Update a whole product
  const updateProduct = useCallback(async (product: Product) => {
    setProducts(prev => prev.map(p => p.id === product.id ? { ...p, loading: true } : p));

    const updatedCompetitors: Competitor[] = [];
    for (const comp of product.competitors) {
      // Add generous delay to prevent rate limiting (10 seconds between competitors)
      await new Promise(resolve => setTimeout(resolve, SAFETY_DELAY_MS));
      const updatedComp = await updateCompetitor(product.name, comp);
      updatedCompetitors.push(updatedComp);
    }

    // Recalculate suggested price after getting new competitor data
    const suggested = calculateSuggestedPrice(product, updatedCompetitors);

    setProducts(prev => prev.map(p => {
      if (p.id !== product.id) return p;
      return {
        ...p,
        competitors: updatedCompetitors,
        suggestedPrice: suggested,
        loading: false
      };
    }));
  }, [addNotification, calculateSuggestedPrice]);

  const handleRefreshAll = useCallback(async (subsetIds?: string[]) => {
    setLastGlobalUpdate(new Date());
    const targets = subsetIds 
      ? products.filter(p => subsetIds.includes(p.id)) 
      : products;

    for (const p of targets) {
      await updateProduct(p);
      // Add delay between products to prevent rate limiting (5 seconds)
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    addNotification('success', `Đã hoàn tất quét giá ${targets.length} sản phẩm.`);
  }, [products, updateProduct, addNotification]);

  const handleRefreshSingle = (id: string) => {
    const product = products.find(p => p.id === id);
    if (product) updateProduct(product);
  };

  // --- Helper: Normalize SKU ---
  const normalizeSku = (sku?: string) => sku ? sku.trim().toUpperCase() : '';

  // --- Helper: Create New Competitor Object ---
  const createNewCompetitor = (name: string, url: string): Competitor => ({
    id: `comp-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
    name,
    url,
    currentPrice: null,
    stockStatus: 'unknown',
    lastUpdated: null,
    priceHistory: [],
    status: 'unknown'
  });

  // --- Logic: Add or Merge Product ---
  const processProductUpsert = (data: AddProductFormData, currentProducts: Product[]): { updatedProducts: Product[], targetProduct: Product, isNew: boolean } => {
    const skuToMatch = normalizeSku(data.sku);
    const existingIndex = skuToMatch ? currentProducts.findIndex(p => normalizeSku(p.sku) === skuToMatch) : -1;

    if (existingIndex > -1) {
      // MERGE / UPDATE EXISTING
      const existingProduct = currentProducts[existingIndex];
      
      // Merge competitors: Keep history if URL matches
      const mergedCompetitors = data.competitors.map(newComp => {
        const existingComp = existingProduct.competitors.find(c => c.url.trim() === newComp.url.trim());
        if (existingComp) {
          // Keep existing ID and History, but update name
          return {
            ...existingComp,
            name: newComp.name || existingComp.name
          };
        }
        // New competitor
        return createNewCompetitor(newComp.name, newComp.url);
      });

      const updatedProduct: Product = {
        ...existingProduct,
        name: data.name, // Update name
        myPrice: data.myPrice,
        myPromotion: data.myPromotion,
        costPrice: data.costPrice,
        minPrice: data.minPrice,
        strategy: data.strategy,
        category: data.category,
        competitors: mergedCompetitors,
        loading: false
      };

      const newProductList = [...currentProducts];
      newProductList[existingIndex] = updatedProduct;

      return { updatedProducts: newProductList, targetProduct: updatedProduct, isNew: false };
    } else {
      // CREATE NEW
      const newProduct: Product = {
        id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
        name: data.name,
        sku: data.sku,
        myPrice: data.myPrice,
        myPromotion: data.myPromotion,
        costPrice: data.costPrice,
        minPrice: data.minPrice,
        strategy: data.strategy,
        category: data.category,
        competitors: data.competitors.map(c => createNewCompetitor(c.name, c.url)),
        loading: false
      };

      return { updatedProducts: [newProduct, ...currentProducts], targetProduct: newProduct, isNew: true };
    }
  };

  const handleAddProduct = (data: AddProductFormData) => {
    setProducts(prev => {
      const { updatedProducts, targetProduct, isNew } = processProductUpsert(data, prev);
      
      // Trigger update to fetch prices
      setTimeout(() => updateProduct(targetProduct), 100);

      if (!isNew) {
        addNotification('info', `Đã cập nhật thông tin sản phẩm SKU: ${data.sku}`);
      }
      return updatedProducts;
    });
  };

  const handleBulkAdd = (dataList: AddProductFormData[]) => {
    setProducts(prev => {
      let currentList = [...prev];
      const productsToUpdate: Product[] = [];

      dataList.forEach(data => {
        const { updatedProducts, targetProduct } = processProductUpsert(data, currentList);
        currentList = updatedProducts;
        productsToUpdate.push(targetProduct);
      });

      // Process updates queue
      const processQueue = async () => {
        addNotification('info', `Bắt đầu xử lý ${productsToUpdate.length} sản phẩm từ file...`);
        for (const p of productsToUpdate) {
          await updateProduct(p);
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
        addNotification('success', 'Đã hoàn tất nhập và cập nhật dữ liệu.');
      };
      processQueue();

      return currentList;
    });
  };

  const handleDeleteProduct = (id: string) => {
    if (confirm('Bạn có chắc chắn muốn xóa sản phẩm này?')) {
      setProducts(prev => prev.filter(p => p.id !== id));
    }
  };

  const handleBulkDelete = (ids: string[]) => {
    if (confirm(`Bạn có chắc muốn xóa ${ids.length} sản phẩm?`)) {
      setProducts(prev => prev.filter(p => !ids.includes(p.id)));
    }
  }

  const handleUpdateProduct = (productId: string, updatedCompetitors: Competitor[], myPrice: number, myPromotion?: string, category?: Category, costPrice?: number) => {
    setProducts(prev => prev.map(p => {
      if (p.id !== productId) return p;
      return {
        ...p,
        competitors: updatedCompetitors,
        myPrice: myPrice,
        myPromotion: myPromotion,
        category: category || p.category,
        costPrice: costPrice || p.costPrice,
        suggestedPrice: calculateSuggestedPrice({ ...p, myPrice, costPrice: costPrice || p.costPrice }, updatedCompetitors)
      };
    }));
  };

  const handleExportExcel = () => {
    const dataToExport = products.map(p => {
      const validPrices = p.competitors.filter(c => c.currentPrice).map(c => c.currentPrice!);
      const minPrice = validPrices.length ? Math.min(...validPrices) : 0;
      
      return {
        'Category': p.category,
        'SKU': p.sku || '',
        'Product Name': p.name,
        'My Price': p.myPrice,
        'My Promotion': p.myPromotion || '',
        'Cost Price': p.costPrice || 0,
        'Min Price': p.minPrice || 0,
        'Suggested Price': p.suggestedPrice || 0,
        'Lowest Competitor': minPrice,
        'Competitor 1 Name': p.competitors[0]?.name || '',
        'Competitor 1 Price': p.competitors[0]?.currentPrice || '',
        'Competitor 2 Name': p.competitors[1]?.name || '',
        'Competitor 2 Price': p.competitors[1]?.currentPrice || '',
      };
    });

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "PriceReport");
    XLSX.writeFile(wb, `Price_Tracker_Report_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  // Filter products
  const filteredProducts = products.filter(p => {
    const matchCategory = selectedCategory === 'All' || p.category === selectedCategory;
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || (p.sku && p.sku.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCategory && matchSearch;
  });

  // Stats
  const cheaperCompetitors = products.reduce((acc, p) => {
    return acc + p.competitors.filter(c => c.currentPrice && c.currentPrice < p.myPrice && c.stockStatus === 'in_stock').length;
  }, 0);
  const outOfStockCompetitors = products.reduce((acc, p) => {
    return acc + p.competitors.filter(c => c.stockStatus === 'out_of_stock').length;
  }, 0);

  // Auto-update every hour
  useEffect(() => {
    const interval = setInterval(() => {
      handleRefreshAll();
    }, 3600000);
    return () => clearInterval(interval);
  }, [handleRefreshAll]);

  // Unread notifs
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="min-h-screen bg-gray-50 font-sans flex flex-col h-screen overflow-hidden">
      {/* Header - Fixed */}
      <header className="bg-white shadow-sm shrink-0 z-30">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-600 p-2 rounded-lg text-white shadow-lg shadow-blue-200">
                <Activity size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 tracking-tight">IT Price Intelligence</h1>
                <p className="text-xs text-gray-500 font-medium">Hệ thống giám sát & định giá tự động</p>
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
               {/* View Toggle */}
              <div className="flex bg-gray-100 rounded-lg p-1 border border-gray-200">
                 <button onClick={() => setViewMode('table')} className={`p-1.5 rounded ${viewMode === 'table' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`} title="Bảng">
                   <TableIcon size={18} />
                 </button>
                 <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`} title="Lưới">
                   <LayoutGrid size={18} />
                 </button>
              </div>

              <div className="h-6 w-px bg-gray-200 mx-1 hidden md:block"></div>

              <button 
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-full transition"
              >
                <Bell size={20} />
                {unreadCount > 0 && (
                  <span className="absolute top-0 right-0 h-4 w-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotifications && (
                <div className="absolute top-16 right-4 w-80 bg-white shadow-xl rounded-xl border border-gray-100 p-2 z-50 max-h-96 overflow-y-auto">
                   <h3 className="text-sm font-bold text-gray-700 px-3 py-2 border-b">Thông báo</h3>
                   {notifications.length === 0 ? (
                     <div className="text-center py-6 text-gray-400 text-sm">Chưa có thông báo nào</div>
                   ) : (
                     <div className="space-y-1 mt-1">
                       {notifications.map(n => (
                         <div key={n.id} className={`p-3 rounded-lg text-xs ${n.type === 'warning' ? 'bg-orange-50 text-orange-800' : n.type === 'danger' ? 'bg-red-50 text-red-800' : n.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-blue-50 text-blue-800'}`}>
                           <p className="font-medium">{n.message}</p>
                           <p className="text-[10px] opacity-70 mt-1">{n.timestamp.toLocaleTimeString()}</p>
                         </div>
                       ))}
                     </div>
                   )}
                </div>
              )}

              <button 
                onClick={handleExportExcel}
                className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-sm font-medium transition"
                title="Xuất báo cáo Excel"
              >
                <Download size={16} />
                <span className="hidden sm:inline">Xuất Excel</span>
              </button>

              <button 
                onClick={() => handleRefreshAll()}
                className="flex items-center gap-2 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition"
              >
                <Server size={16} />
                <span className="hidden sm:inline">Quét Toàn Bộ</span>
              </button>
              
              <button 
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium shadow-md shadow-blue-200 transition transform hover:scale-105"
              >
                <Plus size={18} />
                <span>Thêm Sản Phẩm</span>
              </button>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="mt-4 flex flex-col sm:flex-row gap-4 items-center justify-between border-t pt-4">
            <div className="flex overflow-x-auto w-full sm:w-auto gap-2 pb-2 sm:pb-0 scrollbar-hide">
              <button 
                onClick={() => setSelectedCategory('All')}
                className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition ${selectedCategory === 'All' ? 'bg-gray-800 text-white shadow' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Tất cả
              </button>
              {CATEGORIES.map(cat => (
                <button 
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition ${selectedCategory === cat ? 'bg-blue-100 text-blue-700 border border-blue-200 shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input 
                type="text" 
                placeholder="Tìm tên sản phẩm hoặc SKU..." 
                className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden flex flex-col bg-gray-50">
        <div className="h-full max-w-[1920px] mx-auto w-full px-4 sm:px-6 lg:px-8 py-4 flex flex-col">
          
          {/* Quick Stats */}
          {products.length > 0 && (
             <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 shrink-0">
               <div className="bg-white px-4 py-3 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                 <div>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Tổng SP</p>
                   <p className="text-xl font-bold text-gray-900">{products.length}</p>
                 </div>
                 <Activity size={18} className="text-blue-500"/>
               </div>
               <div className="bg-white px-4 py-3 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                 <div>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Cần giảm giá</p>
                   <p className="text-xl font-bold text-red-600">{cheaperCompetitors}</p>
                 </div>
                 <ArrowDown size={18} className="text-red-500"/>
               </div>
               <div className="bg-white px-4 py-3 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                 <div>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Tăng giá được</p>
                   <p className="text-xl font-bold text-orange-600">{outOfStockCompetitors}</p>
                 </div>
                 <ShieldAlert size={18} className="text-orange-500"/>
               </div>
               <div className="bg-white px-4 py-3 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                 <div>
                   <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Cập nhật lúc</p>
                   <p className="text-sm font-bold text-gray-800">
                      {lastGlobalUpdate ? lastGlobalUpdate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--'}
                   </p>
                 </div>
                 <Clock size={18} className="text-gray-500"/>
               </div>
             </div>
          )}

          {/* View Switcher Content */}
          <div className="flex-1 overflow-hidden min-h-0">
            {filteredProducts.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center bg-white rounded-xl border border-dashed border-gray-300">
                <Activity className="h-12 w-12 text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-900">Không tìm thấy dữ liệu</h3>
                <p className="mt-2 text-sm text-gray-500">Hãy thử thay đổi bộ lọc hoặc thêm sản phẩm mới.</p>
              </div>
            ) : viewMode === 'table' ? (
              <ProductTable 
                products={filteredProducts}
                onRefresh={handleRefreshSingle}
                onDelete={handleDeleteProduct}
                onEdit={(p) => { setViewMode('grid'); setSearchQuery(p.name); }} 
                onBulkAction={(action, ids) => {
                  if (action === 'refresh') handleRefreshAll(ids);
                  if (action === 'delete') handleBulkDelete(ids);
                }}
              />
            ) : (
              <div className="overflow-y-auto h-full pr-2">
                 <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 pb-20">
                  {filteredProducts.map(product => (
                    <ProductCard 
                      key={product.id} 
                      product={product} 
                      onRefresh={handleRefreshSingle}
                      onDelete={handleDeleteProduct}
                      onUpdateProduct={handleUpdateProduct}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

        </div>
      </main>

      <AddProductModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onAdd={handleAddProduct}
        onBulkAdd={handleBulkAdd}
        currentProducts={products}
      />
    </div>
  );
};

export default App;