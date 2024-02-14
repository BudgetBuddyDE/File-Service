import type {NextFunction, Request, Response} from 'express';
import {AuthService} from '../services';
import {ApiResponse, HTTPStatusCode, type TUser} from '@budgetbuddyde/types';
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
  const requestPath = req.path;
  const query = new URLSearchParams(req.query as Record<string, string>),
    queryBearer = query.get('bearer');

  if (requestPath === '/status' || requestPath === '/') {
    return next();
  }

  if (!authHeader && !queryBearer) {
    return res
      .status(HTTPStatusCode.Unauthorized)
      .json(
        ApiResponse.builder().withStatus(HTTPStatusCode.Unauthorized).withMessage('No Bearer token provided').build(),
      )
      .end();
  }

  let authUser: TUser | null = null;
  if (authHeader) {
    const [user, err] = await AuthService.validateAuthHeader(authHeader as string);
    if (err || !user) {
      log('WARN', ELogCategory.AUTHENTIFICATION, err instanceof Error ? err.message : err!);
      return res
        .status(HTTPStatusCode.Unauthorized)
        .json(
          ApiResponse.builder()
            .withStatus(HTTPStatusCode.Unauthorized)
            .withMessage('Invalid Bearer token provided by header')
            .build(),
        )
        .end();
    }
    authUser = user;
  }

  if (!authHeader && queryBearer) {
    const [user, err] = await AuthService.validateAuthHeader(`Bearer ${queryBearer}`);
    if (err || !user) {
      log('WARN', ELogCategory.AUTHENTIFICATION, err instanceof Error ? err.message : err!);
      return res
        .status(HTTPStatusCode.Unauthorized)
        .json(
          ApiResponse.builder()
            .withStatus(HTTPStatusCode.Unauthorized)
            .withMessage('Invalid Bearer token provided by query')
            .build(),
        )
        .end();
    }
    authUser = user;
  }

  if (!authUser) {
    log('WARN', ELogCategory.AUTHENTIFICATION, 'No user found');
    return res
      .status(HTTPStatusCode.BadRequest)
      .json(ApiResponse.builder().withStatus(HTTPStatusCode.BadRequest).withMessage('No user found').build())
      .end();
  }

  // README!!!
  // All files are stored in the format /static/<user.uuid>/<filename>
  // Files that aren't stored under /static/<user.uuid> are not accessible by anyone except admins
  const possibleUuid = req.path.substring(8, 8 + 36);
  const parsedUuid = ZUuid.safeParse(possibleUuid);

  // will be true becuase it has the uuid in the path
  const isRequesingUserFile = req.path.substring(0, 7) === '/static' && parsedUuid.success;
  const isRequestingUserFileAndIsNotOwner = isRequesingUserFile && parsedUuid.data !== authUser.uuid;
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

  req.user = authUser;

  next();
}
