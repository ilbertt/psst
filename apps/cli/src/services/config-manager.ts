import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CONFIG_DIR = join(homedir(), '.config', 'psst');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

export interface ConfigData {
  serverUrl: string;
  name: string;
}

export type ConfigKey = keyof ConfigData;

const DEFAULTS: ConfigData = {
  serverUrl: 'http://localhost:3000',
  name: 'Anonymous',
};

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

  get needsName(): boolean {
    return this.data.name === DEFAULTS.name;
  }

  get all(): Readonly<ConfigData> {
    return this.data;
  }

  update(partial: Partial<ConfigData>): void {
    Object.assign(this.data, partial);
    writeFileSync(CONFIG_FILE, JSON.stringify(this.data, null, 2));
  }
}
