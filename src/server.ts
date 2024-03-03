import 'dotenv/config';
import {config} from './config';
import {ELogCategory, logMiddleware} from './middleware';

/**
 * Check if all required environment-variables are set
 */
const MISSING_ENVIRONMENT_VARIABLES = config.environmentVariables.filter(variable => {
  if (!process.env[variable]) {
    return variable;
  }
});
if (MISSING_ENVIRONMENT_VARIABLES.length >= 1) {
  console.log(
    'ERROR',
    ELogCategory.SETUP,
    JSON.stringify({
      missing: MISSING_ENVIRONMENT_VARIABLES,
      error: 'server/missing-environment-variables',
    }),
  );
  process.exit(1);
}

import {name, version} from '../package.json';
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import {format} from 'date-fns';
import {query} from 'express-validator';
import {ApiResponse, HTTPStatusCode, type TTransactionFile, type TFile} from '@budgetbuddyde/types';
import {BackendService, FileService} from './services';
import {logger, checkAuthorizationHeader} from './middleware';

const fileService = new FileService(
  process.env.UPLOAD_DIR ? process.env.UPLOAD_DIR : path.join(__dirname, '../', 'uploads'),
);
fs.mkdir(fileService.uploadDirectory, {recursive: true}, (err, path) => {
  if (err) {
    logger.error(err.message, {
      category: ELogCategory.SETUP,
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
  }
});

export const app = express();

app.use(cors(config.cors));
app.use(logMiddleware);
app.use(bodyParser.json());
app.use(checkAuthorizationHeader);

app.use('/static', express.static(fileService.uploadDirectory));

const isTransactionRelated = (req: express.Request): boolean => {
  return req.path.startsWith('/transaction');
};

const getTransactionId = (req: express.Request): number | undefined => {
  if (isTransactionRelated(req)) {
    return Number(req.query.transactionId);
  }
  return undefined;
};

const upload = multer({
  fileFilter: (req, file, cb) => {
    if (!req.user) {
      cb(null, false);
      return;
    }

    let filePath;
    const transactionId = getTransactionId(req);
    if (isTransactionRelated(req) && transactionId) {
      filePath = path.join(fileService.getUserFileDirectory(req.user), transactionId.toString(), file.originalname);
    } else filePath = path.join(fileService.getUserFileDirectory(req.user), file.originalname);

    // in order to use the value correctly, we need to say "the file was not already uploaded" and provide "true" in order to continue
    cb(null, !fileService.wasFileAlreadyUploaded(filePath));
  },
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!req.user) {
        cb(new Error('No authentificated user found'), '');
        return;
      }

      // when the user hasn't uploaded any files yet, we need to create his personal file directory
      let fileDestinationPath = fileService.getUserFileDirectory(req.user);
      if (!fileService.doesUserFileDirectoryExist(req.user)) {
        fs.mkdirSync(fileDestinationPath, {recursive: true});
      }

      const transactionId = getTransactionId(req);
      if (isTransactionRelated(req) && transactionId) {
        fileDestinationPath = path.join(fileDestinationPath, transactionId.toString());
        if (!fs.existsSync(fileDestinationPath)) {
          fs.mkdirSync(fileDestinationPath, {recursive: true});
          logger.log("Transaction directory created at '{fileDestinationPath}'", {
            category: ELogCategory.UPLOAD,
            fileDestinationPath: fileDestinationPath,
          });
        }
      }

      logger.debug("The file will be saved at '{fileDestinationPath}'", {
        category: ELogCategory.DEBUG,
        fileDestinationPath: fileDestinationPath,
      });
      cb(null, fileDestinationPath);
    },
    filename: (req, file, cb) => {
      cb(null, file.originalname);
    },
  }),
});

app.get('/', (req, res) => res.redirect('https://budget-buddy.de'));

app.get('/status', (req, res) => {
  res.json({status: 'OK'});
});

app.get('/list', query('path').isString().optional(true), (req, res) => {
  try {
    if (!req.user) {
      res
        .status(HTTPStatusCode.Unauthorized)
        .json(
          ApiResponse.builder()
            .withStatus(HTTPStatusCode.Unauthorized)
            .withMessage('No authentificated user found')
            .build(),
        )
        .end();
      return;
    }

    const queryPath = fileService.getPathByUser(req.user, req.query!.path as string | undefined);

    if (!fs.existsSync(queryPath)) {
      res
        .status(HTTPStatusCode.NotFound)
        .json(
          ApiResponse.builder()
            .withStatus(HTTPStatusCode.NotFound)
            .withMessage(`Path '${queryPath}' not found`)
            .build(),
        )
        .end();
      return;
    }

    const files: TFile[] = FileService.getFilesFromDirectory(queryPath, true);

    res
      .json(
        ApiResponse.builder()
          .withMessage(files.length + ' files found')
          .withData(files)
          .build(),
      )
      .end();
  } catch (error) {
    res
      .status(HTTPStatusCode.InternalServerError)
      .json(
        ApiResponse.builder()
          .withStatus(HTTPStatusCode.InternalServerError)
          .withMessage(error instanceof Error ? error.message : "Something wen't wrong"),
      )
      .end();
  }
});

