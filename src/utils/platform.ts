/**
 * 达梦数据库 CLI 工具 - 平台检测工具
 *
 * 提供操作系统、Shell 环境和达梦驱动路径的检测能力。
 * 用于跨平台路径解析、配置目录定位和原生模块加载。
 */

import os from 'os';
import path from 'path';
import fs from 'fs';

/** 平台类型 */
export type Platform = 'win32' | 'darwin' | 'linux';

/**
 * 获取当前操作系统平台
 */
export function getPlatform(): Platform {
  const platform = os.platform();
  if (platform === 'win32' || platform === 'darwin' || platform === 'linux') {
    return platform;
  }
  // 回退到 linux（大多数类 UNIX 系统行为一致）
  return 'linux';
}

/**
 * 是否为 Windows 系统
 */
export function isWindows(): boolean {
  return os.platform() === 'win32';
}

/**
 * 是否为 macOS 系统
 */
export function isMacOS(): boolean {
  return os.platform() === 'darwin';
}

/**
 * 是否为 Linux 系统
 */
export function isLinux(): boolean {
  return os.platform() === 'linux';
}

/**
 * 获取用户主目录
 */
export function getHomeDir(): string {
  return os.homedir();
}

/**
 * 获取 XDG 配置目录
 *
 * - Windows: %APPDATA% 或 ~/AppData/Roaming
 * - macOS/Linux: $XDG_CONFIG_HOME 或 ~/.config
 */
export function getConfigDir(): string {
  if (isWindows()) {
    return process.env.APPDATA || path.join(getHomeDir(), 'AppData', 'Roaming');
  }
  return process.env.XDG_CONFIG_HOME || path.join(getHomeDir(), '.config');
}

/**
 * 获取 dmcli 配置目录
 */
export function getDmcliConfigDir(): string {
  return path.join(getConfigDir(), 'dmcli');
}

/**
 * 获取 dmcli 配置文件完整路径
 *
 * 优先使用 DMCLI_CONFIG 环境变量，否则使用平台默认位置。
 */
export function getConfigFilePath(): string {
  if (process.env.DMCLI_CONFIG) {
    return process.env.DMCLI_CONFIG;
  }
  return path.join(getDmcliConfigDir(), 'config.yaml');
}

/**
 * 获取历史记录文件路径
 */
export function getHistoryFilePath(): string {
  return path.join(getDmcliConfigDir(), 'history');
}

/**
 * 获取临时目录路径
 */
export function getTempDir(): string {
  return os.tmpdir();
}

/**
 * 确保目录存在，不存在则递归创建
 */
export function ensureDirSync(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * 获取 CPU 核心数（用于连接池默认大小参考）
 */
export function getCpuCount(): number {
  return os.cpus().length;
}

/**
 * 获取系统内存总量（MB）
 */
export function getTotalMemoryMB(): number {
  return Math.floor(os.totalmem() / (1024 * 1024));
}
