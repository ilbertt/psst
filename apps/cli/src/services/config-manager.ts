import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.config', 'psst');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const ROOM_FILE = join(CONFIG_DIR, 'room.json');

interface ConfigData {
  serverUrl?: string;
  name?: string;
  [key: string]: string | undefined;
}

interface RoomData {
  code: string;
}

export class ConfigManager {
  private data: ConfigData;

  constructor() {
    mkdirSync(CONFIG_DIR, { recursive: true });
    this.data = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) : {};
  }

  get serverUrl(): string {
    return this.data.serverUrl ?? 'http://localhost:3000';
  }

  get(key: string): string | undefined {
    return this.data[key];
  }

  set({ key, value }: { key: string; value: string }): void {
    this.data[key] = value;
    writeFileSync(CONFIG_FILE, JSON.stringify(this.data, null, 2));
  }

  getCurrentRoom(): string | null {
    if (!existsSync(ROOM_FILE)) return null;
    const data: RoomData = JSON.parse(readFileSync(ROOM_FILE, 'utf-8'));
    return data.code ?? null;
  }

  setCurrentRoom(code: string): void {
    writeFileSync(ROOM_FILE, JSON.stringify({ code }, null, 2));
  }

  clearCurrentRoom(): void {
    if (existsSync(ROOM_FILE)) {
      writeFileSync(ROOM_FILE, '{}');
    }
  }
}
