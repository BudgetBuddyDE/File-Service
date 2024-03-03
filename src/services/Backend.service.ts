import {z} from 'zod';
import {
  type TUser,
  type TApiResponse,
  type TTransactionFile,
  HTTPStatusCode,
  ZTransactionFile,
  type TCreateTransactionFilePayload,
  type TServiceResponse,
  type TTransaction,
  ZTransaction,
} from '@budgetbuddyde/types';
import {ELogCategory, logger} from '../middleware';

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

  static async getTransactionById(
    transactionId: TTransaction['id'],
    user: TUser,
  ): Promise<[TTransaction | null, Error | null]> {
    try {
      const query = new URLSearchParams();
      query.append('transactionId', transactionId.toString());
      const response = await fetch(`${this.host}/v1/transaction/single?${query.toString()}`, {
        ...this.prepareRequestOptions(user),
      });
      const json = (await response.json()) as TApiResponse<TTransaction>;
      if (json.status != 200) return [null, new Error(json.message!)];

      const parsingResult = ZTransaction.safeParse(json.data);
      if (!parsingResult.success) throw new Error(parsingResult.error.message);
      return [parsingResult.data, null];
    } catch (error) {
      console.error(error);
      return [null, error as Error];
    }
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
      const err = error as Error;
      logger.error(err.message, {
        category: ELogCategory.UPLOAD,
        name: err.name,
        message: err.message,
        stack: err.stack,
      });
      return [null, err];
    }
  }

  static async detachFileFromTransaction(
    files: {uuid: TTransactionFile['uuid']}[],
    user: TUser,
  ): Promise<TServiceResponse<TTransactionFile[]>> {
    try {
      const response = await fetch(this.host + '/v1/transaction/file', {
        method: 'DELETE',
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
      const err = error as Error;
      logger.error(err.message, {
        category: ELogCategory.UPLOAD,
        name: err.name,
        message: err.message,
        stack: err.stack,
      });
      return [null, err];
    }
  }
}
