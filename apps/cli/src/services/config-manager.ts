import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.config', 'psst');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const ROOM_FILE = join(CONFIG_DIR, 'room.json');

export interface ConfigData {
  serverUrl: string;
  name: string;
}

interface RoomData {
  code: string;
  peerId: string;
}

const DEFAULTS: ConfigData = {
  serverUrl: 'http://localhost:3000',
  name: 'Anonymous',
};

export type ConfigKey = keyof ConfigData;

export class ConfigManager {
  static readonly validKeys: ConfigKey[] = Object.keys(DEFAULTS) as ConfigKey[];

  static isValidKey(key: string): key is ConfigKey {
    return (ConfigManager.validKeys as string[]).includes(key);
  }

  private data: ConfigData;

  constructor() {
    mkdirSync(CONFIG_DIR, { recursive: true });
    const stored = existsSync(CONFIG_FILE) ? JSON.parse(readFileSync(CONFIG_FILE, 'utf-8')) : {};
    this.data = { ...DEFAULTS, ...stored };
  }

  get serverUrl(): string {
    return this.data.serverUrl;
  }

  get name(): string {
    return this.data.name;
  }

  update(partial: Partial<ConfigData>): void {
    Object.assign(this.data, partial);
    writeFileSync(CONFIG_FILE, JSON.stringify(this.data, null, 2));
  }

  getCurrentRoom(): RoomData | null {
    if (!existsSync(ROOM_FILE)) {
      return null;
    }
    const data = JSON.parse(readFileSync(ROOM_FILE, 'utf-8'));
    if (!data.code || !data.peerId) {
      return null;
    }
    return data as RoomData;
  }

  setCurrentRoom({ code, peerId }: RoomData): void {
    writeFileSync(ROOM_FILE, JSON.stringify({ code, peerId }, null, 2));
  }

  clearCurrentRoom(): void {
    if (existsSync(ROOM_FILE)) {
      writeFileSync(ROOM_FILE, '{}');
    }
  }
}
