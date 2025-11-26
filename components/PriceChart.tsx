import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts';
import { Product } from '../types';

interface PriceChartProps {
  product: Product;
}

const COLORS = ['#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

const PriceChart: React.FC<PriceChartProps> = ({ product }) => {
  // Aggregate all unique timestamps from all competitors
  const timestamps = new Set<string>();
  product.competitors.forEach(comp => {
    comp.priceHistory.forEach(point => timestamps.add(point.date));
  });
  
  // Sort timestamps
  const sortedTimestamps = Array.from(timestamps).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  // Create chart data
  const data = sortedTimestamps.map(dateStr => {
    const point: any = {
      date: new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'numeric' }),
      myPrice: product.myPrice,
    };

    product.competitors.forEach(comp => {
      // Find the price at or before this timestamp (simple lookback)
      // For exact plotting, we look for exact match or nearest previous
      const match = comp.priceHistory.find(p => p.date === dateStr);
      if (match) {
        point[comp.id] = match.price;
      } else {
        // Optional: Carry forward previous price if missing? 
        // For now, let's leave undefined so the line breaks if no data at that specific time
        // Or find nearest previous:
        const previous = [...comp.priceHistory]
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
          .find(p => new Date(p.date) <= new Date(dateStr));
         if (previous) point[comp.id] = previous.price;
      }
    });
    return point;
  });

  // Add "Now" point if we have current prices that might not be in history yet
  if (product.competitors.some(c => c.currentPrice)) {
    const nowPoint: any = {
      date: 'Hiện tại',
      myPrice: product.myPrice
    };
    product.competitors.forEach(c => {
      if (c.currentPrice) nowPoint[c.id] = c.currentPrice;
    });
    data.push(nowPoint);
  }

  if (data.length === 0) {
    return <div className="h-64 flex items-center justify-center text-gray-400">Chưa có dữ liệu lịch sử giá</div>;
  }

  return (
    <div className="h-64 w-full bg-white p-4 rounded-lg shadow-sm border border-gray-100">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Biến động giá</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="date" fontSize={11} stroke="#888888" />
          <YAxis fontSize={11} stroke="#888888" tickFormatter={(val) => `${(val/1000000).toFixed(1)}Tr`} />
          <Tooltip 
            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            formatter={(value: number, name: string) => {
               // Map id back to name for tooltip
               const comp = product.competitors.find(c => c.id === name);
               const label = comp ? comp.name : name;
               return [`${value.toLocaleString()} VND`, label];
            }}
          />
          <Legend formatter={(value) => {
             const comp = product.competitors.find(c => c.id === value);
             return comp ? comp.name : value;
          }}/>
          
          <Line 
            type="monotone" 
            dataKey="myPrice" 
            name="Giá của tôi" 
            stroke="#3b82f6" 
            strokeWidth={2} 
            strokeDasharray="5 5" 
            dot={false} 
          />

          {product.competitors.map((comp, index) => (
             <Line 
              key={comp.id}
              type="monotone" 
              dataKey={comp.id} 
              name={comp.name} // Used for internal reference, Legend formatter fixes display
              stroke={COLORS[index % COLORS.length]} 
              strokeWidth={2} 
              dot={{ r: 3 }} 
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default PriceChart;