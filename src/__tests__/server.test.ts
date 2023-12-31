import {ApiResponse, HTTPStatusCode, type TRole, type TUser} from '@budgetbuddyde/types';
import {app, listen} from '../server';
import {faker} from '@faker-js/faker';
import supertest from 'supertest';
import {AuthService, FileService, TFile} from '../services';
import path from 'path';
import fs from 'fs';
import {ELogCategory, log} from '../middleware';

afterAll(done => {
  listen.close(error => {
    if (error) throw error;
    done();
  });
});

const MOCK_ROLE: Record<string, Pick<TRole, 'name'>> = {
  user: {name: 'User'},
  admin: {name: 'Admin'},
};

const MOCK_USER = {
  user: {uuid: 'demo-user-uuid', role: MOCK_ROLE.user, password: faker.internet.password()},
  empty_user: {uuid: 'empty-demo-user-uuid', role: MOCK_ROLE.user, password: faker.internet.password()},
  admin_user: {uuid: 'demo-admin-uuid', role: MOCK_ROLE.admin, password: faker.internet.password()},
};

describe('uses correct server setup', () => {
  it('should use the correct port', () => {
    expect(process.env.PORT).toBe('9080');
  });

  it('should use the correct upload directory', () => {
    const upDir = process.env.UPLOAD_DIR;
    expect(upDir).toBe('testfiles');

    const fileService = new FileService(upDir as string);
    expect(fileService.uploadDirectory).toBe('testfiles');
  });

  it("should throw an error when the upload directory doesn't exist", () => {
    expect(() => new FileService('non-existing-directory')).toThrow("Upload directory doesn't exist");
  });
});

