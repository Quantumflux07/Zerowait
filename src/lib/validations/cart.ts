import { z } from 'zod';

export const productLookupSchema = z.object({
  barcode: z.string().min(3).max(64),
  store_id: z.string().min(1).optional(),
});

export const cartRetrievalSchema = z.object({
  qr_code: z.string().min(3).max(64),
});

export const scanProductSchema = z.object({
  session_id: z.string().min(1),
  barcode: z.string().min(3).max(64),
  quantity: z.number().int().positive().default(1),
});

export const updateCartItemSchema = z.object({
  session_id: z.string().min(1),
  item_id: z.string().min(1),
  quantity: z.number().int().min(0).max(999), // 0 means remove from cart
});

export const checkoutStateUpdateSchema = z.object({
  session_id: z.string().min(1),
  next_status: z.enum([
    'SHOPPING',
    'ASSIGNED_LOCKED',
    'AT_CHECKOUT',
    'PAYMENT_PENDING',
    'PAID',
    'CLOSED',
    'EXCEPTION',
  ]),
  payment_info: z
    .object({
      method: z.enum(['UPI', 'CARD', 'CASH', 'NET_BANKING', 'WALLET']),
      reference: z.string().optional(),
      amount_paise: z.number().int().positive(),
    })
    .optional(),
});
