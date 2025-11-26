
import React, { useState } from 'react';
import { RefreshCw, Trash2, ExternalLink, ArrowDown, ArrowUp, Minus, Pencil, Save, X, Plus, Gift, CheckCircle, AlertCircle, PackageX, PackageCheck, Phone, Zap } from 'lucide-react';
import { Product, Competitor, Category, CATEGORIES } from '../types';
import PriceChart from './PriceChart';
import { checkCompetitorPrice } from '../services/geminiService';

interface ProductCardProps {
  product: Product;
  onRefresh: (id: string) => void;
  onDelete: (id: string) => void;
  onUpdateProduct: (id: string, competitors: Competitor[], myPrice: number, myPromotion?: string, category?: Category, costPrice?: number) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, onRefresh, onDelete, onUpdateProduct }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editedCompetitors, setEditedCompetitors] = useState<Competitor[]>([]);
  const [editMyPrice, setEditMyPrice] = useState<number>(0);
  const [editMyPromotion, setEditMyPromotion] = useState<string>('');
  const [editCategory, setEditCategory] = useState<Category>('Khác');
  const [editCostPrice, setEditCostPrice] = useState<number>(0);
  const [refreshingIndex, setRefreshingIndex] = useState<number | null>(null);

  const validCompetitorPrices = product.competitors
    .filter(c => c.currentPrice !== null && c.stockStatus === 'in_stock')
    .map(c => c.currentPrice as number);

  const minCompetitorPrice = validCompetitorPrices.length > 0 ? Math.min(...validCompetitorPrices) : null;
  const maxCompetitorPrice = validCompetitorPrices.length > 0 ? Math.max(...validCompetitorPrices) : null;

  // Positioning
  let position = 'Trung bình';
  let positionColor = 'bg-gray-100 text-gray-600';
  if (minCompetitorPrice && product.myPrice <= minCompetitorPrice) {
    position = 'Rẻ nhất';
    positionColor = 'bg-green-100 text-green-700';
  } else if (maxCompetitorPrice && product.myPrice >= maxCompetitorPrice) {
    position = 'Đắt nhất';
    positionColor = 'bg-red-100 text-red-700';
  }

  const startEditing = () => {
    setEditedCompetitors(JSON.parse(JSON.stringify(product.competitors)));
    setEditMyPrice(product.myPrice);
    setEditMyPromotion(product.myPromotion || '');
    setEditCategory(product.category);
    setEditCostPrice(product.costPrice || 0);
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setIsEditing(false);
    setEditedCompetitors([]);
    setRefreshingIndex(null);
  };

  const saveEditing = () => {
    const valid = editedCompetitors.filter(c => c.name.trim() !== '' && c.url.trim() !== '');
    if (valid.length === 0) {
      alert("Cần ít nhất 1 đối thủ.");
      return;
    }
    onUpdateProduct(product.id, valid, editMyPrice, editMyPromotion, editCategory, editCostPrice);
    setIsEditing(false);
    setRefreshingIndex(null);
  };

  const handleEditChange = (index: number, field: 'name' | 'url', value: string) => {
    const newComps = [...editedCompetitors];
    newComps[index] = { ...newComps[index], [field]: value };
    setEditedCompetitors(newComps);
  };

  const handleQuickCheck = async (index: number) => {
    const comp = editedCompetitors[index];
    if (!comp.url || !comp.name) return;

    setRefreshingIndex(index);
    const tempComps = [...editedCompetitors];
    tempComps[index] = { ...tempComps[index], error: undefined };
    setEditedCompetitors(tempComps);

    const result = await checkCompetitorPrice(product.name, comp.url, comp.name);
    
    setRefreshingIndex(null);
    const finalComps = [...editedCompetitors];
    
    if (result) {
      finalComps[index] = {
        ...finalComps[index],
        currentPrice: result.price,
        stockStatus: result.stockStatus,
        promotion: result.promotion || undefined,
        lastUpdated: new Date().toISOString(),
        error: undefined
      };
    } else {
      finalComps[index] = {
        ...finalComps[index],
        error: 'Không lấy được giá'
      };
    }
    setEditedCompetitors(finalComps);
  };

  const addEmptyCompetitor = () => {
    if (editedCompetitors.length >= 5) return;
    setEditedCompetitors([
      ...editedCompetitors,
      {
        id: `comp-new-${Date.now()}`,
        name: '',
        url: '',
        currentPrice: null,
        stockStatus: 'unknown',
        lastUpdated: null,
        priceHistory: [],
        status: 'unknown'
      }
    ]);
  };

  const removeCompetitor = (index: number) => {
    const newComps = [...editedCompetitors];
    newComps.splice(index, 1);
    setEditedCompetitors(newComps);
  };
  
  return (
    <div className="bg-white rounded-xl shadow-md border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow duration-300 flex flex-col relative">
      {/* Loading Overlay */}
      {product.loading && (
        <div className="absolute inset-0 bg-white bg-opacity-70 z-10 flex items-center justify-center">
          <RefreshCw className="animate-spin text-blue-600" size={32} />
        </div>
      )}

      <div className="p-5 flex-1">
        {/* Header */}
        <div className="flex justify-between items-start mb-3">
          <div className="w-full mr-2">
            <div className="flex gap-2 mb-2 items-center">
              {isEditing ? (
                 <select 
                   value={editCategory} 
                   onChange={(e) => setEditCategory(e.target.value as Category)}
                   className="text-xs border border-gray-300 rounded px-1 py-0.5"
                 >
                   {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                 </select>
              ) : (
                <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] uppercase rounded-md font-bold">
                  {product.category}
                </span>
              )}
              <span className={`inline-block px-2 py-0.5 text-[10px] uppercase rounded-md font-bold ${positionColor}`}>
                {position}
              </span>
            </div>
            <h3 className="text-lg font-bold text-gray-900 leading-tight">{product.name}</h3>
            {product.sku && <p className="text-xs text-gray-400 mt-1">SKU: {product.sku}</p>}
          </div>
          <div className="flex gap-2 shrink-0">
            {!isEditing ? (
              <>
                 <button onClick={startEditing} className="p-1.5 rounded-full bg-gray-50 text-gray-600 hover:bg-orange-50 hover:text-orange-600 transition"><Pencil size={16} /></button>
                <button onClick={() => onRefresh(product.id)} className="p-1.5 rounded-full bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition"><RefreshCw size={16} /></button>
                <button onClick={() => onDelete(product.id)} className="p-1.5 rounded-full bg-gray-50 text-gray-400 hover:bg-red-50 hover:text-red-500 transition"><Trash2 size={16} /></button>
              </>
            ) : (
              <>
                <button onClick={saveEditing} className="p-1.5 rounded-full bg-green-50 text-green-600 hover:bg-green-100 transition"><Save size={16} /></button>
                <button onClick={cancelEditing} className="p-1.5 rounded-full bg-gray-50 text-gray-600 hover:bg-gray-100 transition"><X size={16} /></button>
              </>
            )}
          </div>
        </div>

        {/* Pricing Dashboard */}
        <div className="grid grid-cols-2 gap-4 mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100">
          <div>
             <span className="text-[10px] text-gray-500 uppercase font-bold block mb-1">Giá của bạn</span>
             {isEditing ? (
               <div className="space-y-2">
                 <input 
                    type="number"
                    className="w-full text-sm font-bold text-blue-700 bg-white border border-blue-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
                    value={editMyPrice}
                    onChange={(e) => setEditMyPrice(Number(e.target.value))}
                 />
                 <div className="flex items-center gap-1">
                   <span className="text-[10px] text-gray-500 w-8">Vốn:</span>
                   <input 
                      type="number"
                      placeholder="Giá vốn"
                      className="w-full text-xs text-gray-700 bg-white border border-gray-300 rounded px-2 py-1 outline-none"
                      value={editCostPrice}
                      onChange={(e) => setEditCostPrice(Number(e.target.value))}
                   />
                 </div>
                 <input 
                    type="text"
                    placeholder="Khuyến mại của bạn..."
                    className="w-full text-xs text-gray-700 bg-white border border-gray-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-500"
                    value={editMyPromotion}
                    onChange={(e) => setEditMyPromotion(e.target.value)}
                 />
               </div>
             ) : (
               <>
                 <span className="text-lg font-bold text-blue-700 block">{product.myPrice?.toLocaleString()} ₫</span>
                 {product.myPromotion && (
                    <div className="flex items-center gap-1 text-[10px] text-orange-600 mt-1">
                      <Gift size={10} className="shrink-0" />
                      <span className="line-clamp-1">{product.myPromotion}</span>
                    </div>
                 )}
                 {product.costPrice ? <span className="text-[10px] text-gray-400 block mt-1">Vốn: {product.costPrice?.toLocaleString()}</span> : null}
               </>
             )}
          </div>
          {product.strategy !== 'manual' && product.suggestedPrice && (
            <div>
               <span className="text-[10px] text-purple-600 uppercase font-bold flex items-center gap-1 mb-1">
                 <Zap size={10} /> Giá Gợi Ý
               </span>
               <div className="flex items-center gap-2">
                 <span className="text-lg font-bold text-purple-700">{product.suggestedPrice?.toLocaleString()} ₫</span>
               </div>
               <span className="text-[10px] text-gray-400">Chiến lược: {product.strategy}</span>
            </div>
          )}
        </div>

        {/* Competitor Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="pb-2 font-medium text-gray-500 w-1/3">Đối thủ</th>
                {!isEditing && (
                  <>
                    <th className="pb-2 font-medium text-gray-500 text-right">Giá bán</th>
                    <th className="pb-2 font-medium text-gray-500 text-right w-16">Chênh</th>
                  </>
                )}
                {isEditing && <th className="pb-2 font-medium text-gray-500">URL Sản Phẩm</th>}
                {isEditing && <th className="pb-2 w-16 text-center">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(!isEditing ? product.competitors : editedCompetitors).map((comp, index) => {
                
                if (isEditing) {
                  return (
                    <tr key={comp.id || index} className="group">
                      <td className="py-2 pr-2 align-top">
                        <input 
                          type="text" 
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                          placeholder="Tên shop"
                          value={comp.name}
                          onChange={(e) => handleEditChange(index, 'name', e.target.value)}
                        />
                      </td>
                      <td className="py-2 pr-2 align-top">
                         <input 
                          type="text" 
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:ring-1 focus:ring-blue-500 outline-none"
                          placeholder="https://..."
                          value={comp.url}
                          onChange={(e) => handleEditChange(index, 'url', e.target.value)}
                        />
                      </td>
                      <td className="py-2 align-top text-center flex justify-center gap-1">
                        <button
                          onClick={() => handleQuickCheck(index)}
                          disabled={!comp.url || refreshingIndex === index}
                          className={`p-1 rounded transition ${refreshingIndex === index ? 'text-blue-500 bg-blue-50' : 'text-gray-400 hover:text-blue-600 hover:bg-gray-100'}`}
                        >
                          <RefreshCw size={16} className={refreshingIndex === index ? 'animate-spin' : ''} />
                        </button>
                         <button 
                           onClick={() => removeCompetitor(index)}
                           className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded"
                         >
                           <Trash2 size={16} />
                         </button>
                      </td>
                    </tr>
                  )
                }

                // VIEW MODE
                const diffPercent = comp.currentPrice 
                  ? ((comp.currentPrice - product.myPrice) / product.myPrice) * 100 
                  : 0;
                
                const isCheapest = comp.currentPrice === minCompetitorPrice && minCompetitorPrice !== null && comp.stockStatus === 'in_stock';
                
                // Stock Icons
                let StockIcon = CheckCircle;
                let stockColor = "text-green-500";
                if (comp.stockStatus === 'out_of_stock') {
                  StockIcon = PackageX;
                  stockColor = "text-red-400";
                } else if (comp.stockStatus === 'contact') {
                  StockIcon = Phone;
                  stockColor = "text-orange-400";
                }

                return (
                  <tr key={comp.id} className="group">
                    <td className="py-2 pr-2 align-top">
                      <div className="flex items-center gap-1">
                        <a href={comp.url} target="_blank" rel="noopener noreferrer" className="text-gray-700 hover:text-blue-600 truncate font-medium max-w-[120px]">
                          {comp.name}
                        </a>
                        <span title={comp.stockStatus === 'in_stock' ? 'Còn hàng' : comp.stockStatus === 'out_of_stock' ? 'Hết hàng' : 'Liên hệ'}>
                          <StockIcon size={12} className={stockColor} />
                        </span>
                      </div>
                      
                      {comp.status !== 'unknown' && comp.status !== 'stable' && (
                        <span className={`inline-block text-[9px] px-1 rounded ${comp.status === 'decreased' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {comp.status === 'decreased' ? 'Giảm' : 'Tăng'}
                        </span>
                      )}
                      {comp.promotion && (
                        <div className="flex items-start gap-1 text-[10px] text-orange-600 mt-0.5">
                          <Gift size={9} className="mt-0.5 shrink-0" />
                          <span className="leading-tight line-clamp-1" title={comp.promotion}>{comp.promotion}</span>
                        </div>
                      )}
                    </td>
                    <td className={`py-2 text-right font-medium align-top ${isCheapest ? 'text-red-600' : 'text-gray-900'} ${comp.stockStatus === 'out_of_stock' ? 'opacity-50 line-through decoration-gray-400' : ''}`}>
                      {comp.currentPrice ? comp.currentPrice.toLocaleString() : '---'}
                    </td>
                    <td className="py-2 text-right align-top">
                       {comp.currentPrice ? (
                         <div className={`flex items-center justify-end gap-0.5 ${diffPercent > 0 ? 'text-green-600' : diffPercent < 0 ? 'text-red-600' : 'text-gray-400'}`}>
                           {diffPercent > 0 ? <ArrowUp size={10}/> : diffPercent < 0 ? <ArrowDown size={10}/> : <Minus size={10}/>}
                           <span className="text-xs font-bold">{Math.abs(diffPercent).toFixed(0)}%</span>
                         </div>
                       ) : (
                         <span className="text-gray-300">-</span>
                       )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          
          {isEditing && editedCompetitors.length < 5 && (
            <button 
              onClick={addEmptyCompetitor}
              className="mt-2 w-full py-1 border border-dashed border-gray-300 text-gray-500 rounded hover:bg-gray-50 text-xs flex items-center justify-center gap-1"
            >
              <Plus size={14} /> Thêm đối thủ
            </button>
          )}

        </div>

        {/* Errors */}
        {!isEditing && product.competitors.some(c => c.error) && (
          <div className="mt-3 text-[10px] text-red-500 bg-red-50 p-1.5 rounded flex items-center gap-1">
            <AlertCircle size={10} /> Lỗi lấy giá một số đối thủ
          </div>
        )}

        {/* Chart */}
        <div className="mt-4 pt-4 border-t border-gray-100">
           <PriceChart product={product} />
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
