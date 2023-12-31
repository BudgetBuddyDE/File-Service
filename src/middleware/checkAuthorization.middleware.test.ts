import {ApiResponse, HTTPStatusCode, TUser} from '@budgetbuddyde/types';
import {AuthService} from '../services';
import {MOCK_USER} from '../__tests__/server.test';
import supertest from 'supertest';
import {app} from '../server';
import {ZUuid} from './checkAuthorization.middleware';

describe('checkAuthorizationHeader middleware', () => {
  const uuid = MOCK_USER.user.uuid;
  const requestAdminFilePath = '/static/' + MOCK_USER.admin_user.uuid + '/adminfile.txt';
  const requestPath = '/static/' + uuid + '/userfile.txt';
  const requestServerFilePath = '/static/test.txt';

  it('should return a Unauthorized response if the authorization header is missing', async () => {
    // Act
    const response = await supertest(app).get(requestPath);

    // Assert
    expect(response.statusCode).toBe(HTTPStatusCode.Unauthorized);
  });

  it('should return a 401 Unauthorized response if the authorization header has invalid values', async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([null, new Error('Invalid Bearer token provided')]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);

    // Act
    const response = await supertest(app).get(requestPath).set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.status).toBe(HTTPStatusCode.Unauthorized);
    validateAuthHeaderSpy.mockRestore();
  });

  it("should deny access when requesting a file that doesn't belong to the user, even for admins", async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    // should return the admin user uuid from the path
    jest.spyOn(ZUuid, 'safeParse').mockReturnValueOnce({success: true, data: MOCK_USER.admin_user.uuid} as any);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);

    // Act
    const response = await supertest(app).get(requestAdminFilePath).set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.status).toBe(HTTPStatusCode.Forbidden);
    expect(response.body).toEqual(
      ApiResponse.builder()
        .withStatus(HTTPStatusCode.Forbidden)
        .withMessage("You don't have access to this file")
        .build(),
    );
    validateAuthHeaderSpy.mockRestore();
  });

  it('should pass when the user is requesting a file that belongs to him', async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);
    jest.spyOn(ZUuid, 'safeParse').mockReturnValueOnce({success: true, data: MOCK_USER.user.uuid} as any);

    // Act
    const response = await supertest(app).get(requestPath).set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.status).toBe(HTTPStatusCode.Ok);
    validateAuthHeaderSpy.mockRestore();
  });

  it('should deny access to all non-user files for users', async () => {
    // Arrange
    const validateAuthHeaderSpy = jest.spyOn(AuthService, 'validateAuthHeader');
    validateAuthHeaderSpy.mockResolvedValue([MOCK_USER.user as TUser, null]);
    const userBearerToken = AuthService.buildBearerToken(MOCK_USER.user);

    // Act
    const response = await supertest(app).get(requestServerFilePath).set('Authorization', userBearerToken);

    // Assert
    expect(validateAuthHeaderSpy).toHaveBeenCalledWith(userBearerToken);
    expect(response.status).toBe(HTTPStatusCode.Forbidden);
    validateAuthHeaderSpy.mockRestore();
  });
});