describe('/list behaves as expected', () => {
  it('should return UNAUTHORIZED when missing the Authorization-Header', async () => {
    // Act
    const response = await supertest(app).get('/list');

    // Assert
    expect(response.statusCode).toBe(HTTPStatusCode.Unauthorized);
    expect(response.body).toEqual(
      ApiResponse.builder().withStatus(HTTPStatusCode.Unauthorized).withMessage('No Bearer token provided').build(),
    );
  });

  /**
   * Called with demo-user-uuid
   */
  it('if called with header, but without path returns files from the user-dir', async () => {
    // Arrange
    const mockedFiles = [
      {
        name: 'nested-file.txt',
        created_at: '2023-12-29T22:55:36.236Z',
        last_edited_at: '2023-12-29T22:55:52.615Z',
        size: 36,
        location: 'testfiles\\demo-user-uuid\\nested\\nested-file.txt',
        type: '.txt',
      },
      {
        name: 'userfile.txt',
        created_at: '2023-12-29T21:14:10.110Z',
        last_edited_at: '2023-12-29T21:14:13.041Z',
        size: 24,
        location: 'testfiles\\demo-user-uuid\\userfile.txt',
        type: '.txt',
      },
    ] as TFile[];
    const mockedResponseBody = ApiResponse.builder()
      .withStatus(HTTPStatusCode.Ok)
      .withMessage(mockedFiles.length + ' files found')
      .withData(mockedFiles)
      .build();
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);

    // Act
    const response = await supertest(app).get('/list').set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Ok);
    expect(response.body).toEqual(mockedResponseBody);
    expect(response.body.data.length).toBe(mockedFiles.length);
    validateAuthHeaderSpy.mockRestore();
  });

  /**
   * Called with demo-user-uuid
   */
  it('if called with header and path, returns files under, uploadDir/user.uuid/<path>', async () => {
    // Arrange
    const mockedFiles = [
      {
        name: 'nested-file.txt',
        created_at: '2023-12-29T22:55:36.236Z',
        last_edited_at: '2023-12-29T22:55:52.615Z',
        size: 36,
        location: 'testfiles\\demo-user-uuid\\nested\\nested-file.txt',
        type: '.txt',
      },
    ] as TFile[];
    const mockedResponseBody = ApiResponse.builder()
      .withStatus(HTTPStatusCode.Ok)
      .withMessage(mockedFiles.length + ' files found')
      .withData(mockedFiles)
      .build();
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);

    // Act
    const response = await supertest(app).get('/list').query({path: 'nested/'}).set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Ok);
    expect(response.body).toEqual(mockedResponseBody);
    expect(response.body.data.length).toBe(mockedFiles.length);
    validateAuthHeaderSpy.mockRestore();
  });

  /**
   * Called with demo-admin-uuid
   */
  it('if called with header (admin-account) without path returns files from uploadDir/user.uuid', async () => {
    // Arrange
    const mockedFiles = [
      {
        name: 'adminfile.txt',
        created_at: '2023-12-29T21:14:00.426Z',
        last_edited_at: '2023-12-29T21:14:05.151Z',
        size: 25,
        location: 'testfiles\\demo-admin-uuid\\adminfile.txt',
        type: '.txt',
      },
    ] as TFile[];
    const mockedResponseBody = ApiResponse.builder()
      .withStatus(HTTPStatusCode.Ok)
      .withMessage(mockedFiles.length + ' files found')
      .withData(mockedFiles)
      .build();
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.admin_user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.admin_user);

    // Act
    const response = await supertest(app).get('/list').set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Ok);
    expect(response.body).toEqual(mockedResponseBody);
    expect(response.body.data.length).toBe(mockedFiles.length);
    validateAuthHeaderSpy.mockRestore();
  });

  /**
   * Called with demo-admin-uuid
   */
  it('if called with header (admin-account) and path, returns files under uploadDir/path', async () => {
    // Arrange
    // Represents the files of the default mocked user
    const mockedFiles = [
      {
        name: 'nested-file.txt',
        created_at: '2023-12-29T22:55:36.236Z',
        last_edited_at: '2023-12-29T22:55:52.615Z',
        size: 36,
        location: 'testfiles\\demo-user-uuid\\nested\\nested-file.txt',
        type: '.txt',
      },
      {
        name: 'userfile.txt',
        created_at: '2023-12-29T21:14:10.110Z',
        last_edited_at: '2023-12-29T21:14:13.041Z',
        size: 24,
        location: 'testfiles\\demo-user-uuid\\userfile.txt',
        type: '.txt',
      },
    ] as TFile[];
    const mockedResponseBody = ApiResponse.builder()
      .withStatus(HTTPStatusCode.Ok)
      .withMessage(mockedFiles.length + ' files found')
      .withData(mockedFiles)
      .build();
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.admin_user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.admin_user);

    // Act
    /**
     * `demo-user-uuid/` would represent the UUID v4 of an actual user
     */
    const response = await supertest(app)
      .get('/list')
      .query({path: 'demo-user-uuid/'})
      .set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Ok);
    expect(response.body).toEqual(mockedResponseBody);
    expect(response.body.data.length).toBe(mockedFiles.length);
    validateAuthHeaderSpy.mockRestore();
  });
});

