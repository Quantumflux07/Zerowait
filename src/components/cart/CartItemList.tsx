'use client';

/**
 * CartItemList
 * Renders the scrollable list of scanned products.
 * Shows empty state if no items. All data is from server-authoritative snapshots.
 */

import React from 'react';
import { ShoppingCart, PackageOpen } from 'lucide-react';
import { CartItemRow } from '@/components/zerowait/CartItemRow';
import type { CartItem } from '@/types/domain';

export interface CartItemListProps {
  items: CartItem[];
  onQuantityChange?: (itemId: string, newQuantity: number) => void;
  disabled?: boolean;
  productImages?: Record<string, string | null>; // product_id -> image_url
}

export const CartItemList: React.FC<CartItemListProps> = ({
  items,
  onQuantityChange,
  disabled = false,
  productImages = {},
}) => {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-16 h-16 rounded-[22px] bg-[#EAF4FF] border border-[#BAE6FD] flex items-center justify-center text-[#4DB3E6] mb-4">
          <ShoppingCart className="w-8 h-8 stroke-[1.8]" />
        </div>
        <p className="text-sm font-bold text-[#0F2A43]">Cart is Empty</p>
        <p className="text-xs text-[#7B8BA0] mt-1 max-w-[200px] leading-relaxed">
          Scan a product barcode to add it to your cart.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center gap-2 px-1 mb-1">
        <PackageOpen className="w-4 h-4 text-[#7B8BA0]" />
        <h3 className="text-xs font-bold text-[#7B8BA0] uppercase tracking-wider">
          Scanned Items · {items.length}
        </h3>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {items.map((item) => (
          <CartItemRow
            key={item.id}
            item={item}
            imageUrl={productImages[item.product_id] ?? null}
            onQuantityChange={onQuantityChange}
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
};
