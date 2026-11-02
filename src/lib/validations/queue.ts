import { z } from 'zod';

export const queueAssignmentSchema = z.object({
  session_id: z.string().min(1),
  preferred_type: z.enum(['EXPRESS', 'REGULAR', 'SELF_CHECKOUT']).optional(),
  target_lane_id: z.string().optional(),
});

export const laneWorkloadSchema = z.object({
  store_id: z.string().optional(),
});
