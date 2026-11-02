import React from 'react';
import { Minus, Plus, Trash2, Package } from 'lucide-react';
import { PaisePrice } from './PaisePrice';
import { CartItem } from '@/types/domain';

export interface CartItemRowProps {
  item: CartItem;
  imageUrl?: string | null;
  onQuantityChange?: (itemId: string, newQuantity: number) => void;
  disabled?: boolean;
}

export const CartItemRow: React.FC<CartItemRowProps> = ({
  item,
  imageUrl,
  onQuantityChange,
  disabled = false,
}) => {
  return (
    <div className="flex items-center justify-between gap-3 p-3.5 bg-white rounded-2xl border border-[#E2EDF8] hover:border-[#CBD5E1] transition-colors">
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-12 h-12 rounded-xl bg-[#F8FBFE] border border-[#E2EDF8] flex items-center justify-center flex-shrink-0 overflow-hidden">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imageUrl}
              alt={item.product_name_snapshot}
              className="w-full h-full object-cover"
            />
          ) : (
            <Package className="w-5 h-5 text-[#7B8BA0]" />
          )}
        </div>

        <div className="min-w-0">
          <h4 className="text-xs sm:text-sm font-bold text-[#0F2A43] truncate">
            {item.product_name_snapshot}
          </h4>
          <div className="flex items-center gap-2 text-[11px] text-[#7B8BA0] mt-0.5">
            <span className="font-mono bg-[#F1F5F9] px-1.5 py-0.2 rounded text-[10px]">
              {item.barcode_snapshot}
            </span>
            <span>•</span>
            <PaisePrice paise={item.unit_price_paise} size="sm" />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 flex-shrink-0">
        {/* Quantity Stepper */}
        {onQuantityChange && !disabled ? (
          <div className="flex items-center gap-1.5 bg-[#F8FBFE] border border-[#E2EDF8] rounded-full p-1">
            <button
              onClick={() => onQuantityChange(item.id, item.quantity - 1)}
              className="w-6 h-6 rounded-full bg-white border border-[#E2EDF8] flex items-center justify-center text-[#0F2A43] hover:bg-[#F1F5F9] transition-colors"
            >
              {item.quantity === 1 ? (
                <Trash2 className="w-3 h-3 text-[#EF4444]" />
              ) : (
                <Minus className="w-3 h-3" />
              )}
            </button>

            <span className="w-6 text-center text-xs font-bold text-[#0F2A43]">
              {item.quantity}
            </span>

            <button
              onClick={() => onQuantityChange(item.id, item.quantity + 1)}
              className="w-6 h-6 rounded-full bg-white border border-[#E2EDF8] flex items-center justify-center text-[#0F2A43] hover:bg-[#F1F5F9] transition-colors"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <span className="text-xs font-bold text-[#7B8BA0] px-2">
            Qty: {item.quantity}
          </span>
        )}

        {/* Total Price */}
        <div className="text-right min-w-[70px]">
          <PaisePrice paise={item.total_price_paise} size="md" />
        </div>
      </div>
    </div>
  );
};
