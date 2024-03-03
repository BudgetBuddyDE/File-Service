import type {NextFunction, Request, Response} from 'express';
import winston from 'winston';
import {SeqTransport} from '@datalust/winston-seq';
import {config} from '../config';

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(winston.format.errors({stack: true}), winston.format.json()),
  defaultMeta: {
    environment: config.environment.toString(),
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
    ...(config.environment === 'production' && config.log.apiUrl.length > 0 && config.log.apiKey.length > 0
      ? [
          new SeqTransport({
            serverUrl: config.log.apiUrl,
            apiKey: config.log.apiKey,
            onError: e => console.error(e),
            handleExceptions: true,
            handleRejections: true,
          }),
        ]
      : []),
  ],
});
export type TLogType = 'LOG' | 'INFO' | 'WARN' | 'ERROR';

export enum ELogCategory {
  DEBUG = 'debug',
  SETUP = 'setup',
  AUTHENTIFICATION = 'authentification',
  FILES = 'files',
  DOWNLOAD = 'download',
  UPLOAD = 'file_upload',
  REQUEST = 'request',
}

export function logMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.path.includes('favicon') || req.path === '/status') return next();
  res.on('finish', async () => {
    const statusCode = res.statusCode;
    const message = {
      method: req.method,
      ip: req.ip,
      location: req.originalUrl,
      body: req.body,
      query: req.query,
      headers: req.headers,
    };

    logger.log("Process request with status code '{statusCode}'", {
      statusCode,
      category: ELogCategory.REQUEST,
      ...message,
    });
  });
  next();
}
