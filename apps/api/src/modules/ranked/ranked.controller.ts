import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, getAuthenticatedUser } from '../../middleware';
import { getPlacementStatus, getRankedProgress } from './ranked.service';
import { seasonIdParamSchema } from './ranked.schemas';

const router = Router();

/**
 * GET /api/v1/ranked/season/:seasonId/placement
 *
 * Get placement match status and history for the authenticated user.
 * Returns full audit trail of placement matches played.
 *
 * @route GET /api/v1/ranked/season/:seasonId/placement
 * @access Private (requireAuth)
 * @returns {PlacementStatus} 200 - Placement status with match history
 * @returns {Error} 404 - User has not participated in this season
 * @returns {Error} 401 - Unauthorized
 */
router.get(
  '/season/:seasonId/placement',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const { seasonId } = seasonIdParamSchema.parse(req.params);
      const result = await getPlacementStatus(user.id, seasonId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/ranked/season/:seasonId/progress
 *
 * Get ranked progression stats for the authenticated user.
 * Returns win/loss record, rank, and RP progression info.
 *
 * @route GET /api/v1/ranked/season/:seasonId/progress
 * @access Private (requireAuth)
 * @returns {RankedProgress} 200 - Ranked progression stats
 * @returns {Error} 404 - User has not participated in this season
 * @returns {Error} 401 - Unauthorized
 */
router.get(
  '/season/:seasonId/progress',
  requireAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = getAuthenticatedUser(req);
      const { seasonId } = seasonIdParamSchema.parse(req.params);
      const result = await getRankedProgress(user.id, seasonId);
      res.status(200).json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
