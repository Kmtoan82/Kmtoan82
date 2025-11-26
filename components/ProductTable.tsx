import React, { useState, useMemo } from 'react';
import { Product, Competitor, Category } from '../types';
import { ArrowDown, ArrowUp, Minus, ExternalLink, Pencil, RefreshCw, Trash2, AlertCircle, TrendingUp, TrendingDown, CheckSquare, Square, Filter, ChevronRight, PackageX, Phone } from 'lucide-react';
import Sparkline from './Sparkline';

interface ProductTableProps {
  products: Product[];
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit: (product: Product) => void;
  onBulkAction: (action: 'refresh' | 'delete', ids: string[]) => void;
}

type TabType = 'all' | 'alert' | 'opportunity' | 'recent';

const ProductTable: React.FC<ProductTableProps> = ({ products, onRefresh, onDelete, onEdit, onBulkAction }) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [isCompact, setIsCompact] = useState(false);

  // --- Logic for Smart Filters ---
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      // Basic valid competitors logic
      const validCompetitors = p.competitors.filter(c => c.currentPrice !== null && c.stockStatus === 'in_stock');
      const minCompPrice = validCompetitors.length > 0 ? Math.min(...validCompetitors.map(c => c.currentPrice!)) : null;

      if (activeTab === 'all') return true;

      if (activeTab === 'alert') {
        // I am expensive: My price > Lowest Competitor
        return minCompPrice !== null && p.myPrice > minCompPrice;
      }

      if (activeTab === 'opportunity') {
        // I am cheap: My price < Lowest Competitor (by at least 2% maybe, simple logic for now)
        return minCompPrice !== null && p.myPrice < minCompPrice;
      }

      if (activeTab === 'recent') {
        // Changed in last 24h
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        return p.competitors.some(c => c.lastUpdated && new Date(c.lastUpdated) > oneDayAgo);
      }

      return true;
    });
  }, [products, activeTab]);

  // --- Bulk Selection ---
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredProducts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredProducts.map(p => p.id)));
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  // --- Render Helpers ---
  const getCompetitorDiff = (myPrice: number, compPrice: number | null) => {
    if (!compPrice) return null;
    const diff = compPrice - myPrice;
    const percent = (diff / myPrice) * 100;
    return { diff, percent };
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col h-full overflow-hidden">
      {/* Top Bar: Tabs & Controls */}
      <div className="border-b border-gray-200 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gray-50">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {[
            { id: 'all', label: 'Tất cả', icon: null, count: products.length },
            { id: 'alert', label: 'Cần giảm giá', icon: AlertCircle, count: products.filter(p => {
                const valid = p.competitors.filter(c => c.currentPrice && c.stockStatus === 'in_stock');
                return valid.length && Math.min(...valid.map(c => c.currentPrice!)) < p.myPrice;
            }).length, color: 'text-red-600 bg-red-50 border-red-200' },
            { id: 'opportunity', label: 'Cơ hội tăng lãi', icon: TrendingUp, count: products.filter(p => {
                 const valid = p.competitors.filter(c => c.currentPrice && c.stockStatus === 'in_stock');
                 return valid.length && Math.min(...valid.map(c => c.currentPrice!)) > p.myPrice;
            }).length, color: 'text-green-600 bg-green-50 border-green-200' },
            { id: 'recent', label: 'Biến động 24h', icon: RefreshCw, count: products.filter(p => {
                const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                return p.competitors.some(c => c.lastUpdated && new Date(c.lastUpdated) > oneDayAgo);
            }).length, color: 'text-blue-600 bg-blue-50 border-blue-200' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as TabType)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition whitespace-nowrap
                ${activeTab === tab.id 
                  ? (tab.color || 'bg-white border-gray-300 shadow-sm text-gray-900 ring-1 ring-gray-200') 
                  : 'border-transparent text-gray-500 hover:bg-gray-100'
                }`}
            >
              {tab.icon && <tab.icon size={14} />}
              {tab.label}
              <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-white bg-opacity-50' : 'bg-gray-200 text-gray-600'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white border border-gray-300 rounded-lg p-1">
             <button 
               onClick={() => setIsCompact(false)}
               className={`px-2 py-1 text-xs font-medium rounded ${!isCompact ? 'bg-gray-100 text-gray-900' : 'text-gray-500'}`}
             >
               Normal
             </button>
             <button 
               onClick={() => setIsCompact(true)}
               className={`px-2 py-1 text-xs font-medium rounded ${isCompact ? 'bg-gray-100 text-gray-900' : 'text-gray-500'}`}
             >
               Compact
             </button>
          </div>
          
          {selectedIds.size > 0 && (
             <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-4 duration-300">
               <span className="text-xs text-gray-500 hidden md:inline">Chọn {selectedIds.size} SP</span>
               <button 
                 onClick={() => { onBulkAction('refresh', Array.from(selectedIds)); setSelectedIds(new Set()); }}
                 className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition"
               >
                 <RefreshCw size={12}/> Quét lại
               </button>
               <button 
                 onClick={() => { onBulkAction('delete', Array.from(selectedIds)); setSelectedIds(new Set()); }}
                 className="flex items-center gap-1 px-3 py-1.5 bg-red-100 text-red-600 text-xs font-medium rounded hover:bg-red-200 transition"
               >
                 <Trash2 size={12}/> Xóa
               </button>
             </div>
          )}
        </div>
      </div>

      {/* Main Table Area */}
      <div className="flex-1 overflow-auto relative">
        <table className="w-full text-left border-collapse">
          <thead className="bg-gray-50 text-gray-500 text-xs uppercase font-semibold tracking-wider sticky top-0 z-20 shadow-sm">
            <tr>
              {/* Frozen Left Column: Product Info */}
              <th className="px-4 py-3 sticky left-0 z-20 bg-gray-50 border-r border-gray-200 min-w-[300px] w-[30%]">
                <div className="flex items-center gap-3">
                  <button onClick={toggleSelectAll} className="text-gray-400 hover:text-gray-600">
                    {selectedIds.size === filteredProducts.length && filteredProducts.length > 0 
                      ? <CheckSquare size={16} className="text-blue-600"/> 
                      : <Square size={16}/>
                    }
                  </button>
                  <span>Sản Phẩm & Giá Của Bạn</span>
                </div>
              </th>
              
              {/* Scrollable Middle: Market & Competitors */}
              <th className="px-4 py-3 w-[150px] min-w-[150px] text-center bg-gray-50 border-r border-gray-200">
                 Vị Thế Giá
              </th>
              <th className="px-4 py-3 min-w-[200px]">
                 Đối thủ 1
              </th>
              <th className="px-4 py-3 min-w-[200px]">
                 Đối thủ 2
              </th>
              <th className="px-4 py-3 min-w-[200px]">
                 Đối thủ 3
              </th>
               <th className="px-4 py-3 min-w-[200px]">
                 Đối thủ 4...
              </th>

              {/* Frozen Right Column: Actions */}
              <th className="px-4 py-3 sticky right-0 z-20 bg-gray-50 border-l border-gray-200 text-center w-[80px]">
                Hành động
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100 text-sm">
            {filteredProducts.map((product) => {
               const isSelected = selectedIds.has(product.id);
               
               // Find lowest price info
               const validCompetitors = product.competitors.filter(c => c.currentPrice && c.stockStatus === 'in_stock');
               const minCompPrice = validCompetitors.length > 0 ? Math.min(...validCompetitors.map(c => c.currentPrice!)) : null;
               
               let diffState = 'neutral';
               let diffPercent = 0;
               if (minCompPrice) {
                 diffPercent = ((product.myPrice - minCompPrice) / minCompPrice) * 100;
                 if (diffPercent > 1) diffState = 'expensive'; // I'm > 1% more expensive
                 else if (diffPercent < -1) diffState = 'cheap'; // I'm > 1% cheaper
               }

               return (
                <tr key={product.id} className={`hover:bg-blue-50/30 transition group ${isSelected ? 'bg-blue-50' : 'bg-white'}`}>
                  
                  {/* Sticky Left: Product Info */}
                  <td className={`px-4 ${isCompact ? 'py-2' : 'py-4'} sticky left-0 z-10 border-r border-gray-100 ${isSelected ? 'bg-blue-50' : 'bg-white'} group-hover:bg-blue-50/30 transition`}>
                    <div className="flex items-start gap-3">
                      <button onClick={() => toggleSelect(product.id)} className="mt-1 text-gray-400 hover:text-blue-600">
                        {isSelected ? <CheckSquare size={16} className="text-blue-600"/> : <Square size={16}/>}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                           <span className="bg-gray-100 text-gray-600 text-[10px] px-1.5 rounded font-bold uppercase tracking-wider">{product.category}</span>
                           {product.sku && <span className="text-[10px] text-gray-400 font-mono">{product.sku}</span>}
                        </div>
                        <h4 className="font-semibold text-gray-900 truncate" title={product.name}>{product.name}</h4>
                        
                        <div className="flex items-center gap-3 mt-1.5">
                           <div className="flex flex-col">
                             <span className="text-xs text-gray-400 uppercase font-bold text-[9px]">Giá của bạn</span>
                             <span className="font-bold text-blue-700">{product.myPrice.toLocaleString()}</span>
                           </div>
                           {(product.costPrice || product.minPrice) && (
                              <div className="h-6 w-px bg-gray-200"></div>
                           )}
                           {product.costPrice && (
                             <div className="flex flex-col">
                               <span className="text-xs text-gray-400 uppercase font-bold text-[9px]">Vốn</span>
                               <span className="text-xs text-gray-500">{product.costPrice.toLocaleString()}</span>
                             </div>
                           )}
                           {product.minPrice && (
                             <div className="flex flex-col">
                               <span className="text-xs text-gray-400 uppercase font-bold text-[9px]">Sàn</span>
                               <span className="text-xs text-gray-500">{product.minPrice.toLocaleString()}</span>
                             </div>
                           )}
                        </div>
                        {product.loading && <div className="mt-1 h-0.5 w-full bg-blue-100 overflow-hidden"><div className="h-full bg-blue-500 animate-progress"></div></div>}
                      </div>
                    </div>
                  </td>

                  {/* Market Position Column */}
                  <td className={`px-4 border-r border-gray-100 text-center ${isSelected ? 'bg-blue-50' : 'bg-white'}`}>
                    {minCompPrice ? (
                      <div className={`inline-flex flex-col items-center justify-center px-3 py-1 rounded-lg border ${
                        diffState === 'expensive' ? 'bg-red-50 border-red-100 text-red-700' :
                        diffState === 'cheap' ? 'bg-green-50 border-green-100 text-green-700' :
                        'bg-gray-50 border-gray-100 text-gray-600'
                      }`}>
                        <span className="text-[10px] font-bold uppercase">
                          {diffState === 'expensive' ? 'Đắt hơn' : diffState === 'cheap' ? 'Rẻ hơn' : 'Ngang bằng'}
                        </span>
                        <div className="flex items-center gap-1 text-sm font-bold">
                           {diffState === 'expensive' ? <ArrowUp size={12}/> : diffState === 'cheap' ? <ArrowDown size={12}/> : <Minus size={12}/>}
                           {Math.abs(diffPercent).toFixed(1)}%
                        </div>
                         <span className="text-[10px] opacity-70">so với thấp nhất</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400 italic">Chưa có dữ liệu</span>
                    )}
                  </td>

                  {/* Competitor Columns (Dynamic Loop) */}
                  {[0, 1, 2, 3].map(idx => {
                    const comp = product.competitors[idx];
                    if (!comp) return <td key={idx} className="px-4 text-center text-gray-300">-</td>;

                    // Color logic for competitor cell
                    const metrics = getCompetitorDiff(product.myPrice, comp.currentPrice);
                    const isCheapest = comp.currentPrice === minCompPrice && comp.stockStatus === 'in_stock';
                    const isOOS = comp.stockStatus === 'out_of_stock';

                    return (
                      <td key={comp.id} className={`px-4 py-2 align-top min-w-[200px] border-r border-gray-50 last:border-0 relative ${isOOS ? 'bg-gray-50' : ''}`}>
                         <div className="flex flex-col h-full justify-between">
                           <div>
                              <div className="flex justify-between items-start">
                                <a href={comp.url} target="_blank" rel="noopener noreferrer" className={`text-xs hover:text-blue-600 font-medium truncate max-w-[120px] ${isOOS ? 'text-gray-400' : 'text-gray-600'}`} title={comp.name}>
                                  {comp.name}
                                </a>
                                {comp.status === 'decreased' && <TrendingDown size={12} className="text-red-500 animate-pulse"/>}
                                {comp.status === 'increased' && <TrendingUp size={12} className="text-green-500"/>}
                              </div>
                              
                              <div className="flex items-baseline gap-2 mt-1">
                                {comp.currentPrice ? (
                                  <span className={`font-bold ${
                                    isOOS ? 'text-gray-400 line-through' : 
                                    isCheapest ? 'text-red-600' : 'text-gray-900'
                                  }`}>
                                    {comp.currentPrice.toLocaleString()}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">---</span>
                                )}
                                {comp.currentPrice && !isOOS && metrics && Math.abs(metrics.percent) > 1 && (
                                   <span className={`text-[10px] font-medium ${metrics.diff < 0 ? 'text-red-500' : 'text-green-500'}`}>
                                     {metrics.diff > 0 ? '+' : ''}{Math.round(metrics.percent)}%
                                   </span>
                                )}
                              </div>
                           </div>

                           <div className="mt-2 flex items-end justify-between h-6">
                             {/* Stock Status / Badge */}
                             <div>
                               {isOOS ? (
                                 <span className="text-[10px] flex items-center gap-1 text-red-500 bg-white border border-red-100 px-1.5 py-0.5 rounded shadow-sm"><PackageX size={10}/> Hết</span>
                               ) : comp.stockStatus === 'contact' ? (
                                 <span className="text-[10px] flex items-center gap-1 text-orange-500 bg-white border border-orange-100 px-1.5 py-0.5 rounded shadow-sm"><Phone size={10}/> LH</span>
                               ) : null}
                             </div>
                             
                             {/* Sparkline */}
                             <div className={isOOS ? 'opacity-30 grayscale' : ''}>
                               <Sparkline data={comp.priceHistory} width={60} height={20} color={isCheapest ? '#ef4444' : '#6b7280'} />
                             </div>
                           </div>
                           
                           <div className="text-[9px] text-gray-300 text-right mt-0.5">
                              {comp.lastUpdated ? new Date(comp.lastUpdated).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}
                           </div>
                         </div>
                      </td>
                    );
                  })}

                  {/* Sticky Right: Actions */}
                  <td className={`px-2 sticky right-0 z-10 border-l border-gray-200 text-center ${isSelected ? 'bg-blue-50' : 'bg-white'} group-hover:bg-blue-50/30 transition`}>
                     <div className="flex flex-col gap-2 items-center justify-center">
                        <button onClick={() => onEdit(product)} className="text-gray-400 hover:text-blue-600 transition" title="Xem/Sửa">
                           <Pencil size={16} />
                        </button>
                        <button onClick={() => onRefresh(product.id)} className={`text-gray-400 hover:text-green-600 transition ${product.loading ? 'animate-spin text-blue-500' : ''}`} title="Cập nhật">
                           <RefreshCw size={16} />
                        </button>
                     </div>
                  </td>
                </tr>
               );
            })}
            
            {filteredProducts.length === 0 && (
              <tr>
                <td colSpan={10} className="py-12 text-center text-gray-400">
                  <div className="flex flex-col items-center">
                    <Filter size={32} className="mb-2 opacity-20"/>
                    <p>Không có sản phẩm nào phù hợp với bộ lọc hiện tại.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      
      {/* Footer / Pagination (Mock) */}
      <div className="border-t border-gray-200 bg-gray-50 p-2 flex justify-between items-center text-xs text-gray-500">
         <span>Hiển thị {filteredProducts.length} sản phẩm</span>
         {filteredProducts.length > 20 && (
           <div className="flex gap-1">
             <button className="px-2 py-1 bg-white border rounded hover:bg-gray-100 disabled:opacity-50" disabled>Trước</button>
             <button className="px-2 py-1 bg-white border rounded hover:bg-gray-100">Sau</button>
           </div>
         )}
      </div>
    </div>
  );
};

export default ProductTable;