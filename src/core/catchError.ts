import type {NextFunction, Request, Response} from 'express';

export type EndpointFunction = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

export const catchEndpointError = (fn: EndpointFunction) => {
  return (req: Request, res: Response, next: NextFunction) => {
    return Promise.resolve(fn(req, res, next)).catch((error: Error) => {
      res.status(500).json({
        status: res.statusCode,
        code: 'error/' + error.name,
        message: JSON.stringify({
          name: error.name,
          message: error.message,
        }),
      });
      // next();
    });
  };
};
