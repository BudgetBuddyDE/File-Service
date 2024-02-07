import {z} from 'zod';
import {
  type TUser,
  type TApiResponse,
  type TTransactionFile,
  HTTPStatusCode,
  ZTransactionFile,
  type TCreateTransactionFilePayload,
  type TServiceResponse,
} from '@budgetbuddyde/types';
import {ELogCategory, log} from '../middleware';

export class BackendService {
  private static host = process.env.BACKEND_HOST as string;

  static prepareRequestOptions({uuid, password}: Pick<TUser, 'uuid' | 'password'>): RequestInit {
    return {
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json;charset=utf-8',
        Authorization: `Bearer ${uuid}.${password}`,
      },
    };
  }

  static async attachFilesToTransaction(
    files: TCreateTransactionFilePayload[],
    user: TUser,
  ): Promise<TServiceResponse<TTransactionFile[]>> {
    try {
      const response = await fetch(this.host + '/v1/transaction/file', {
        method: 'POST',
        body: JSON.stringify(files),
        ...this.prepareRequestOptions(user),
      });
      const json = (await response.json()) as TApiResponse<TTransactionFile[]>;
      if (json.status !== HTTPStatusCode.Ok) {
        throw new Error(json.message || "Something wen't wrong");
      }

      const parsingResult = z.array(ZTransactionFile).safeParse(json.data);
      if (!parsingResult.success) throw new Error(parsingResult.error.message);
      return [parsingResult.data, null];
    } catch (error) {
      log('ERROR', ELogCategory.UPLOAD, typeof error === 'object' ? JSON.stringify(error) : (error as string));
      return [null, error as Error];
    }
  }
}