app.get('/search', query('q').isString(), query('type').isString().optional(true), (req, res) => {
  if (!req.user) {
    res
      .status(HTTPStatusCode.Unauthorized)
      .json(
        ApiResponse.builder()
          .withStatus(HTTPStatusCode.Unauthorized)
          .withMessage('No authentificated user found')
          .build(),
      )
      .end();
    return;
  }

  const queryPath = fileService.getPathByUser(req.user);
  const files: TFile[] = FileService.getFilesFromDirectory(queryPath, true);
  if (files.length === 0) {
    res
      .status(HTTPStatusCode.NotFound)
      .json(
        ApiResponse.builder().withStatus(HTTPStatusCode.NotFound).withMessage('There are no files available').build(),
      )
      .end();
    return;
  }

  const searchQuery = req.query!.q;
  let searchFileType = req.query && req.query.type ? req.query.type.toLowerCase() : undefined;
  if (searchFileType && !searchFileType.startsWith('.')) searchFileType = '.' + searchFileType;

  let matchingFiles = files.filter(({name}) => name.toLocaleLowerCase().includes(searchQuery.toLowerCase()));
  if (matchingFiles.length === 0) {
    res
      .status(HTTPStatusCode.NotFound)
      .json(
        ApiResponse.builder()
          .withStatus(HTTPStatusCode.NotFound)
          .withMessage(`No matches for '${searchQuery}'`)
          .build(),
      )
      .end();
    return;
  }

  if (searchFileType) {
    matchingFiles = matchingFiles.filter(({type}) => type === searchFileType);
  }
  if (matchingFiles.length === 0) {
    res
      .status(HTTPStatusCode.NotFound)
      .json(
        ApiResponse.builder()
          .withStatus(HTTPStatusCode.NotFound)
          .withMessage(`No matches for '${searchQuery}' and type '${searchFileType}'`)
          .build(),
      )
      .end();
    return;
  }

  res
    .json(
      ApiResponse.builder()
        .withMessage(matchingFiles.length + ' files found')
        .withData(matchingFiles)
        .build(),
    )
    .end();
});

app.post('/upload', upload.array('files', 5), (req, res) => {
  if (!req.user) {
    res
      .status(HTTPStatusCode.Unauthorized)
      .json(
        ApiResponse.builder()
          .withStatus(HTTPStatusCode.Unauthorized)
          .withMessage('No authentificated user found')
          .build(),
      )
      .end();
    return;
  }

  const uploadedFiles = req.files as Express.Multer.File[];
  if (!uploadedFiles || uploadedFiles.length === 0) {
    res
      .status(HTTPStatusCode.BadGateway)
      .json(
        ApiResponse.builder()
          .withStatus(HTTPStatusCode.BadGateway)
          .withMessage("No files were uploaded! All of these files we're already uploaded!")
          .build(),
      )
      .end();
    return;
  }

  res
    .json(
      ApiResponse.builder()
        .withMessage(`${uploadedFiles.length} files were uploaded`)
        .withData(uploadedFiles.map(({path}) => FileService.getFileInformation(path)) as TFile[])
        .build(),
    )
    .end();
});

app.post('/transaction/upload', query('transactionId').isNumeric(), upload.array('files', 5), async (req, res) => {
  const transactionId = req.query.transactionId;
  if (!transactionId) {
    return res.status(HTTPStatusCode.BadRequest).json({message: 'No transactionId provided'}).end();
  }

  if (!req.user) {
    res
      .status(HTTPStatusCode.Unauthorized)
      .json(
        ApiResponse.builder()
          .withStatus(HTTPStatusCode.Unauthorized)
          .withMessage('No authentificated user found')
          .build(),
      )
      .end();
    return;
  }

  let uploadedFiles = req.files as Express.Multer.File[];
  if (!uploadedFiles || uploadedFiles.length === 0) {
    res
      .status(HTTPStatusCode.BadGateway)
      .json(
        ApiResponse.builder()
          .withStatus(HTTPStatusCode.BadGateway)
          .withMessage("No files were uploaded! All of these files we're already uploaded!")
          .build(),
      )
      .end();
    return;
  }
  const [transactionFiles, error] = await BackendService.attachFilesToTransaction(
    uploadedFiles.map(file => {
      const fileInformation = FileService.getFileInformation(file.path) as TFile;
      return {
        transactionId: Number(transactionId),
        fileName: fileInformation.name,
        fileSize: fileInformation.size,
        mimeType: fileInformation.type,
        fileUrl: fileService.getFileUrl(fileInformation),
      };
    }),
    req.user!,
  );
  if (error) {
    return res
      .status(HTTPStatusCode.InternalServerError)
      .json(ApiResponse.builder().withStatus(HTTPStatusCode.InternalServerError).withMessage(error.message).build())
      .end();
  }

  return res.json(ApiResponse.builder().withData(transactionFiles).build());
});

