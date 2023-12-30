import type {NextFunction, Request, Response} from 'express';
import {AuthService} from '../services';
import {ApiResponse} from '@budgetbuddyde/types';
import {ELogCategory, log} from './log.middleware';

/**
 * Middleware function to check the authorization header in the request.
 * If the authorization header is missing or invalid, it returns a 401 Unauthorized response.
 * Otherwise, it calls the next middleware function.
 *
 * @param req - The Express request object.
 * @param res - The Express response object.
 * @param next - The next middleware function.
 */
export async function checkAuthorizationHeader(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res
      .status(401)
      .json(ApiResponse.builder().withStatus(401).withMessage('No Bearer token provided').build())
      .end();
  }

  const [user, err] = await AuthService.validateAuthHeader(authHeader);
  if (err || !user) {
    log('ERROR', ELogCategory.AUTHENTIFICATION, err instanceof Error ? err.message : err!);
    return res
      .status(401)
      .json(ApiResponse.builder().withStatus(401).withMessage('Invalid Bearer token provided').build())
      .end();
  }

  req.user = user;

  next();
}
