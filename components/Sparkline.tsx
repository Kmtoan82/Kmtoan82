import React from 'react';
import { PricePoint } from '../types';

interface SparklineProps {
  data: PricePoint[];
  color?: string;
  width?: number;
  height?: number;
}

const Sparkline: React.FC<SparklineProps> = ({ data, color = '#6b7280', width = 60, height = 25 }) => {
  if (!data || data.length === 0) return null;

  // Unique ID for gradient to avoid conflicts
  const gradientId = `grad-${color.replace('#', '')}-${Math.random().toString(36).substr(2, 9)}`;

  // Handle single data point case
  if (data.length === 1) {
     return (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
           <line x1="0" y1={height/2} x2={width} y2={height/2} stroke={color} strokeWidth="1.5" strokeOpacity="0.5" strokeDasharray="2 2" />
           <circle cx={width} cy={height/2} r="2" fill={color} />
        </svg>
     );
  }

  const sortedData = [...data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const prices = sortedData.map(d => d.price);
  
  // Calculate min/max with some padding so the line doesn't hug the edges tightly
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const padding = (max - min) * 0.2 || min * 0.05; 
  const displayMin = Math.max(0, min - padding);
  const displayMax = max + padding;
  const range = displayMax - displayMin;

  const points = sortedData.map((d, i) => {
    const x = (i / (sortedData.length - 1)) * width;
    // Invert Y because SVG 0 is at top
    const normalizedY = (d.price - displayMin) / range;
    const y = height - (normalizedY * height);
    return `${x},${y}`;
  }).join(' ');

  // Create area polygon path
  const areaPoints = `${points} ${width},${height} 0,${height}`;

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={color} stopOpacity={0.2} />
          <stop offset="95%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#${gradientId})`} />
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        points={points}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Dot at the end */}
      <circle 
        cx={width} 
        cy={height - ((prices[prices.length - 1] - displayMin) / range * height)} 
        r="2" 
        fill={color} 
      />
    </svg>
  );
};

export default Sparkline;