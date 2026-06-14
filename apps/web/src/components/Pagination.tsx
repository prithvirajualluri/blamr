import React from 'react';
import { formatScaleCount } from '../utils/registry';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onPageChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="pagination">
      <span className="pagination-meta">
        {formatScaleCount(from)}–{formatScaleCount(to)} of {formatScaleCount(total)}
      </span>
      <div className="pagination-btns">
        <button type="button" className="btn" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Prev
        </button>
        <span className="pagination-page">
          {page} / {pages}
        </span>
        <button type="button" className="btn" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