describe('/search should behave as expected', () => {
  it('should return UNAUTHORIZED when missing the Authorization-Header', async () => {
    // Act
    const response = await supertest(app).get('/search').query({q: 'some-content'});

    // Assert
    expect(response.statusCode).toBe(HTTPStatusCode.Unauthorized);
    expect(response.body).toEqual(
      ApiResponse.builder().withStatus(HTTPStatusCode.Unauthorized).withMessage('No Bearer token provided').build(),
    );
  });

  it('should return 404, when user has no uploaded files', async () => {
    // Arrange
    const mockedResponseBody = ApiResponse.builder()
      .withStatus(HTTPStatusCode.NotFound)
      .withMessage('There are no files available')
      .build();
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.empty_user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.empty_user);

    // Act
    const response = await supertest(app).get('/search').query({q: 'some-query'}).set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.NotFound);
    expect(response.body).toEqual(mockedResponseBody);
    validateAuthHeaderSpy.mockRestore();
  });

  it('should return return 404, when no file-names are matching', async () => {
    // Arrange
    const searchQuery = 'some-query';
    const mockedResponseBody = ApiResponse.builder()
      .withStatus(HTTPStatusCode.NotFound)
      .withMessage(`No matches for '${searchQuery}'`)
      .build();
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);

    // Act
    const response = await supertest(app).get('/search').query({q: searchQuery}).set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.NotFound);
    expect(response.body).toEqual(mockedResponseBody);
    validateAuthHeaderSpy.mockRestore();
  });

  it('should return all files, that have a matching name', async () => {
    // Arrange
    const mockedFiles = [
      {
        name: 'userfile.txt',
        created_at: '2023-12-29T21:14:10.110Z',
        last_edited_at: '2023-12-29T21:14:13.041Z',
        size: 24,
        location: 'testfiles\\demo-user-uuid\\userfile.txt',
        type: '.txt',
      },
    ] as TFile[];
    const mockedResponseBody = ApiResponse.builder()
      .withStatus(HTTPStatusCode.Ok)
      .withMessage(mockedFiles.length + ' files found')
      .withData(mockedFiles)
      .build();
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);

    // Act
    const response = await supertest(app).get('/search').query({q: 'erfi'}).set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Ok);
    expect(response.body).toEqual(mockedResponseBody);
    expect(response.body.data.length).toBe(mockedFiles.length);
    validateAuthHeaderSpy.mockRestore();
  });

  it('should return all files that have a matching names', async () => {
    // Arrange
    const mockedFiles = [
      {
        name: 'nested-file.txt',
        created_at: '2023-12-29T22:55:36.236Z',
        last_edited_at: '2023-12-29T22:55:52.615Z',
        size: 36,
        location: 'testfiles\\demo-user-uuid\\nested\\nested-file.txt',
        type: '.txt',
      },
      {
        name: 'userfile.txt',
        created_at: '2023-12-29T21:14:10.110Z',
        last_edited_at: '2023-12-29T21:14:13.041Z',
        size: 24,
        location: 'testfiles\\demo-user-uuid\\userfile.txt',
        type: '.txt',
      },
    ] as TFile[];
    const mockedResponseBody = ApiResponse.builder()
      .withStatus(HTTPStatusCode.Ok)
      .withMessage(mockedFiles.length + ' files found')
      .withData(mockedFiles)
      .build();
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);

    // Act
    const response = await supertest(app).get('/search').query({q: 'file'}).set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Ok);
    expect(response.body).toEqual(mockedResponseBody);
    expect(response.body.data.length).toBe(mockedFiles.length);
    validateAuthHeaderSpy.mockRestore();
  });

  it('should return all files, that have a matching name and type', async () => {
    // Arrange
    const mockedFiles = [
      {
        name: 'userfile.txt',
        created_at: '2023-12-29T21:14:10.110Z',
        last_edited_at: '2023-12-29T21:14:13.041Z',
        size: 24,
        location: 'testfiles\\demo-user-uuid\\userfile.txt',
        type: '.txt',
      },
    ] as TFile[];
    const mockedResponseBody = ApiResponse.builder()
      .withStatus(HTTPStatusCode.Ok)
      .withMessage(mockedFiles.length + ' files found')
      .withData(mockedFiles)
      .build();
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);

    // Act
    const response = await supertest(app)
      .get('/search')
      .query({q: 'erfi', type: 'txt'})
      .set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Ok);
    expect(response.body).toEqual(mockedResponseBody);
    expect(response.body.data.length).toBe(mockedFiles.length);
    validateAuthHeaderSpy.mockRestore();
  });

  it('should return 404 when matches for q but not for type', async () => {
    // Arrange
    const searchQuery = 'erfi';
    const searchFileType = 'mp3';
    const mockedResponseBody = ApiResponse.builder()
      .withStatus(HTTPStatusCode.NotFound)
      .withMessage(`No matches for '${searchQuery}' and type '.${searchFileType}'`)
      .build();
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);

    // Act
    const response = await supertest(app)
      .get('/search')
      .query({q: searchQuery, type: searchFileType})
      .set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.NotFound);
    expect(response.body).toEqual(mockedResponseBody);
    expect(response.body.data).toBeNull();
    validateAuthHeaderSpy.mockRestore();
  });
});