app.delete(
  '/transaction/delete',
  query('transactionId').isNumeric(),
  query('files').isArray().isUUID(4),
  async (req, res) => {
    if (!req.user) {
      res
        .status(HTTPStatusCode.Unauthorized)
        .json(
          ApiResponse.builder()
            .withStatus(HTTPStatusCode.Unauthorized)
            .withMessage('No authentificated user found')
            .build(),
        )
        .end();
      return;
    }

    const transactionId = Number(req.query!.transactionId);
    let files = req.query!.files;
    if (!Array.isArray(files)) files = [files];

    try {
      const [transaction, transactionError] = await BackendService.getTransactionById(transactionId, req.user);
      if (transactionError) throw transactionError;
      if (!transaction) throw new Error("The transaction couldn't be found");

      const transactionFiles = transaction.attachedFiles;
      const filesToDelete = transactionFiles.filter(file => files.includes(file.uuid));

      const transactionFilesDirectory = path.join(fileService.getUserFileDirectory(req.user), transactionId.toString());

      if (filesToDelete.length === transactionFiles.length) {
        fs.rmSync(transactionFilesDirectory, {recursive: true});
      } else {
        filesToDelete.forEach(file => {
          fs.rmSync(path.join(transactionFilesDirectory, file.fileName));
        });
      }

      const [detachResult, detachError] = await BackendService.detachFileFromTransaction(
        files.map((id: TTransactionFile['uuid']) => ({uuid: id})),
        req.user,
      );
      if (detachError) throw detachError;
      if (!detachResult) throw new Error('Something went wrong while detaching the files from the transaction');

      res
        .json(
          ApiResponse.builder()
            .withMessage("The files we're successfully deleted!")
            .withData({
              path: FileService.pathToString(transactionFilesDirectory),
              files: filesToDelete,
            })
            .build(),
        )
        .end();
    } catch (error) {
      return res
        .status(HTTPStatusCode.InternalServerError)
        .json(
          ApiResponse.builder()
            .withStatus(HTTPStatusCode.InternalServerError)
            .withMessage((error as Error).message)
            .build(),
        )
        .end();
    }
  },
);

