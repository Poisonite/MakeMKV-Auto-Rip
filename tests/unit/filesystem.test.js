/**
 * Unit tests for filesystem utilities
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import { FileSystemUtils } from '../../src/utils/filesystem.js';

// Mock fs module
vi.mock('fs');

describe('FileSystemUtils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('makeTitleValidFolderPath', () => {
    it('should remove invalid characters from folder path', () => {
      const invalidTitle = 'Movie: Title/Part\\Two*With?Special<Chars>And|Quotes"';
      const expected = 'Movie Title/PartTwoWithSpecialCharsAndQuotes';
      
      const result = FileSystemUtils.makeTitleValidFolderPath(invalidTitle);
      expect(result).toBe(expected);
    });

    it('should handle empty string', () => {
      const result = FileSystemUtils.makeTitleValidFolderPath('');
      expect(result).toBe('');
    });

    it('should handle string with only invalid characters', () => {
      const invalidTitle = '\\/:*?"<>|';
      const result = FileSystemUtils.makeTitleValidFolderPath(invalidTitle);
      expect(result).toBe('');
    });

    it('should handle string with no invalid characters', () => {
      const validTitle = 'Normal Movie Title';
      const result = FileSystemUtils.makeTitleValidFolderPath(validTitle);
      expect(result).toBe(validTitle);
    });

    it('should remove single and double quotes', () => {
      const titleWithQuotes = "Movie's Title \"Special Edition\"";
      const expected = "Movies Title Special Edition";
      
      const result = FileSystemUtils.makeTitleValidFolderPath(titleWithQuotes);
      expect(result).toBe(expected);
    });

    it('should handle multiple invalid characters in sequence', () => {
      const titleWithMultiple = 'Movie\\\\//::Title';
      const expected = 'MovieTitle';
      
      const result = FileSystemUtils.makeTitleValidFolderPath(titleWithMultiple);
      expect(result).toBe(expected);
    });

    it('should preserve spaces and valid characters', () => {
      const title = 'Movie Title 2023 - Extended Cut (Blu-ray)';
      const expected = 'Movie Title 2023 - Extended Cut (Blu-ray)';
      
      const result = FileSystemUtils.makeTitleValidFolderPath(title);
      expect(result).toBe(expected);
    });
  });

  describe('createUniqueFolder', () => {
    beforeEach(() => {
      fs.existsSync = vi.fn();
      fs.mkdirSync = vi.fn();
    });

    it('should create folder with original name if it does not exist', () => {
      const outputPath = 'C:\\output';
      const folderName = 'Movie Title';
      const expectedPath = 'C:\\output\\Movie Title';
      
      fs.existsSync.mockReturnValue(false);
      
      const result = FileSystemUtils.createUniqueFolder(outputPath, folderName);
      
      expect(result).toBe(expectedPath);
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(fs.mkdirSync).toHaveBeenCalledWith(expectedPath);
    });

    it('should create folder with incremented name if original exists', () => {
      const outputPath = 'C:\\output';
      const folderName = 'Movie Title';
      const originalPath = 'C:\\output\\Movie Title';
      const expectedPath = 'C:\\output\\Movie Title-1';
      
      fs.existsSync
        .mockReturnValueOnce(true)  // Original exists
        .mockReturnValueOnce(false); // Incremented doesn't exist
      
      const result = FileSystemUtils.createUniqueFolder(outputPath, folderName);
      
      expect(result).toBe(expectedPath);
      expect(fs.existsSync).toHaveBeenCalledWith(originalPath);
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
      expect(fs.mkdirSync).toHaveBeenCalledWith(expectedPath);
    });

    it('should handle multiple existing folders', () => {
      const outputPath = 'C:\\output';
      const folderName = 'Movie Title';
      const expectedPath = 'C:\\output\\Movie Title-3';
      
      fs.existsSync
        .mockReturnValueOnce(true)  // Original exists
        .mockReturnValueOnce(true)  // -1 exists
        .mockReturnValueOnce(true)  // -2 exists
        .mockReturnValueOnce(false); // -3 doesn't exist
      
      const result = FileSystemUtils.createUniqueFolder(outputPath, folderName);
      
      expect(result).toBe(expectedPath);
      expect(fs.mkdirSync).toHaveBeenCalledWith(expectedPath);
    });

    it('should handle Unix-style paths', () => {
      const outputPath = '/home/user/output';
      const folderName = 'Movie Title';
      const expectedPath = '/home/user/output\\Movie Title';
      
      fs.existsSync.mockReturnValue(false);
      
      const result = FileSystemUtils.createUniqueFolder(outputPath, folderName);
      
      expect(result).toBe(expectedPath);
      expect(fs.mkdirSync).toHaveBeenCalledWith(expectedPath);
    });
  });

  describe('createUniqueLogFile', () => {
    beforeEach(() => {
      fs.existsSync = vi.fn();
    });

    it('should create log file with original name if it does not exist', () => {
      const logDir = 'C:\\logs';
      const fileName = 'Movie Title';
      const expectedPath = 'C:\\logs\\Log-Movie Title.txt';
      
      fs.existsSync.mockReturnValue(false);
      
      const result = FileSystemUtils.createUniqueLogFile(logDir, fileName);
      
      expect(result).toBe(expectedPath);
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
    });

    it('should create log file with incremented name if original exists', () => {
      const logDir = 'C:\\logs';
      const fileName = 'Movie Title';
      const originalPath = 'C:\\logs\\Log-Movie Title.txt';
      const expectedPath = 'C:\\logs\\Log-Movie Title-1.txt';
      
      fs.existsSync
        .mockReturnValueOnce(true)  // Original exists
        .mockReturnValueOnce(false); // Incremented doesn't exist
      
      const result = FileSystemUtils.createUniqueLogFile(logDir, fileName);
      
      expect(result).toBe(expectedPath);
      expect(fs.existsSync).toHaveBeenCalledWith(originalPath);
      expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
    });

    it('should handle multiple existing log files', () => {
      const logDir = 'C:\\logs';
      const fileName = 'Movie Title';
      const expectedPath = 'C:\\logs\\Log-Movie Title-2.txt';
      
      fs.existsSync
        .mockReturnValueOnce(true)  // Original exists
        .mockReturnValueOnce(true)  // -1 exists
        .mockReturnValueOnce(false); // -2 doesn't exist
      
      const result = FileSystemUtils.createUniqueLogFile(logDir, fileName);
      
      expect(result).toBe(expectedPath);
    });
  });

  describe('writeLogFile', () => {
    beforeEach(() => {
      fs.writeFile = vi.fn();
    });

    it('should write content to log file successfully', async () => {
      const filePath = 'C:\\logs\\Log-Movie Title.txt';
      const content = 'Log content here';
      const titleName = 'Movie Title';
      
      fs.writeFile.mockImplementation((path, data, encoding, callback) => {
        callback(null);
      });
      
      await expect(FileSystemUtils.writeLogFile(filePath, content, titleName))
        .resolves.toBeUndefined();
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        filePath,
        content,
        'utf8',
        expect.any(Function)
      );
    });

    it('should reject when file write fails', async () => {
      const filePath = 'C:\\logs\\Log-Movie Title.txt';
      const content = 'Log content here';
      const titleName = 'Movie Title';
      const error = new Error('Write failed');
      
      fs.writeFile.mockImplementation((path, data, encoding, callback) => {
        callback(error);
      });
      
      await expect(FileSystemUtils.writeLogFile(filePath, content, titleName))
        .rejects.toThrow('Write failed');
    });

    it('should handle empty content', async () => {
      const filePath = 'C:\\logs\\Log-Empty.txt';
      const content = '';
      const titleName = 'Empty Title';
      
      fs.writeFile.mockImplementation((path, data, encoding, callback) => {
        callback(null);
      });
      
      await expect(FileSystemUtils.writeLogFile(filePath, content, titleName))
        .resolves.toBeUndefined();
      
      expect(fs.writeFile).toHaveBeenCalledWith(
        filePath,
        '',
        'utf8',
        expect.any(Function)
      );
    });
  });

  describe('ensureDirectoryExists', () => {
    beforeEach(() => {
      fs.existsSync = vi.fn();
      fs.mkdirSync = vi.fn();
    });

    it('should not create directory if it already exists', () => {
      const dirPath = 'C:\\existing\\directory';
      
      fs.existsSync.mockReturnValue(true);
      
      FileSystemUtils.ensureDirectoryExists(dirPath);
      
      expect(fs.existsSync).toHaveBeenCalledWith(dirPath);
      expect(fs.mkdirSync).not.toHaveBeenCalled();
    });

    it('should create directory if it does not exist', () => {
      const dirPath = 'C:\\new\\directory';
      
      fs.existsSync.mockReturnValue(false);
      
      FileSystemUtils.ensureDirectoryExists(dirPath);
      
      expect(fs.existsSync).toHaveBeenCalledWith(dirPath);
      expect(fs.mkdirSync).toHaveBeenCalledWith(dirPath, { recursive: true });
    });

    it('should handle nested directory creation', () => {
      const dirPath = 'C:\\very\\deep\\nested\\directory\\structure';
      
      fs.existsSync.mockReturnValue(false);
      
      FileSystemUtils.ensureDirectoryExists(dirPath);
      
      expect(fs.mkdirSync).toHaveBeenCalledWith(dirPath, { recursive: true });
    });

    it('should handle Unix-style paths', () => {
      const dirPath = '/home/user/documents/new/folder';
      
      fs.existsSync.mockReturnValue(false);
      
      FileSystemUtils.ensureDirectoryExists(dirPath);
      
      expect(fs.mkdirSync).toHaveBeenCalledWith(dirPath, { recursive: true });
    });
  });

  describe('Error Handling', () => {
    it('should handle fs.mkdirSync throwing an error', () => {
      const outputPath = 'C:\\output';
      const folderName = 'Movie Title';
      
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {
        throw new Error('Permission denied');
      });
      
      expect(() => {
        FileSystemUtils.createUniqueFolder(outputPath, folderName);
      }).toThrow('Permission denied');
    });

    it('should handle ensureDirectoryExists with permission error', () => {
      const dirPath = 'C:\\restricted\\directory';
      
      fs.existsSync.mockReturnValue(false);
      fs.mkdirSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });
      
      expect(() => {
        FileSystemUtils.ensureDirectoryExists(dirPath);
      }).toThrow('EACCES: permission denied');
    });
  });
});