describe('/upload should behave as expected', () => {
  it('should return UNAUTHORIZED when missing the Authorization-Header', async () => {
    // Act
    const response = await supertest(app).post('/upload');

    // Assert
    expect(response.statusCode).toBe(HTTPStatusCode.Unauthorized);
    expect(response.body).toEqual(
      ApiResponse.builder().withStatus(HTTPStatusCode.Unauthorized).withMessage('No Bearer token provided').build(),
    );
  });

  it("should create the user's directory if it does not exist", async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.empty_user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.empty_user);
    const uploadDir = path.join(process.env.UPLOAD_DIR as string, MOCK_USER.empty_user.uuid);
    // Remove user upload-dir when it exists
    if (fs.existsSync(uploadDir)) fs.rmSync(uploadDir, {recursive: true});

    // Act
    const response = await supertest(app)
      .post('/upload')
      .set('Content-Type', 'multipart/form-data;')
      .set('Authorization', userBearerToken)
      .attach('files', path.resolve(__dirname, 'demo.txt'));

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Ok);
    validateAuthHeaderSpy.mockRestore();

    // Remove upload-dir afterwards
    if (fs.existsSync(uploadDir)) fs.rmSync(uploadDir, {recursive: true});
  });

  it("should should return 502, when no files we're uploaded", async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.empty_user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.empty_user);

    // Act
    const response = await supertest(app).post('/upload').set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.BadGateway);
    validateAuthHeaderSpy.mockRestore();
  });

  it("should upload the files to the user's directory", async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.empty_user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.empty_user);
    const uploadDir = path.join(process.env.UPLOAD_DIR as string, MOCK_USER.empty_user.uuid);
    // Remove user upload-dir when it exists
    if (fs.existsSync(uploadDir)) fs.rmSync(uploadDir, {recursive: true});

    // Act
    const response = await supertest(app)
      .post('/upload')
      .set('Content-Type', 'multipart/form-data;')
      .set('Authorization', userBearerToken)
      .attach('files', path.resolve(__dirname, 'demo.txt'));

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Ok);
    validateAuthHeaderSpy.mockRestore();

    // Remove upload-dir afterwards
    if (fs.existsSync(uploadDir)) fs.rmSync(uploadDir, {recursive: true});
  });
});

