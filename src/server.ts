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
import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import {format} from 'date-fns';
import {query} from 'express-validator';
import {ApiResponse, HTTPStatusCode} from '@budgetbuddyde/types';
import {FileService, TFile} from './services';
import {checkAuthorizationHeader} from './middleware/checkAuthorization.middleware';

export const app = express();

app.use(cors(config.cors));
app.use(logMiddleware);
app.use(checkAuthorizationHeader);
app.use(bodyParser.json());

// const uploadDir = process.env.UPLOAD_DIR ? process.env.UPLOAD_DIR : path.join(__dirname, '../', 'uploads');
const fileService = new FileService(
  // FIXME: Write test to validate that the uploadDir is created and the correct path is used
  process.env.UPLOAD_DIR ? process.env.UPLOAD_DIR : path.join(__dirname, '../', 'uploads'),
);
fs.mkdir(fileService.uploadDirectory, {recursive: true}, (err, path) => {
  if (err) log('ERROR', ELogCategory.SETUP, err);
});

const upload = multer({
  fileFilter: (req, file, cb) => {
    cb(null, !fileService.wasFileAlreadyUploaded(file.originalname));
  },
  storage: multer.diskStorage({
    destination: fileService.uploadDirectory,
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
    const queryPath = req.query && req.query.path ? req.query.path : fileService.uploadDirectory;
    if (!fs.existsSync(queryPath)) {
      res
        .status(HTTPStatusCode.NotFound)
        .json(ApiResponse.builder().withStatus(HTTPStatusCode.NotFound).withMessage('Path not found').build())
        .end();
      return;
    }

    const files = fs.readdirSync(queryPath).map(fileName => {
      const filePath = path.join(queryPath, fileName);
      const fileStats = fs.statSync(filePath);
      return {
        name: fileName,
        created_at: fileStats.birthtime,
        last_edited_at: fileStats.mtime,
        size: fileStats.size,
        location: filePath,
        type: path.extname(fileName).toLowerCase(),
      };
    });

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
  const files = fs.readdirSync(fileService.uploadDirectory);
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
  const searchFileType = req.query && req.query.type ? req.query.type.toLowerCase() : undefined;
  const partialMatches = files.filter(fileName => fileName.toLocaleLowerCase().includes(searchQuery.toLowerCase()));
  if (partialMatches.length === 0) {
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

  const matchingFiles = fs
    .readdirSync(fileService.uploadDirectory)
    .map(fileName => {
      const filePath = path.join(fileService.uploadDirectory, fileName);
      const fileStats = fs.statSync(filePath);
      const fileType = path.extname(fileName).toLowerCase();
      if (searchFileType && fileType.substring(1) !== searchFileType) return null;
      return {
        name: fileName,
        created_at: fileStats.birthtime,
        last_edited_at: fileStats.mtime,
        size: fileStats.size,
        location: filePath,
        type: fileType,
      };
    })
    .filter(file => file != null);

  if (matchingFiles.length === 0) {
    res
      .status(404)
      .json(ApiResponse.builder().withStatus(404).withMessage(`No matches for '${searchQuery}'`).build())
      .end();
    return;
  }

  res
    .json(
      ApiResponse.builder()
        .withMessage(matchingFiles.length + ' matches')
        .withData(matchingFiles)
        .build(),
    )
    .end();
});

app.post('/upload', upload.array('files', 5), (req, res) => {
  const uploadedFiles = req.files as Express.Multer.File[];
  // FIXME: Add ability to foce upload files that already exist with a newer name or (forced) overwrite
  if (!uploadedFiles || uploadedFiles.length === 0) {
    res
      .status(400)
      .json(
        ApiResponse.builder()
          .withStatus(400)
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
        .withData(
          uploadedFiles.map(file => {
            const modifiedFile = file;
            // @ts-ignore
            delete modifiedFile.destination;
            return modifiedFile;
          }) as (Express.Multer.File & {destination?: string})[],
        )
        .build(),
    )
    .end();
});

app.get('/download', query('file').isString(), (req, res) => {
  const requestFiles = req.query!.file as string | string[];

  if (typeof requestFiles === 'string' && !Array.isArray(requestFiles)) {
    const exists = fileService.wasFileAlreadyUploaded(requestFiles);
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

    res.download(path.join(fileService.uploadDirectory, requestFiles), err => {
      if (err) {
        log('ERROR', ELogCategory.DOWNLOAD, err);
        res.status(500).json({err});
      }
    });
    return;
  }

  const archive = archiver('zip');
  const foundFiles = requestFiles.filter(fileName => fileService.wasFileAlreadyUploaded(fileName));
  if (foundFiles.length === 0) {
    res
      .status(404)
      .json(ApiResponse.builder().withStatus(404).withMessage("The requested files couldn't be found").build())
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
      .status(500)
      .json(
        ApiResponse.builder()
          .withStatus(500)
          .withMessage("Couldn't pack ZIP-archive because of: " + err.message)
          .build(),
      )
      .end();
  });
  archive.finalize();
});

app.delete('/delete', query('file').isString(), async (req, res) => {
  const requestFiles = req.query!.file as string | string[];

  if (typeof requestFiles === 'string' && !Array.isArray(requestFiles)) {
    if (!fileService.wasFileAlreadyUploaded(requestFiles)) {
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
    const fileLocation = path.join(fileService.uploadDirectory, requestFiles);
    const fileInfo = fs.statSync(fileLocation);
    fs.unlinkSync(fileLocation);
    res.json({
      status: 200,
      message: 'Die Datei wurde gelöscht',
      data: {
        name: requestFiles,
        createdAt: fileInfo.birthtime,
        lastEditedAt: fileInfo.mtime,
        size: fileInfo.size,
      },
    });
    return;
  }

  const foundFiles = requestFiles.filter(fileName => fileService.wasFileAlreadyUploaded(fileName)) as string[];
  if (foundFiles.length === 0) {
    res
      .status(404)
      .json(ApiResponse.builder().withStatus(404).withMessage('The requested files could not be found').build())
      .end();
    return;
  }
  const missingFiles = requestFiles.filter(fileName => !foundFiles.includes(fileName)) as string[];

  foundFiles.forEach(fileName => {
    const fileLocation = path.join(fileService.uploadDirectory, fileName);
    fs.unlinkSync(fileLocation);
  });

  res
    .json(
      ApiResponse.builder()
        .withMessage(`${foundFiles.length} files were permanently deleted`)
        .withData({success: foundFiles, failed: missingFiles})
        .build(),
    )
    .end();
});

export const listen = app.listen(config.port, process.env.HOSTNAME || 'localhost', () => {
  console.table({
    'Application Name': name,
    'Application Version': version,
    'Runtime Environment': config.environment,
    'Node Version': process.version,
    'Server Port': config.port,
    'Upload Directory': fileService.uploadDirectory,
  });
  log('LOG', ELogCategory.SETUP, `Server is listening on port ${config.port}`);
});
