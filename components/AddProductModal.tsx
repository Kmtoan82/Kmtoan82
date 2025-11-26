
import React, { useState } from 'react';
import { X, Plus, Trash2, FileSpreadsheet, Globe, Search, Loader2, ShieldCheck, DollarSign, Barcode, Gift, Download, Save } from 'lucide-react';
import { AddProductFormData, CATEGORIES, Category, CompetitorFormData, PricingStrategy, Product } from '../types';
import * as XLSX from 'xlsx';
import { searchSiteProducts } from '../services/geminiService';

interface AddProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (data: AddProductFormData) => void;
  onBulkAdd: (data: AddProductFormData[]) => void;
  currentProducts?: Product[]; // For backup
}

const AddProductModal: React.FC<AddProductModalProps> = ({ isOpen, onClose, onAdd, onBulkAdd, currentProducts }) => {
  const [mode, setMode] = useState<'single' | 'bulk' | 'search'>('single');
  
  // Single Mode State
  const [name, setName] = useState('');
  const [sku, setSku] = useState('');
  const [myPrice, setMyPrice] = useState<number>(0);
  const [myPromotion, setMyPromotion] = useState('');
  const [costPrice, setCostPrice] = useState<number>(0);
  const [minPrice, setMinPrice] = useState<number>(0);
  const [strategy, setStrategy] = useState<PricingStrategy>('manual');
  const [category, setCategory] = useState<Category>('Laptop');
  const [competitors, setCompetitors] = useState<CompetitorFormData[]>([
    { name: '', url: '' }
  ]);

  // Bulk Mode State
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<AddProductFormData[]>([]);

  // Search Mode State
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{ name: string; price: number; url: string; category?: string; sku?: string; selected: boolean }>>([]);

  if (!isOpen) return null;

  // --- Single Mode Handlers ---
  const handleAddCompetitorRow = () => {
    if (competitors.length < 5) {
      setCompetitors([...competitors, { name: '', url: '' }]);
    }
  };

  const handleRemoveCompetitorRow = (index: number) => {
    const newComps = [...competitors];
    newComps.splice(index, 1);
    setCompetitors(newComps);
  };

  const handleCompetitorChange = (index: number, field: keyof CompetitorFormData, value: string) => {
    const newComps = [...competitors];
    newComps[index] = { ...newComps[index], [field]: value };
    setCompetitors(newComps);
  };

  const handleSingleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validCompetitors = competitors.filter(c => c.name.trim() !== '' && c.url.trim() !== '');
    
    onAdd({
      name,
      sku,
      myPrice,
      myPromotion,
      costPrice: costPrice || undefined,
      minPrice: minPrice || undefined,
      strategy,
      category,
      competitors: validCompetitors
    });
    resetForm();
    onClose();
  };

  // --- Bulk Excel Handlers ---
  const handleDownloadTemplate = () => {
    // Updated structure: SKU first
    const headers = [
      {
        SKU: "DELL-G15-5515",
        ProductName: "Laptop Gaming Dell G15",
        MyPrice: 25000000,
        MyPromotion: "Tặng Balo + Chuột",
        CostPrice: 22000000,
        MinPrice: 23000000,
        Category: "Laptop",
        Competitor1_Name: "Phong Vũ",
        Competitor1_URL: "https://phongvu.vn/...",
        Competitor2_Name: "GearVN",
        Competitor2_URL: "https://gearvn.com/...",
        Competitor3_Name: "",
        Competitor3_URL: "",
        Competitor4_Name: "",
        Competitor4_URL: "",
        Competitor5_Name: "",
        Competitor5_URL: ""
      }
    ];

    const ws = XLSX.utils.json_to_sheet(headers);
    const wscols = [
      {wch: 15}, // SKU
      {wch: 30}, // ProductName
      {wch: 12}, // MyPrice
      {wch: 20}, // MyPromotion
      {wch: 12}, // CostPrice
      {wch: 12}, // MinPrice
      {wch: 15}, // Category
      {wch: 15}, // Comp1 Name
      {wch: 30}, // Comp1 URL
      {wch: 15}, // Comp2 Name
      {wch: 30}, // Comp2 URL
    ];
    ws['!cols'] = wscols;

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mau_Nhap_Lieu");
    XLSX.writeFile(wb, "Mau_Nhap_Lieu_Gia.xlsx");
  };

  const handleDownloadBackup = () => {
    if (!currentProducts || currentProducts.length === 0) {
      alert("Không có dữ liệu để backup!");
      return;
    }

    const backupData = currentProducts.map(p => {
       const row: any = {
        SKU: p.sku || '',
        ProductName: p.name,
        MyPrice: p.myPrice,
        MyPromotion: p.myPromotion || '',
        CostPrice: p.costPrice || 0,
        MinPrice: p.minPrice || 0,
        Category: p.category,
       };
       p.competitors.forEach((c, idx) => {
         row[`Competitor${idx+1}_Name`] = c.name;
         row[`Competitor${idx+1}_URL`] = c.url;
       });
       return row;
    });

    const ws = XLSX.utils.json_to_sheet(backupData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Backup_Data");
    XLSX.writeFile(wb, `Backup_Gia_${new Date().toISOString().slice(0,10)}.xlsx`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      readExcel(selectedFile);
    }
  };

  const readExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      const data = XLSX.utils.sheet_to_json(ws);
      
      const parsedProducts: AddProductFormData[] = data.map((row: any) => {
        const comps: CompetitorFormData[] = [];
        for (let i = 1; i <= 5; i++) {
          const cName = row[`Competitor${i}_Name`];
          const cUrl = row[`Competitor${i}_URL`];
          if (cName && cUrl) {
            comps.push({ name: cName, url: cUrl });
          }
        }

        return {
          name: row['ProductName'] || 'Unknown Product',
          sku: row['SKU'] || '',
          myPrice: Number(row['MyPrice']) || 0,
          myPromotion: row['MyPromotion'] || '',
          costPrice: Number(row['CostPrice']) || 0,
          minPrice: Number(row['MinPrice']) || 0,
          strategy: 'manual', // Default for bulk
          category: (CATEGORIES.includes(row['Category']) ? row['Category'] : 'Khác') as Category,
          competitors: comps
        };
      });

      setPreviewData(parsedProducts);
    };
    reader.readAsBinaryString(file);
  };

  const handleBulkSubmit = () => {
    onBulkAdd(previewData);
    setPreviewData([]);
    setFile(null);
    onClose();
  };

  // --- Website Search Handlers ---
  const handleSiteSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchResults([]);
    
    const results = await searchSiteProducts(searchQuery);
    
    setIsSearching(false);
    if (results) {
      setSearchResults(results.map(r => ({ ...r, selected: false })));
    }
  };

  const toggleSearchResultSelection = (index: number) => {
    const newResults = [...searchResults];
    newResults[index].selected = !newResults[index].selected;
    setSearchResults(newResults);
  };

  const handleImportSearchResults = () => {
    const selected = searchResults.filter(r => r.selected);
    const productsToAdd: AddProductFormData[] = selected.map(item => ({
      name: item.name,
      sku: item.sku || '',
      myPrice: item.price,
      strategy: 'manual',
      category: (CATEGORIES.find(c => item.category?.includes(c)) || 'Khác') as Category,
      competitors: [] 
    }));

    onBulkAdd(productsToAdd);
    resetForm();
    onClose();
  };

  // --- Common ---
  const resetForm = () => {
    setName('');
    setSku('');
    setMyPrice(0);
    setMyPromotion('');
    setCostPrice(0);
    setMinPrice(0);
    setStrategy('manual');
    setCategory('Laptop');
    setCompetitors([{ name: '', url: '' }]);
    setPreviewData([]);
    setFile(null);
    setSearchQuery('');
    setSearchResults([]);
    setIsSearching(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl transform transition-all scale-100 my-8 flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-6 border-b shrink-0">
          <div className="flex gap-4">
            <button 
              onClick={() => setMode('single')}
              className={`pb-2 text-sm font-semibold border-b-2 transition ${mode === 'single' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              Thêm Thủ Công
            </button>
             <button 
              onClick={() => setMode('search')}
              className={`pb-2 text-sm font-semibold border-b-2 transition flex items-center gap-1 ${mode === 'search' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <Globe size={14} />
              Tìm từ AnPhatPC
            </button>
            <button 
              onClick={() => setMode('bulk')}
              className={`pb-2 text-sm font-semibold border-b-2 transition flex items-center gap-1 ${mode === 'bulk' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
            >
              <FileSpreadsheet size={14} />
              Upload Excel
            </button>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X size={24} />
          </button>
        </div>
        
        <div className="overflow-y-auto flex-1">
          {mode === 'single' && (
            <form onSubmit={handleSingleSubmit} className="p-6 space-y-6">
              
              {/* Product Info Section */}
              <div className="space-y-4">
                <h4 className="text-sm uppercase tracking-wide text-gray-500 font-bold border-b pb-2">Thông tin sản phẩm</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tên sản phẩm <span className="text-red-500">*</span></label>
                    <input
                      required
                      type="text"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"><Barcode size={14}/> SKU / Mã sản phẩm</label>
                    <input
                      type="text"
                      placeholder="VD: LAP-DELL-G15"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      value={sku}
                      onChange={(e) => setSku(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Danh mục</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      value={category}
                      onChange={(e) => setCategory(e.target.value as Category)}
                    >
                      {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Pricing & Strategy Section */}
              <div className="space-y-4 bg-blue-50 p-4 rounded-xl border border-blue-100">
                <h4 className="text-sm uppercase tracking-wide text-blue-700 font-bold border-b border-blue-200 pb-2 flex items-center gap-2">
                  <DollarSign size={16} /> Giá & Chiến lược
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                   <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Giá bán hiện tại</label>
                    <input
                      required
                      type="number"
                      min="0"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      value={myPrice || ''}
                      onChange={(e) => setMyPrice(Number(e.target.value))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1"><Gift size={14}/> Khuyến mại của tôi</label>
                    <input
                      type="text"
                      placeholder="VD: Tặng Balo + Chuột không dây"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      value={myPromotion}
                      onChange={(e) => setMyPromotion(e.target.value)}
                    />
                  </div>
                   <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1" title="Giá nhập vào, dùng để tính lãi">
                      Giá vốn (Cost)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Tùy chọn"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      value={costPrice || ''}
                      onChange={(e) => setCostPrice(Number(e.target.value))}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1" title="Giá thấp nhất có thể bán (Guardrail)">
                      <ShieldCheck size={14} className="text-green-600"/> Giá sàn (Min Price)
                    </label>
                    <input
                      type="number"
                      min="0"
                      placeholder="Tùy chọn"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                      value={minPrice || ''}
                      onChange={(e) => setMinPrice(Number(e.target.value))}
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Chiến lược giá tự động (Gợi ý)</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                      value={strategy}
                      onChange={(e) => setStrategy(e.target.value as PricingStrategy)}
                    >
                      <option value="manual">Thủ công (Không gợi ý)</option>
                      <option value="match_lowest">Bằng giá đối thủ thấp nhất</option>
                      <option value="beat_lowest_5k">Rẻ hơn đối thủ thấp nhất 5.000đ</option>
                      <option value="beat_lowest_10k">Rẻ hơn đối thủ thấp nhất 10.000đ</option>
                    </select>
                    <p className="text-xs text-gray-500 mt-1">
                      * Hệ thống sẽ tính toán giá gợi ý nhưng không bao giờ thấp hơn Giá sàn hoặc Giá vốn (nếu có).
                    </p>
                  </div>
                </div>
              </div>

              {/* Competitors Section */}
              <div className="space-y-4">
                <div className="flex justify-between items-center border-b pb-2">
                  <h4 className="text-sm uppercase tracking-wide text-gray-500 font-bold">Đối thủ cạnh tranh ({competitors.length}/5)</h4>
                  {competitors.length < 5 && (
                    <button type="button" onClick={handleAddCompetitorRow} className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1">
                      <Plus size={14} /> Thêm
                    </button>
                  )}
                </div>
                
                <div className="space-y-3">
                  {competitors.map((comp, idx) => (
                    <div key={idx} className="flex gap-2 items-start bg-gray-50 p-3 rounded-lg">
                      <div className="flex-1 space-y-2">
                        <input
                          placeholder="Tên shop (VD: Phong Vũ)"
                          className="w-full text-sm px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                          value={comp.name}
                          onChange={(e) => handleCompetitorChange(idx, 'name', e.target.value)}
                        />
                        <input
                          placeholder="Link sản phẩm (https://...)"
                          className="w-full text-sm px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                          value={comp.url}
                          onChange={(e) => handleCompetitorChange(idx, 'url', e.target.value)}
                        />
                      </div>
                      {competitors.length > 1 && (
                        <button 
                          type="button" 
                          onClick={() => handleRemoveCompetitorRow(idx)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 sticky bottom-0 bg-white border-t mt-6">
                <button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg shadow transition duration-200 text-lg"
                >
                  Lưu Sản Phẩm
                </button>
              </div>
            </form>
          )}

          {/* Search and Bulk modes remain largely similar but utilize AddProductFormData structure */}
          {mode === 'search' && (
            <div className="p-6 h-full flex flex-col">
              <form onSubmit={handleSiteSearch} className="flex gap-2 mb-6">
                <div className="relative flex-1">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                   <input 
                    type="text"
                    placeholder="Nhập tên sản phẩm hoặc mã SKU (VD: MULG0093)"
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                   />
                </div>
                <button 
                  type="submit" 
                  disabled={isSearching}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-blue-300 font-medium transition flex items-center gap-2"
                >
                  {isSearching ? <Loader2 className="animate-spin" size={20}/> : 'Tìm kiếm'}
                </button>
              </form>

              <div className="flex-1 overflow-y-auto min-h-[300px] border rounded-lg bg-gray-50 p-2">
                {isSearching ? (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500">
                    <Loader2 className="animate-spin mb-2" size={32} />
                    <p>Đang quét dữ liệu từ anphatpc.com.vn...</p>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="space-y-2">
                    {searchResults.map((item, idx) => (
                      <div 
                        key={idx} 
                        className={`flex items-start gap-3 p-3 rounded-lg border transition cursor-pointer ${item.selected ? 'bg-blue-50 border-blue-300' : 'bg-white border-gray-200 hover:border-blue-200'}`}
                        onClick={() => toggleSearchResultSelection(idx)}
                      >
                         <input 
                           type="checkbox" 
                           checked={item.selected} 
                           onChange={() => {}} 
                           className="mt-1 h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                         />
                         <div className="flex-1">
                           <h4 className="font-semibold text-gray-900 text-sm line-clamp-2">{item.name}</h4>
                           <div className="flex flex-wrap items-center gap-2 mt-1">
                             <span className="text-blue-700 font-bold text-sm">{item.price?.toLocaleString() || '---'} ₫</span>
                             {item.sku && (
                               <span className="text-xs bg-gray-200 px-2 py-0.5 rounded text-gray-600 flex items-center gap-1">
                                 <Barcode size={10} /> {item.sku}
                               </span>
                             )}
                             {item.category && <span className="text-xs bg-gray-100 px-2 py-0.5 rounded text-gray-600">{item.category}</span>}
                           </div>
                         </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center text-gray-400">
                    <p>Nhập tên sản phẩm hoặc SKU (VD: MULG0093) để tìm kiếm</p>
                  </div>
                )}
              </div>

              {searchResults.some(r => r.selected) && (
                 <div className="pt-4 mt-auto">
                    <button
                      onClick={handleImportSearchResults}
                      className="w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg shadow transition duration-200"
                    >
                      Thêm {searchResults.filter(r => r.selected).length} Sản Phẩm Đã Chọn
                    </button>
                 </div>
              )}
            </div>
          )}

          {mode === 'bulk' && (
            <div className="p-6 space-y-4">
              <div className="flex justify-end gap-2">
                 {currentProducts && currentProducts.length > 0 && (
                  <button 
                    onClick={handleDownloadBackup}
                    className="flex items-center gap-2 text-sm text-green-600 hover:text-green-800 border border-green-200 hover:border-green-400 bg-green-50 px-3 py-1.5 rounded transition"
                  >
                    <Save size={14} />
                    Backup Dữ Liệu
                  </button>
                 )}
                <button 
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 border border-blue-200 hover:border-blue-400 bg-blue-50 px-3 py-1.5 rounded transition"
                >
                  <Download size={14} />
                  Tải File Mẫu (.xlsx)
                </button>
              </div>

              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center bg-gray-50">
                 <FileSpreadsheet className="mx-auto h-12 w-12 text-gray-400" />
                 <p className="mt-2 text-sm text-gray-600">Upload file Excel (.xlsx)</p>
                 <input 
                   type="file" 
                   accept=".xlsx, .xls"
                   onChange={handleFileUpload}
                   className="mt-4 block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                 />
                 <div className="mt-4 text-xs text-left text-gray-500 bg-white p-3 rounded border">
                   <p className="font-semibold mb-1">Cấu trúc file mẫu (Header Row):</p>
                   <code>SKU | ProductName | MyPrice | MyPromotion | CostPrice | MinPrice | Category | Competitor1_Name | Competitor1_URL ...</code>
                 </div>
              </div>

              {previewData.length > 0 && (
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-green-700 font-medium">Đã đọc được {previewData.length} sản phẩm từ file.</p>
                  <button
                    onClick={handleBulkSubmit}
                    className="mt-3 w-full bg-green-600 hover:bg-green-700 text-white font-semibold py-2 px-4 rounded-lg shadow transition duration-200"
                  >
                    Nhập {previewData.length} Sản Phẩm
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddProductModal;
