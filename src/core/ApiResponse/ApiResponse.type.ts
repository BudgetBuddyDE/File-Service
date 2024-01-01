export type ApiResponse<T1, T2 = undefined> = {
  status: T1;
  message: string;
  data?: T2;
};

/**
 * Validate if an object is an valid API-response
 */
export function isApiResponse(obj: unknown, withData = false): obj is ApiResponse<any, any> {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'status' in obj &&
    typeof obj.status === 'number' &&
    'message' in obj &&
    typeof obj.message === 'string' &&
    (withData ? 'data' in obj : true)
  );
}
