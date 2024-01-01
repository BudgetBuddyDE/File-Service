import type {NextFunction, Request, Response} from 'express';
import {AuthService} from '../services';
import {ApiResponse, HTTPStatusCode} from '@budgetbuddyde/types';
import {ELogCategory, log} from './log.middleware';
import {z} from 'zod';

export const ZUuid = z.string().uuid();

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

  // README!!!
  // All files are stored in the format /static/<user.uuid>/<filename>
  // Files that aren't stored under /static/<user.uuid> are not accessible by anyone except admins
  const possibleUuid = req.path.substring(8, 8 + 36);
  const parsedUuid = ZUuid.safeParse(possibleUuid);
  // Check if the user is trying to access a file that doesn't belong to him
  if (req.path.substring(0, 7) === '/static') {
    console.table({
      reqPath: req.path,
      possibleUuid,
      parsedUuid,
      userUuid: user.uuid,
    });
  }

  // will be true becuase it has the uuid in the path
  const isRequesingUserFile = req.path.substring(0, 7) === '/static' && parsedUuid.success;
  const isRequestingUserFileAndIsNotOwner = isRequesingUserFile && parsedUuid.data !== user.uuid;
  const isRequestingServerFile = req.path.substring(0, 7) === '/static' && !parsedUuid.success;
  if (isRequestingUserFileAndIsNotOwner || isRequestingServerFile) {
    return res
      .status(HTTPStatusCode.Forbidden)
      .json(
        ApiResponse.builder()
          .withStatus(HTTPStatusCode.Forbidden)
          .withMessage("You don't have access to this file")
          .build(),
      )
      .end();
  }

  req.user = user;

  next();
}
