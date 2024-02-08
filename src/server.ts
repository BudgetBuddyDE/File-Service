import 'dotenv/config';
import {config} from './config';
import {ELogCategory, log, logMiddleware} from './middleware';

/**
 * Check if all required environment-variables are set
 */
const MISSING_ENVIRONMENT_VARIABLES = config.environmentVariables.filter(variable => {
  if (!process.env[variable]) {
    return variable;
  }
});
if (MISSING_ENVIRONMENT_VARIABLES.length >= 1) {
  log(
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
import express, {Request} from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import {format} from 'date-fns';
import {query} from 'express-validator';
import {ApiResponse, HTTPStatusCode, type TCreateTransactionFilePayload, type TFile} from '@budgetbuddyde/types';
import {BackendService, FileService} from './services';
import {checkAuthorizationHeader} from './middleware/checkAuthorization.middleware';

// const uploadDir = process.env.UPLOAD_DIR ? process.env.UPLOAD_DIR : path.join(__dirname, '../', 'uploads');
const fileService = new FileService(
  process.env.UPLOAD_DIR ? process.env.UPLOAD_DIR : path.join(__dirname, '../', 'uploads'),
);
fs.mkdir(fileService.uploadDirectory, {recursive: true}, (err, path) => {
  if (err) log('ERROR', ELogCategory.SETUP, err);
});

export const app = express();

app.use(cors(config.cors));
app.use(logMiddleware);
app.use(bodyParser.json());
app.use(checkAuthorizationHeader);

app.use('/static', express.static(fileService.uploadDirectory));

// TODO: EXPOSE FILES USING A SYMBOLIC LINK USING A PUBLIC DIRECTORY
const upload = multer({
  fileFilter: (req, file, cb) => {
    // FIXME: Doesn't work
    cb(null, !fileService.wasFileAlreadyUploaded(file.originalname));
  },
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      if (!req.user) {
        cb(new Error('No authentificated user found'), '');
        return;
      }

      const userUploadDir = fileService.getUserFileDirectory(req.user);
      if (!fileService.doesUserFileDirectoryExist(req.user)) {
        fs.mkdirSync(userUploadDir, {recursive: true});
      }
      cb(null, path.join(fileService.getUserFileDirectory(req.user)));
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

const handleFileUpload = async (req: any, res: any) => {
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
};

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

app.post('/transaction/upload', upload.array('files', 5), async (req, res) => {
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
        fileUrl: FileService.getFileUrl(req.user!, fileInformation),
      };
    }),
    req.user!,
  );
  if (error) {
    console.log('fuck', error);
    return res
      .status(HTTPStatusCode.InternalServerError)
      .json(ApiResponse.builder().withStatus(HTTPStatusCode.InternalServerError).withMessage(error.message).build())
      .end();
  }

  return res.json(ApiResponse.builder().withData(transactionFiles).build());
});

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
          .status(404)
          .json(
            ApiResponse.builder()
              .withStatus(404)
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
          log('ERROR', ELogCategory.DOWNLOAD, err);
          res.status(HTTPStatusCode.InternalServerError).json({err});
        }
      });
      return;
    }

    log('ERROR', ELogCategory.DOWNLOAD, 'should not be shown');

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
    archive.on('finish', () => log('INFO', ELogCategory.DOWNLOAD, 'ZIP-archive created and sent'));
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
          .status(404)
          .json(
            ApiResponse.builder()
              .withStatus(404)
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
    Host: FileService.getHostUrl(),
  });
  log('LOG', ELogCategory.SETUP, `Server is listening on port ${config.port}`);
});
