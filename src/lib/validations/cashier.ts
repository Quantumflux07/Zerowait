import { z } from 'zod';

export const cashierCartQuerySchema = z.object({
  qr_code: z.string().min(1, 'Cart QR code is required').max(64),
  lane_id: z.string().optional(),
});

export const cashierCheckinSchema = z.object({
  session_id: z.string().min(1, 'Session ID is required'),
  lane_id: z.string().min(1, 'Lane ID is required'),
});

export const cashierSettleSchema = z.object({
  session_id: z.string().min(1, 'Session ID is required'),
  payment_method: z.enum(['UPI', 'CARD', 'CASH', 'NET_BANKING', 'WALLET']),
  payment_reference: z.string().max(100).optional(),
  amount_paise: z.number().int().nonnegative('Amount must be a non-negative integer paise'),
  cashier_lane_id: z.string().optional(),
});

export const cashierReleaseSchema = z.object({
  session_id: z.string().min(1, 'Session ID is required'),
});

