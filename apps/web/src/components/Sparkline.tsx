import React from 'react';
import { accCol } from '../utils/format';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  title?: string;
}

/** Compact accuracy trend — fixed bar count for millions of underlying runs. */
export function Sparkline({ values, width = 120, height = 22, title }: SparklineProps) {
  if (!values.length) {
    return (
      <svg width={width} height={height} className="sparkline" aria-hidden>
        <rect x={0} y={0} width={width} height={height} fill="transparent" />
      </svg>
    );
  }

  const barW = Math.max(2, (width - values.length) / values.length);

  return (
    <svg width={width} height={height} className="sparkline" role="img" aria-label={title}>
      {values.map((v, i) => {
        const h = Math.max(2, v * (height - 2));
        return (
          <rect
            key={i}
            x={i * (barW + 1)}
            y={height - h}
            width={barW}
            height={h}
            rx={1}
            fill={accCol(v)}
            opacity={0.45 + v * 0.55}
          />
        );
      })}
    </svg>
  );
}
