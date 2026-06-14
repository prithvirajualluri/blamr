import React from 'react';
import { formatScaleCount } from '../utils/registry';

interface ScopeBannerProps {
  loaded: number;
  total: number;
  entity: string;
  hint?: string;
}

/** Shows when the UI is displaying a sample window of a larger dataset. */
export function ScopeBanner({ loaded, total, entity, hint }: ScopeBannerProps) {
  if (total <= loaded) return null;

  return (
    <div className="scope-banner" role="status">
      <span className="scope-banner-icon">◈</span>
      <div className="scope-banner-text">
        <strong>
          Showing {formatScaleCount(loaded)} of {formatScaleCount(total)} {entity}
        </strong>
        <span>
          {hint ??
            'Recent window loaded for responsiveness. Server-side pagination and search across full history are planned for production scale.'}
        </span>
      </div>
    </div>
  );
}
