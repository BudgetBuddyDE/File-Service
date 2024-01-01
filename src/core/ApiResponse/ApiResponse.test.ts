import {type ApiResponse, isApiResponse} from './index';

describe('Validate correctness of function', () => {
  it("status isn't a number", () => {
    const response: Partial<ApiResponse<any>> = {
      status: 'test',
      message: '',
    };
    expect(isApiResponse(response)).toBeFalsy();
  });

  it("code isn't a string", () => {
    const response: Partial<ApiResponse<any>> = {
      status: 'test',
      // @ts-ignore
      code: 2000,
      message: '',
    };
    expect(isApiResponse(response)).toBeFalsy();
  });

  it("message isn't a string", () => {
    const response: Partial<ApiResponse<any>> = {
      status: 'test',
      // @ts-ignore
      message: 200,
    };
    expect(isApiResponse(response)).toBeFalsy();
  });

  it('missing param', () => {
    const response: Partial<ApiResponse<any>> = {
      status: 200,
    };
    expect(isApiResponse(response)).toBeFalsy();
  });

  it('null as response', () => {
    const response = null;
    expect(isApiResponse(response)).toBeFalsy();
  });

  it("data wasn't provided", () => {
    const response: Partial<ApiResponse<any, null>> = {
      status: 200,
    };
    expect(isApiResponse(response)).toBeFalsy();
  });

  it('data was provided', () => {
    const response: Partial<ApiResponse<any, {payload: string}>> = {
      status: 200,
      message: '',
      data: {
        payload: 'hello',
      },
    };
    expect(isApiResponse(response)).toBeTruthy();
  });
});
