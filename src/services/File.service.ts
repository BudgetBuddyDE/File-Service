import fs from 'fs';
import path from 'path';
import type {TUser} from '@budgetbuddyde/types';

export type TFile = {
  name: string;
  created_at: fs.Stats['birthtime'];
  last_edited_at: fs.Stats['mtime'];
  size: fs.Stats['size'];
  location: string;
  type: string;
};

export class FileService {
  private uploadDir: string;

  constructor(uploadDir: string) {
    this.uploadDir = uploadDir;
  }

  get uploadDirectory(): string {
    return this.uploadDir;
  }

  /**
   * Checks if the file was already uploaded
   * @param filePath The path to the file
   * @returns True if the file was already uploaded, false otherwise
   */
  public wasFileAlreadyUploaded(filePath: string): boolean {
    return fs.existsSync(path.join(this.uploadDir, filePath));
  }

  /**
   * Returns the file directory for a given user.
   *
   * File structure: uploadDir/user.uuid/files
   *
   * @param user - The user object.
   * @returns The file directory path.
   */
  public getUserFileDirectory(user: TUser): string {
    return path.join(this.uploadDir, user.uuid);
  }

  /**
   * Checks if the user's file directory exists.
   *
   * File structure: uploadDir/user.uuid/files
   *
   * @param user - The user object.
   * @returns True if the user's file directory exists, false otherwise.
   */
  public doesUserFileDirectoryExist(user: TUser): boolean {
    return fs.existsSync(this.getUserFileDirectory(user));
  }

  /**
   * Checks if a user has access to a specific file.
   *
   * File structure: uploadDir/user.uuid/files
   *
   * @param user - The user object.
   * @param filePath - The path of the file.
   * @returns A boolean indicating whether the user has access to the file.
   */
  public doesUserHasAccessToFile(user: TUser, filePath: string): boolean {
    if (user.role.name === 'Admin') {
      return true;
    }

    // would mean user owns direcotry and has access to all files in it
    return filePath.includes(user.uuid);
  }

  // public getFilesFromDirectory(dirPath: string): TFile[] {
  //   let results: TFile[] = [];
  //   const list = fs.readdirSync(dirPath);

  //   list.forEach(file => {
  //     file = path.join(dirPath, file);
  //     const stat = fs.statSync(file);

  //     if (stat && stat.isDirectory()) {
  //       /* Recurse into a subdirectory */
  //       results = results.concat(this.getFilesFromDirectory(file));
  //     } else {
  //       /* Is a file */
  //       results.push(file);
  //     }
  //   });

  //   return results;
  // }

  public static getFileInformation(filePath: string): TFile | null {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const {birthtime, mtime, size} = fs.statSync(filePath);
    return {
      name: path.basename(filePath),
      created_at: birthtime,
      last_edited_at: mtime,
      size: size,
      location: filePath,
      type: path.extname(filePath),
    };
  }
}
