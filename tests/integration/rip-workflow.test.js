/**
 * Integration tests for complete ripping workflow
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RipService } from '../../src/services/rip.service.js';
import { DiscService } from '../../src/services/disc.service.js';
import { DriveService } from '../../src/services/drive.service.js';
import { exec } from 'child_process';

// Use real modules but mock external dependencies
vi.mock('child_process');
vi.mock('win-eject');

describe('Complete Ripping Workflow Integration', () => {
  let ripService;

  beforeEach(() => {
    vi.clearAllMocks();
    ripService = new RipService();
    
    // Setup default test environment
    process.env.NODE_ENV = 'test';
  });

  afterEach(() => {
    // Cleanup any test files or state
    globalThis.testCleanup?.();
  });

  describe('Successful ripping workflow', () => {
    it('should complete full ripping process with multiple discs', async () => {
      // Mock drive detection
      const mockDriveData = `DRV:0,2,999,1,"BD-ROM HL-DT-ST BD-RE  BH16NS40 1.02d","Test Blu-ray Movie","/dev/sr0"
DRV:1,2,999,1,"DVD+R-DL MATSHITA DVD-RAM UJ8E2 1.00","Test DVD Movie","/dev/sr1"`;

      const mockFileData = `TINFO:0,9,0,"1:23:45"
TINFO:1,9,0,"0:45:12"
TINFO:2,9,0,"2:15:30"`;

      const mockRipOutput = `MSG:5036,0,1,"Copy complete. 1 titles saved."
Additional MakeMKV output here`;

      exec.mockImplementation((command, callback) => {
        if (command.includes('info disc:index')) {
          callback(null, mockDriveData, '');
        } else if (command.includes('info disc:')) {
          callback(null, mockFileData, '');
        } else if (command.includes('mkv disc:')) {
          // Simulate ripping delay
          setTimeout(() => {
            callback(null, mockRipOutput, '');
          }, 10);
        }
      });

      // Mock successful drive operations
      const { default: winEject } = await import('win-eject');
      winEject.close.mockImplementation((drive, callback) => callback());
      winEject.eject.mockImplementation((drive, callback) => callback());

      // Execute the workflow
      await ripService.startRipping();

      // Verify drive operations were called
      expect(winEject.close).toHaveBeenCalled(); // Load drives
      expect(winEject.eject).toHaveBeenCalled(); // Eject drives

      // Verify MakeMKV commands were executed
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('info disc:index'),
        expect.any(Function)
      );
      
      // Should have called info for each disc
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('info disc:0'),
        expect.any(Function)
      );
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('info disc:1'),
        expect.any(Function)
      );

      // Should have called mkv for each disc
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('mkv disc:0'),
        expect.any(Function)
      );
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('mkv disc:1'),
        expect.any(Function)
      );
    });

    it('should handle single disc ripping workflow', async () => {
      const mockDriveData = `DRV:0,2,999,1,"BD-ROM HL-DT-ST","Single Movie","/dev/sr0"`;
      const mockFileData = `TINFO:0,9,0,"1:45:30"`;
      const mockRipOutput = `MSG:5036,0,1,"Copy complete. 1 titles saved."`;

      exec.mockImplementation((command, callback) => {
        if (command.includes('info disc:index')) {
          callback(null, mockDriveData, '');
        } else if (command.includes('info disc:0')) {
          callback(null, mockFileData, '');
        } else if (command.includes('mkv disc:0')) {
          callback(null, mockRipOutput, '');
        }
      });

      const { default: winEject } = await import('win-eject');
      winEject.close.mockImplementation((drive, callback) => callback());
      winEject.eject.mockImplementation((drive, callback) => callback());

      await ripService.startRipping();

      // Verify single disc workflow
      expect(exec).toHaveBeenCalledTimes(3); // index, disc info, rip
    });
  });

  describe('Error handling in workflow', () => {
    it('should handle disc detection failure', async () => {
      exec.mockImplementation((command, callback) => {
        if (command.includes('info disc:index')) {
          callback(null, '', 'No drives found');
        }
      });

      await expect(ripService.startRipping()).rejects.toContain('No drives found');
    });

    it('should handle partial ripping failures', async () => {
      const mockDriveData = `DRV:0,2,999,1,"BD-ROM","Movie 1","/dev/sr0"
DRV:1,2,999,1,"DVD","Movie 2","/dev/sr1"`;

      const mockFileData = `TINFO:0,9,0,"1:30:00"`;

      exec.mockImplementation((command, callback) => {
        if (command.includes('info disc:index')) {
          callback(null, mockDriveData, '');
        } else if (command.includes('info disc:')) {
          callback(null, mockFileData, '');
        } else if (command.includes('mkv disc:0')) {
          callback(null, 'MSG:5036,0,1,"Copy complete. 1 titles saved."', '');
        } else if (command.includes('mkv disc:1')) {
          callback(null, '', 'Ripping failed');
        }
      });

      const { default: winEject } = await import('win-eject');
      winEject.close.mockImplementation((drive, callback) => callback());
      winEject.eject.mockImplementation((drive, callback) => callback());

      // Should complete despite one failure
      await ripService.startRipping();

      // Verify both ripping attempts were made
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('mkv disc:0'),
        expect.any(Function)
      );
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('mkv disc:1'),
        expect.any(Function)
      );

      // Check that results arrays are properly managed
      expect(ripService.goodVideoArray).toContain('Movie 1');
      expect(ripService.badVideoArray).toContain('Movie 2');
    });

    it('should handle drive operation failures', async () => {
      const { default: winEject } = await import('win-eject');
      winEject.close.mockImplementation((drive, callback) => {
        throw new Error('Drive close failed');
      });

      await expect(ripService.startRipping()).rejects.toThrow('Drive close failed');
    });
  });

  describe('Configuration scenarios', () => {
    it('should handle eject disabled workflow', async () => {
      // Mock AppConfig to disable ejection
      vi.doMock('../../src/config/index.js', () => ({
        AppConfig: {
          makeMKVExecutable: '"test"',
          movieRipsDir: './test-media',
          isEjectEnabled: false,
          isRipAllEnabled: false,
          isFileLogEnabled: false
        }
      }));

      const mockDriveData = `DRV:0,2,999,1,"BD-ROM","Test Movie","/dev/sr0"`;
      const mockFileData = `TINFO:0,9,0,"1:30:00"`;
      const mockRipOutput = `MSG:5036,0,1,"Copy complete."`;

      exec.mockImplementation((command, callback) => {
        if (command.includes('info disc:index')) {
          callback(null, mockDriveData, '');
        } else if (command.includes('info disc:0')) {
          callback(null, mockFileData, '');
        } else if (command.includes('mkv disc:0')) {
          callback(null, mockRipOutput, '');
        }
      });

      const { default: winEject } = await import('win-eject');
      winEject.close.mockImplementation((drive, callback) => callback());
      winEject.eject.mockImplementation((drive, callback) => callback());

      await ripService.startRipping();

      // Should not call drive operations when ejection is disabled
      expect(winEject.close).not.toHaveBeenCalled();
      expect(winEject.eject).not.toHaveBeenCalled();
    });

    it('should handle rip all enabled workflow', async () => {
      // Mock AppConfig to enable rip all
      vi.doMock('../../src/config/index.js', () => ({
        AppConfig: {
          makeMKVExecutable: '"test"',
          movieRipsDir: './test-media',
          isEjectEnabled: true,
          isRipAllEnabled: true,
          isFileLogEnabled: false
        }
      }));

      const mockDriveData = `DRV:0,2,999,1,"BD-ROM","Test Movie","/dev/sr0"`;
      const mockRipOutput = `MSG:5036,0,1,"Copy complete."`;

      exec.mockImplementation((command, callback) => {
        if (command.includes('info disc:index')) {
          callback(null, mockDriveData, '');
        } else if (command.includes('info disc:0')) {
          callback(null, 'any file data', ''); // Should use 'all' for file number
        } else if (command.includes('mkv disc:0 all')) {
          callback(null, mockRipOutput, '');
        }
      });

      const { default: winEject } = await import('win-eject');
      winEject.close.mockImplementation((drive, callback) => callback());
      winEject.eject.mockImplementation((drive, callback) => callback());

      await ripService.startRipping();

      // Should use 'all' as file number
      expect(exec).toHaveBeenCalledWith(
        expect.stringContaining('mkv disc:0 all'),
        expect.any(Function)
      );
    });
  });

  describe('File system operations', () => {
    it('should create unique folders for each rip', async () => {
      const fs = await import('fs');
      
      // Mock filesystem operations
      let folderCount = 0;
      const originalExistsSync = fs.existsSync;
      const originalMkdirSync = fs.mkdirSync;
      
      vi.spyOn(fs, 'existsSync').mockImplementation((path) => {
        // First call returns false (folder doesn't exist)
        // Subsequent calls for same path return true
        return folderCount++ > 0;
      });
      
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});

      const mockDriveData = `DRV:0,2,999,1,"BD-ROM","Test Movie","/dev/sr0"
DRV:1,2,999,1,"DVD","Test Movie","/dev/sr1"`;

      const mockFileData = `TINFO:0,9,0,"1:30:00"`;
      const mockRipOutput = `MSG:5036,0,1,"Copy complete."`;

      exec.mockImplementation((command, callback) => {
        if (command.includes('info disc:index')) {
          callback(null, mockDriveData, '');
        } else if (command.includes('info disc:')) {
          callback(null, mockFileData, '');
        } else if (command.includes('mkv disc:')) {
          callback(null, mockRipOutput, '');
        }
      });

      const { default: winEject } = await import('win-eject');
      winEject.close.mockImplementation((drive, callback) => callback());
      winEject.eject.mockImplementation((drive, callback) => callback());

      await ripService.startRipping();

      // Should create folders for both movies
      expect(fs.mkdirSync).toHaveBeenCalledTimes(2);
      
      // Restore original functions
      fs.existsSync.mockRestore();
      fs.mkdirSync.mockRestore();
    });

    it('should handle file logging when enabled', async () => {
      // Mock AppConfig to enable file logging
      vi.doMock('../../src/config/index.js', () => ({
        AppConfig: {
          makeMKVExecutable: '"test"',
          movieRipsDir: './test-media',
          logDir: './test-logs',
          isEjectEnabled: true,
          isRipAllEnabled: false,
          isFileLogEnabled: true
        }
      }));

      const fs = await import('fs');
      vi.spyOn(fs, 'existsSync').mockReturnValue(false);
      vi.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
      vi.spyOn(fs, 'writeFile').mockImplementation((path, data, encoding, callback) => {
        callback(null);
      });

      const mockDriveData = `DRV:0,2,999,1,"BD-ROM","Test Movie","/dev/sr0"`;
      const mockFileData = `TINFO:0,9,0,"1:30:00"`;
      const mockRipOutput = `MSG:5036,0,1,"Copy complete. 1 titles saved."
Full MakeMKV log output here`;

      exec.mockImplementation((command, callback) => {
        if (command.includes('info disc:index')) {
          callback(null, mockDriveData, '');
        } else if (command.includes('info disc:0')) {
          callback(null, mockFileData, '');
        } else if (command.includes('mkv disc:0')) {
          callback(null, mockRipOutput, '');
        }
      });

      const { default: winEject } = await import('win-eject');
      winEject.close.mockImplementation((drive, callback) => callback());
      winEject.eject.mockImplementation((drive, callback) => callback());

      await ripService.startRipping();

      // Should write log file
      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('Log-Test Movie'),
        mockRipOutput,
        'utf8',
        expect.any(Function)
      );
    });
  });

  describe('Performance and concurrency', () => {
    it('should handle concurrent disc ripping', async () => {
      const mockDriveData = `DRV:0,2,999,1,"BD-ROM","Movie 1","/dev/sr0"
DRV:1,2,999,1,"DVD","Movie 2","/dev/sr1"
DRV:2,2,999,1,"BD-ROM","Movie 3","/dev/sr2"`;

      const mockFileData = `TINFO:0,9,0,"1:30:00"`;
      const mockRipOutput = `MSG:5036,0,1,"Copy complete."`;

      let ripCount = 0;
      exec.mockImplementation((command, callback) => {
        if (command.includes('info disc:index')) {
          callback(null, mockDriveData, '');
        } else if (command.includes('info disc:')) {
          callback(null, mockFileData, '');
        } else if (command.includes('mkv disc:')) {
          ripCount++;
          // Simulate different ripping times
          setTimeout(() => {
            callback(null, mockRipOutput, '');
          }, Math.random() * 50);
        }
      });

      const { default: winEject } = await import('win-eject');
      winEject.close.mockImplementation((drive, callback) => callback());
      winEject.eject.mockImplementation((drive, callback) => callback());

      const startTime = Date.now();
      await ripService.startRipping();
      const endTime = Date.now();

      // Should process all three discs
      expect(ripCount).toBe(3);
      
      // Should complete in reasonable time (concurrent processing)
      expect(endTime - startTime).toBeLessThan(200);
    });

    it('should handle large number of titles on disc', async () => {
      const mockDriveData = `DRV:0,2,999,1,"BD-ROM","Complex Movie","/dev/sr0"`;
      
      // Generate many title entries
      const titleEntries = Array.from({ length: 20 }, (_, i) => 
        `TINFO:${i},9,0,"${Math.floor(Math.random() * 3)}:${Math.floor(Math.random() * 60)}:${Math.floor(Math.random() * 60)}"`
      ).join('\n');
      
      const mockRipOutput = `MSG:5036,0,1,"Copy complete."`;

      exec.mockImplementation((command, callback) => {
        if (command.includes('info disc:index')) {
          callback(null, mockDriveData, '');
        } else if (command.includes('info disc:0')) {
          callback(null, titleEntries, '');
        } else if (command.includes('mkv disc:0')) {
          callback(null, mockRipOutput, '');
        }
      });

      const { default: winEject } = await import('win-eject');
      winEject.close.mockImplementation((drive, callback) => callback());
      winEject.eject.mockImplementation((drive, callback) => callback());

      await ripService.startRipping();

      // Should handle many titles and select the longest one
      expect(exec).toHaveBeenCalledWith(
        expect.stringMatching(/mkv disc:0 \d+/),
        expect.any(Function)
      );
    });
  });
});
