import path from 'path';
import {type TFile} from '@budgetbuddyde/types';
import {FileService} from './File.service';

describe('FileService', () => {
  describe('getFilesFromDirectory', () => {
    it('should return an empty array if the directory does not exist', () => {
      // Arrange
      const dirPath = 'non-existing-directory';

      // Act
      const result = FileService.getFilesFromDirectory(dirPath);

      // Assert
      expect(result).toEqual([]);
    });

    it('should return an array of TFile objects for files in the directory recursively', () => {
      // Arrange
      const dirPath = 'testfiles/demo-user-uuid';

      // Act
      const result = FileService.getFilesFromDirectory(dirPath, true);

      result.forEach(file => {
        // @ts-expect-error
        delete file.created_at;
        // @ts-expect-error
        delete file.last_edited_at;
      });

      // Assert
      expect(result).toHaveLength(2);
      expect(result).toEqual([
        {
          name: 'nested-file.txt',
          size: 36,
          location: path.join('testfiles', 'demo-user-uuid', 'nested', 'nested-file.txt'),
          type: '.txt',
        },
        {
          name: 'userfile.txt',
          size: 24,
          location: path.join('testfiles', 'demo-user-uuid', 'userfile.txt'),
          type: '.txt',
        },
      ] as TFile[]);
    });

    it('should return an array of TFile objects for files in the directory', () => {
      // Arrange
      const dirPath = 'testfiles/demo-user-uuid';

      // Act
      const result = FileService.getFilesFromDirectory(dirPath);

      // @ts-expect-error
      delete result[0].created_at;
      // @ts-expect-error
      delete result[0].last_edited_at;

      // Assert
      expect(result).toHaveLength(1);
      expect(result).toEqual([
        {
          name: 'userfile.txt',
          size: 24,
          location: path.join('testfiles', 'demo-user-uuid', 'userfile.txt'),
          type: '.txt',
        },
      ] as TFile[]);
    });
  });
});