describe('/download should behave as expected', () => {
  it('should return UNAUTHORIZED when missing the Authorization-Header', async () => {
    // Act
    const response = await supertest(app).get('/download');

    // Assert
    expect(response.statusCode).toBe(HTTPStatusCode.Unauthorized);
    expect(response.body).toEqual(
      ApiResponse.builder().withStatus(HTTPStatusCode.Unauthorized).withMessage('No Bearer token provided').build(),
    );
  });

  it("should return 403 when user tries to download a file that doesn't belong to him", async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);
    const downloadDir = path.join(process.env.UPLOAD_DIR as string, MOCK_USER.admin_user.uuid);

    // Act
    const response = await supertest(app)
      .get('/download')
      .query({file: path.join(downloadDir, 'adminfile.txt')})
      .set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Forbidden);
    expect(response.body.message).toBe('You are not allowed to access this file');
    validateAuthHeaderSpy.mockRestore();
  });

  it("should return 403 when admin tries to download a file that doesn't belong to him", async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.admin_user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.admin_user);
    const downloadDir = path.join(process.env.UPLOAD_DIR as string, MOCK_USER.user.uuid);

    // Act
    const response = await supertest(app)
      .get('/download')
      .query({file: path.join(downloadDir, 'userfile.txt')})
      .set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Forbidden);
    expect(response.body.message).toBe('You are not allowed to access this file');
    validateAuthHeaderSpy.mockRestore();
  });

  it("should return 404, when requested file wasn't found", async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);
    const downloadDir = path.join(process.env.UPLOAD_DIR as string, MOCK_USER.user.uuid);

    // Act
    const response = await supertest(app)
      .get('/download')
      .query({file: 'missing-userfile.txt'})
      .set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.NotFound);
    validateAuthHeaderSpy.mockRestore();
  });

  it("should return files from the user's directory", async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);
    const downloadDir = path.join(process.env.UPLOAD_DIR as string, MOCK_USER.user.uuid);

    // Act
    const response = await supertest(app)
      .get('/download')
      .query({file: path.join(downloadDir, 'userfile.txt')})
      .set('Authorization', userBearerToken)
      .buffer()
      .parse((res, callback) => {
        res.setEncoding('binary');
        // @ts-ignore
        res.data = '';
        res.on('data', chunk => {
          // @ts-ignore
          res.data += chunk;
        });
        res.on('end', () => {
          // @ts-ignore
          callback(null, Buffer.from(res.data, 'binary'));
        });
      });

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Ok);
    expect(response.headers['content-disposition']).toEqual('attachment; filename="userfile.txt"');
    expect(response.headers['content-type']).toBe('text/plain; charset=UTF-8');
    expect(response.headers['content-length']).toEqual('24');
    validateAuthHeaderSpy.mockRestore();
  });

  it("should return files from the user's directory with path auto-complete", async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);
    const downloadDir = path.join(process.env.UPLOAD_DIR as string, MOCK_USER.user.uuid);

    // Act
    const response = await supertest(app)
      .get('/download')
      .query({file: 'userfile.txt', useUserDir: 'true'})
      .set('Authorization', userBearerToken)
      .buffer()
      .parse((res, callback) => {
        res.setEncoding('binary');
        // @ts-ignore
        res.data = '';
        res.on('data', chunk => {
          // @ts-ignore
          res.data += chunk;
        });
        res.on('end', () => {
          // @ts-ignore
          callback(null, Buffer.from(res.data, 'binary'));
        });
      });

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Ok);
    expect(response.headers['content-disposition']).toEqual('attachment; filename="userfile.txt"');
    expect(response.headers['content-type']).toBe('text/plain; charset=UTF-8');
    expect(response.headers['content-length']).toEqual('24');
    validateAuthHeaderSpy.mockRestore();
  });
});

