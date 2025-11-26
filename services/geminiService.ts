import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { StockStatus } from "../types";

// Initialize Gemini Client
const getClient = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper for retry logic
async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 10, // Increased retries to handle 429
  initialDelay: number = 5000 // Initial delay 5s
): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      // Check for rate limit errors (429 or RESOURCE_EXHAUSTED)
      const isRateLimit = 
        error?.status === 429 || 
        error?.code === 429 || 
        (error?.message && error.message.includes('429')) ||
        (error?.error && error.error.code === 429) ||
        error?.status === 'RESOURCE_EXHAUSTED';
      
      if (isRateLimit && i < maxRetries - 1) {
        // Backoff: 5s, 10s, 20s, 40s...
        const waitTime = initialDelay * Math.pow(2, i);
        console.warn(`Gemini rate limit hit. Retrying in ${waitTime}ms... (Attempt ${i + 1}/${maxRetries})`);
        await delay(waitTime);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export const checkCompetitorPrice = async (
  productName: string,
  competitorUrl: string,
  competitorName: string
): Promise<{ price: number; currency: string; promotion?: string; stockStatus: StockStatus } | null> => {
  try {
    const ai = getClient();
    
    // Updated prompt with specific rules for Vietnamese Tech Retailers (HNC/Hacom, AnPhat, GearVN, etc.)
    const prompt = `
      Analyze this specific product page to extract the current selling price and stock status:
      Product: "${productName}"
      Competitor: "${competitorName}"
      URL: ${competitorUrl}
      
      CRITICAL RULES FOR PRICE EXTRACTION:
      1. Vietnam Tech Sites (Hacom, AnPhat, GearVN, PhongVu) often display TWO prices:
         - "Giá niêm yết" / "Giá thị trường" (List Price - High, often crossed out)
         - "Giá khuyến mại" / "Giá bán" / "Giá ưu đãi" (Promo Price - Low, this is the REAL price).
      2. **ALWAYS SELECT THE LOWEST VISIBLE NUMERIC PRICE**. 
         - Ignore installment prices (Trả góp).
         - Example: If text shows "799.000 đ" and "719.000 đ", the return price MUST be 719000.
      3. **Hacom/HNC Specific**: Look for "Giá KM" or the big red price text. Ignore "Giá bán" if "Giá KM" exists and is lower.

      Return ONLY a valid JSON object.
      
      JSON Format:
      {
        "price": number, // The lowest valid selling price in VND.
        "currency": "VND",
        "promotion": string | null, // e.g., "Tặng chuột", "Voucher 50k"
        "stockStatus": "in_stock" | "out_of_stock" | "contact" | "unknown"
      }
      
      Stock Keywords Map:
      - "Còn hàng", "Sẵn hàng", "In stock" -> "in_stock"
      - "Hết hàng", "Tạm hết", "Out of stock" -> "out_of_stock"
      - "Liên hệ", "Đặt hàng" -> "contact"
    `;

    // Wrap API call in retry logic
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    }));

    let text = response.text;
    if (!text) return null;

    // Clean up potential markdown code blocks
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    
    // Extract JSON object if embedded in text
    const startIndex = text.indexOf('{');
    const endIndex = text.lastIndexOf('}');

    if (startIndex !== -1 && endIndex !== -1) {
      text = text.substring(startIndex, endIndex + 1);
    } else if (text.toLowerCase().includes('null')) {
      return null;
    } else {
       // Only return null if we absolutely can't find JSON braces
       return null;
    }

    try {
      const data = JSON.parse(text);
      if (data && typeof data.price === 'number') {
        if (!['in_stock', 'out_of_stock', 'contact'].includes(data.stockStatus)) {
          data.stockStatus = 'unknown';
        }
        return data;
      }
      return null;
    } catch (e) {
      console.error("Failed to parse Gemini response:", text, e);
      return null;
    }

  } catch (error) {
    console.error("Error checking price with Gemini:", error);
    return null;
  }
};

export const searchSiteProducts = async (query: string): Promise<Array<{ name: string; price: number; url: string; category?: string; sku?: string }> | null> => {
  try {
    const ai = getClient();
    
    const cleanQuery = query.trim();
    const isLikelySKU = /^[A-Z0-9-]{3,}$/i.test(cleanQuery) && !cleanQuery.includes(" ");
    
    // Specific search context for AnPhatPC
    const searchContext = isLikelySKU 
      ? `site:anphatpc.com.vn "${cleanQuery}"`
      : `site:anphatpc.com.vn ${cleanQuery} ("Giá khuyến mại" OR "Giảm")`;

    const prompt = `
      You are a price extraction engine for AnPhatPC (anphatpc.com.vn).
      Task: Search for products matching "${query}" using the query: '${searchContext}'.
      
      CRITICAL PRICE RULES:
      1. AnPhatPC listings often show TWO prices.
      2. **YOU MUST SELECT THE LOWEST PRICE**. 
      3. Extract SKU (Mã SP) if available (e.g., MULGxxxx, LAPxxxx).
      
      Return ONLY a valid JSON array. No conversational text.
      
      JSON Format:
      [
        {
          "name": "Full Product Name",
          "price": 399000, // Number only. MUST be the lower Promo Price.
          "url": "https://www.anphatpc.com.vn/...",
          "category": "Mouse/Laptop/Screen...",
          "sku": "MULG0094"
        }
      ]

      If no products are found, return [].
    `;

    // Wrap API call in retry logic
    const response = await retryOperation<GenerateContentResponse>(() => ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      },
    }));

    let text = response.text;
    if (!text) return null;

    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const startIndex = text.indexOf('[');
    const endIndex = text.lastIndexOf(']');

    if (startIndex !== -1 && endIndex !== -1) {
      text = text.substring(startIndex, endIndex + 1);
    } else {
      return [];
    }

    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return data.filter(item => item && item.name);
      }
      return [];
    } catch (e) {
      console.error("Failed to parse Gemini search response:", text, e);
      return [];
    }
  } catch (error) {
    console.error("Error searching site products:", error);
    return [];
  }
};