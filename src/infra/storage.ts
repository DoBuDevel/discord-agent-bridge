/**
 * Default IStorage implementation using Node.js fs
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, openSync, chmodSync } from 'fs';
import type { IStorage } from '../types/interfaces.js';

export class FileStorage implements IStorage {
  readFile(path: string, encoding: string): string {
    return readFileSync(path, encoding as BufferEncoding);
  }

  writeFile(path: string, data: string): void {
    writeFileSync(path, data);
  }

  chmod(path: string, mode: number): void {
    chmodSync(path, mode);
  }

  exists(path: string): boolean {
    return existsSync(path);
  }

  mkdirp(path: string): void {
    mkdirSync(path, { recursive: true });
  }

  unlink(path: string): void {
    unlinkSync(path);
  }

  openSync(path: string, flags: string): number {
    return openSync(path, flags);
  }
}