describe('/delete should behave as expected', () => {
  it('should return UNAUTHORIZED when missing the Authorization-Header', async () => {
    // Act
    const response = await supertest(app).get('/delete');

    // Assert
    expect(response.statusCode).toBe(HTTPStatusCode.Unauthorized);
    expect(response.body).toEqual(
      ApiResponse.builder().withStatus(HTTPStatusCode.Unauthorized).withMessage('No Bearer token provided').build(),
    );
  });

  it("should return 404 when the requested file doesn't exist", async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);

    // Act
    const response = await supertest(app)
      .delete('/delete')
      .query({file: 'adminfile.txt', useUserDir: 'true'})
      .set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.NotFound);
    expect(response.body.message).toBe("adminfile.txt wasn't found");
    validateAuthHeaderSpy.mockRestore();
  });

  it("should return UNATUHORIZED when the user doesn't have the required permissions", async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);
    const deleteDir = path.join(process.env.UPLOAD_DIR as string, MOCK_USER.admin_user.uuid),
      deleteFile = path.join(deleteDir, 'adminfile.txt');

    // Act
    const response = await supertest(app)
      .delete('/delete')
      .query({file: deleteFile})
      .set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Forbidden);
    expect(response.body.message).toBe('You are not allowed to access this file');
    validateAuthHeaderSpy.mockRestore();
  });

  it("should return UNATUHORIZED when the admin doesn't have the required permissions", async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.admin_user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.admin_user);
    const deleteDir = path.join(process.env.UPLOAD_DIR as string, MOCK_USER.user.uuid),
      deleteFile = path.join(deleteDir, 'userfile.txt');

    // Act
    const response = await supertest(app)
      .delete('/delete')
      .query({file: deleteFile})
      .set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Forbidden);
    expect(response.body.message).toBe('You are not allowed to access this file');
    validateAuthHeaderSpy.mockRestore();
  });

  it('should delete the file', async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);
    const deleteDir = path.join(process.env.UPLOAD_DIR as string, MOCK_USER.user.uuid),
      deleteFile = path.join(deleteDir, 'new-file.txt');

    if (!fs.existsSync(deleteFile)) {
      fs.writeFileSync(deleteFile, 'Hello World');
    }

    // Act
    const response = await supertest(app)
      .delete('/delete')
      .query({file: deleteFile})
      .set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Ok);
    expect(response.body.message).toBe('The file was permanently deleted');
    expect(fs.existsSync(deleteFile)).toBeFalsy();
    validateAuthHeaderSpy.mockRestore();
  });

  it('should delete the file, with base users upload-dir as base', async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);
    const deleteDir = path.join(process.env.UPLOAD_DIR as string, MOCK_USER.user.uuid);
    const file1 = 'new-file1.txt',
      deleteFile1 = path.join(deleteDir, file1);

    if (!fs.existsSync(deleteFile1)) {
      fs.writeFileSync(deleteFile1, 'Hello World');
    }

    // Act
    const response = await supertest(app)
      .delete('/delete')
      .query({file: deleteFile1})
      .set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Ok);
    expect(response.body.message).toBe('The file was permanently deleted');
    expect(fs.existsSync(deleteFile1)).toBeFalsy();
    validateAuthHeaderSpy.mockRestore();
  });

  it('should delete multiple files', async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);
    const deleteDir = path.join(process.env.UPLOAD_DIR as string, MOCK_USER.user.uuid);
    const file1 = 'new-file1.txt',
      deleteFile1 = path.join(deleteDir, file1),
      file2 = 'new-file2.txt',
      deleteFile2 = path.join(deleteDir, file2);
    if (!fs.existsSync(deleteFile1)) {
      fs.writeFileSync(deleteFile1, 'Hello World');
    }
    if (!fs.existsSync(deleteFile2)) {
      fs.writeFileSync(deleteFile2, 'Hello World');
    }

    // Act
    const query = new URLSearchParams();
    query.append('file', deleteFile1);
    query.append('file', deleteFile2);
    const response = await supertest(app)
      .delete('/delete')
      .query(query.toString())
      .set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Ok);
    expect(response.body.message).toBe('2 files were permanently deleted');
    expect(fs.existsSync(deleteFile1)).toBeFalsy();
    expect(fs.existsSync(deleteFile2)).toBeFalsy();
    validateAuthHeaderSpy.mockRestore();
  });

  it('should delete multiple files, with base users upload-dir as base', async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);
    const deleteDir = path.join(process.env.UPLOAD_DIR as string, MOCK_USER.user.uuid);
    const file1 = 'new-file1.txt',
      deleteFile1 = path.join(deleteDir, file1),
      file2 = 'new-file2.txt',
      deleteFile2 = path.join(deleteDir, file2);
    if (!fs.existsSync(deleteFile1)) {
      fs.writeFileSync(deleteFile1, 'Hello World');
    }
    if (!fs.existsSync(deleteFile2)) {
      fs.writeFileSync(deleteFile2, 'Hello World');
    }

    // Act
    const query = new URLSearchParams();
    query.append('file', file1);
    query.append('file', file2);
    query.append('useUserDir', 'true');
    const response = await supertest(app)
      .delete('/delete')
      .query(query.toString())
      .set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.statusCode).toBe(HTTPStatusCode.Ok);
    expect(response.body.message).toBe('2 files were permanently deleted');
    expect(fs.existsSync(deleteFile1)).toBeFalsy();
    expect(fs.existsSync(deleteFile2)).toBeFalsy();
    validateAuthHeaderSpy.mockRestore();
  });
});
