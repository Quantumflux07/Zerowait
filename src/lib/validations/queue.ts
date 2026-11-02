import { z } from 'zod';

export const queueAssignmentSchema = z.object({
  session_id: z.string().uuid(),
  preferred_type: z.enum(['EXPRESS', 'REGULAR', 'SELF_CHECKOUT']).optional(),
});

export const laneWorkloadSchema = z.object({
  store_id: z.string().uuid().optional(),
});
