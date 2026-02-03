import { z } from 'zod';

export const seasonIdParamSchema = z.object({
  seasonId: z.string().uuid(),
});