app.get(
  '/download',
  query('file').isString(),
  query('useUserDir').isBoolean().optional().default(false),
  (req, res) => {
    if (!req.user) {
      res
        .status(HTTPStatusCode.Unauthorized)
        .json(
          ApiResponse.builder()
            .withStatus(HTTPStatusCode.Unauthorized)
            .withMessage('No authentificated user found')
            .build(),
        )
        .end();
      return;
    }

    const useUserDir = req.query!.useUserDir && Boolean(req.query!.useUserDir);
    const requestFiles = req.query!.file as string | string[];
    if (typeof requestFiles === 'string' && !Array.isArray(requestFiles)) {
      const downloadPath = useUserDir
        ? path.join(fileService.getUserFileDirectory(req.user), requestFiles)
        : requestFiles;
      const exists = fileService.doesFileExist(downloadPath);
      if (!exists) {
        res
          .status(HTTPStatusCode.NotFound)
          .json(
            ApiResponse.builder()
              .withStatus(HTTPStatusCode.NotFound)
              .withMessage(requestFiles + " wasn't found")
              .build(),
          )
          .end();
        return;
      }

      if (!fileService.doesUserHasAccessToFile(req.user, downloadPath, false)) {
        res
          .status(HTTPStatusCode.Forbidden)
          .json(
            ApiResponse.builder()
              .withStatus(HTTPStatusCode.Forbidden)
              .withMessage('You are not allowed to access this file')
              .build(),
          )
          .end();
        return;
      }
      res.download(downloadPath, err => {
        if (err) {
          logger.error(err.message, {
            category: ELogCategory.DOWNLOAD,
            name: err.name,
            message: err.message,
            stack: err.stack,
          });
          res.status(HTTPStatusCode.InternalServerError).json({err});
        }
      });
      return;
    }

    logger.error('Should not be shown', {category: ELogCategory.DOWNLOAD});

    const archive = archiver('zip');
    const foundFiles = requestFiles.filter(fileName => fileService.doesFileExist(fileName));
    if (foundFiles.length === 0) {
      res
        .status(HTTPStatusCode.NotFound)
        .json(
          ApiResponse.builder()
            .withStatus(HTTPStatusCode.NotFound)
            .withMessage("The requested files couldn't be found")
            .build(),
        )
        .end();
      return;
    }

    foundFiles.forEach(fileName => archive.file(path.join(fileService.uploadDirectory, fileName), {name: fileName}));

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename=${format(new Date(), 'dd_MM_yy_HHmmss')}.zip`);

    archive.pipe(res);
    archive.on('finish', () => logger.info('ZIP-archive created and sent', {category: ELogCategory.DOWNLOAD}));
    archive.on('error', err => {
      res
        .status(HTTPStatusCode.InternalServerError)
        .json(
          ApiResponse.builder()
            .withStatus(HTTPStatusCode.InternalServerError)
            .withMessage("Couldn't pack ZIP-archive because of: " + err.message)
            .build(),
        )
        .end();
    });
    archive.finalize();
  },
);

app.delete(
  '/delete',
  query('file').isString(),
  query('useUserDir').isBoolean().optional().default(false),
  async (req, res) => {
    if (!req.user) {
      res
        .status(HTTPStatusCode.Unauthorized)
        .json(
          ApiResponse.builder()
            .withStatus(HTTPStatusCode.Unauthorized)
            .withMessage('No authentificated user found')
            .build(),
        )
        .end();
      return;
    }

    const useUserDir = req.query!.useUserDir && Boolean(req.query!.useUserDir);
    const requestFiles = req.query!.file as string | string[];
    if (typeof requestFiles === 'string' && !Array.isArray(requestFiles)) {
      const deletePath = useUserDir
        ? path.join(fileService.getUserFileDirectory(req.user), requestFiles)
        : requestFiles;

      const exists = fileService.doesFileExist(deletePath);
      if (!exists) {
        res
          .status(HTTPStatusCode.NotFound)
          .json(
            ApiResponse.builder()
              .withStatus(HTTPStatusCode.NotFound)
              .withMessage(requestFiles + " wasn't found")
              .build(),
          )
          .end();
        return;
      }

      const doesUserHasAccessToFile = fileService.doesUserHasAccessToFile(req.user, deletePath, false);
      if (!doesUserHasAccessToFile) {
        res
          .status(HTTPStatusCode.Forbidden)
          .json(
            ApiResponse.builder()
              .withStatus(HTTPStatusCode.Forbidden)
              .withMessage('You are not allowed to access this file')
              .build(),
          )
          .end();
        return;
      }

      const fileInfo = FileService.getFileInformation(deletePath);
      fs.unlinkSync(deletePath);
      res
        .status(HTTPStatusCode.Ok)
        .json(ApiResponse.builder().withMessage('The file was permanently deleted').withData(fileInfo).build())
        .end();
      return;
    }

    const foundFiles: TFile[] = requestFiles
      .map(fileName => (useUserDir ? path.join(fileService.getUserFileDirectory(req.user!), fileName) : fileName))
      .filter(filePath => fileService.doesFileExist(filePath))
      .map(filePath => FileService.getFileInformation(filePath) as TFile);
    if (foundFiles.length === 0) {
      res
        .status(HTTPStatusCode.NotFound)
        .json(
          ApiResponse.builder()
            .withStatus(HTTPStatusCode.NotFound)
            .withMessage('The requested files could not be found')
            .build(),
        )
        .end();
      return;
    }
    const missingFiles = requestFiles.filter(fileName => !foundFiles.includes(fileName)) as string[];
    foundFiles.forEach(({location}) => {
      fs.unlinkSync(location);
    });

    res
      .json(
        ApiResponse.builder()
          .withMessage(`${foundFiles.length} files were permanently deleted`)
          .withData({success: foundFiles, failed: missingFiles})
          .build(),
      )
      .end();
  },
);

export const listen = app.listen(config.port, process.env.HOSTNAME || 'localhost', () => {
  console.table({
    'Application Name': name,
    'Application Version': version,
    'Runtime Environment': config.environment,
    'Node Version': process.version,
    'Server Port': config.port,
    'Upload Directory': fileService.uploadDirectory,
    Host: fileService.getHostUrl(),
  });
  logger.info("Server is listening on port '{port}'", {
    category: ELogCategory.SETUP,
    port: config.port,
    application: name,
    version: version,
    runtime_environment: config.environment,
    node_version: process.version,
    server_port: config.port,
    upload_directory: fileService.uploadDirectory,
    host: fileService.getHostUrl(),
  });
});
