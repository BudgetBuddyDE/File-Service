import fs from 'fs';
import path from 'path';
import type {TUser, TFile} from '@budgetbuddyde/types';
import {ELogCategory, log} from '../middleware';

export class FileService {
  private uploadDir: string;

  constructor(uploadDir: string) {
    if (fs.existsSync(uploadDir) === false) {
      throw new Error("Upload directory doesn't exist");
    }
    this.uploadDir = path.join(uploadDir);
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
   * Checks if a file exists at the specified file path.
   *
   * @param filePath - The path of the file to check.
   * @returns True if the file exists, false otherwise.
   */
  public doesFileExist(filePath: string): boolean {
    return fs.existsSync(filePath);
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
   * @param adminOverwrite - If true, the admins will still have access to the file.
   * @returns A boolean indicating whether the user has access to the file.
   */
  public doesUserHasAccessToFile(user: TUser, filePath: string, adminOverwrite = false): boolean {
    if (user.role.name === 'Admin' && adminOverwrite) {
      return true;
    }

    // would mean user owns direcotry and has access to all files in it
    return filePath.includes(user.uuid);
  }

  /**
   * Retrieves the list of files from a directory.
   *
   * @param dirPath - The path of the directory.
   * @param recursive - Indicates whether to search recursively in subdirectories. Default is false.
   * @returns An array of TFile objects representing the files in the directory.
   */
  public static getFilesFromDirectory(dirPath: string, recursive = false): TFile[] {
    let fileList: TFile[] = [];
    if (!fs.existsSync(dirPath)) {
      return fileList;
    }

    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
      const fileInformation = fs.statSync(path.join(dirPath, file));

      if (fileInformation.isFile() && !fileInformation.isDirectory()) {
        const tfile = FileService.getFileInformation(path.join(dirPath, file));
        if (tfile == null) log('ERROR', ELogCategory.FILES, 'Could not get file information for file: ' + file);
        fileList.push(tfile as TFile);
      } else if (recursive && fileInformation.isDirectory()) {
        fileList = fileList.concat(this.getFilesFromDirectory(path.join(dirPath, file), recursive));
      }
    });

    return fileList;
  }

  /**
   * Retrieves information about a file.
   * @param filePath - The path of the file.
   * @returns The file information or null if the file does not exist.
   */
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

  /**
   * Returns the path for a user's file based on the provided user and optional query path.
   * If a query path is provided, the function checks if the user has an 'Admin' role and returns the path joined with the upload directory.
   * If no query path is provided, the function returns the path joined with the user's file directory.
   * @param user - The user object.
   * @param queryPath - The optional query path.
   * @returns The path for the user's file.
   */
  public getPathByUser(user: TUser, queryPath?: string): string {
    return queryPath
      ? user.role.name === 'Admin'
        ? path.join(this.uploadDirectory, queryPath)
        : path.join(this.getUserFileDirectory(user), queryPath)
      : this.getUserFileDirectory(user);
  }

  /**
   * Checks if the given file path is a symbolic link.
   *
   * @param filePath - The path of the file to check.
   * @returns True if the file is a symbolic link, false otherwise.
   */
  public static isSymbolicLink(filePath: string): boolean {
    return fs.lstatSync(filePath).isSymbolicLink();
  }
}
