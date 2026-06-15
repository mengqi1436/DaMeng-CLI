/**
 * 密码解析器 - 支持多种密码来源
 *
 * 支持的密码格式:
 * - 环境变量引用: ${ENV_VAR}
 * - 密钥环引用: @keyring:alias
 * - 1Password 引用: @1password:vault/item/field
 * - Vault 引用: @vault:mount/path.field
 * - 普通字符串: 直接返回
 * - PasswordSpec 对象: 按 source 字段分发
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { PasswordSpec } from '../types';

export class SecretResolver {
  /**
   * 解析密码（统一入口）
   *
   * @param password - 密码字符串或 PasswordSpec 对象
   * @returns 解析后的明文密码
   */
  async resolve(password: string | PasswordSpec): Promise<string> {
    // 如果是对象格式，按 source 字段分发
    if (typeof password === 'object' && password !== null) {
      return this.resolveFromSpec(password);
    }

    // 如果是字符串，按前缀匹配解析
    if (typeof password === 'string') {
      return this.resolveFromString(password);
    }

    return '';
  }

  /**
   * 从字符串格式解析密码
   */
  private async resolveFromString(password: string): Promise<string> {
    // 环境变量引用: ${ENV_VAR}
    const envMatch = password.match(/^\$\{(.+)\}$/);
    if (envMatch) {
      return this.resolveFromEnv(envMatch[1]);
    }

    // 密钥环引用: @keyring:alias
    if (password.startsWith('@keyring:')) {
      const alias = password.slice(9);
      return this.resolveFromKeyring(alias);
    }

    // 1Password 引用: @1password:vault/item/field
    if (password.startsWith('@1password:')) {
      const spec = password.slice(11);
      const parts = spec.split('/');
      if (parts.length < 2) {
        throw new Error(
          `1Password 引用格式错误: "${password}"。正确格式: @1password:vault/item[/field]`
        );
      }
      const [vault, item, field = 'password'] = parts;
      return this.resolveFrom1Password(vault, item, field);
    }

    // Vault 引用: @vault:mount/path.field
    if (password.startsWith('@vault:')) {
      const spec = password.slice(7);
      const lastDotIndex = spec.lastIndexOf('.');
      if (lastDotIndex === -1) {
        throw new Error(
          `Vault 引用格式错误: "${password}"。正确格式: @vault:mount/path.field`
        );
      }
      const mountAndPath = spec.slice(0, lastDotIndex);
      const field = spec.slice(lastDotIndex + 1);
      const [mount, ...pathParts] = mountAndPath.split('/');
      return this.resolveFromVault(mount, pathParts.join('/'), field);
    }

    // 普通字符串，直接返回
    return password;
  }

  /**
   * 从 PasswordSpec 对象解析密码
   */
  private async resolveFromSpec(spec: PasswordSpec): Promise<string> {
    switch (spec.source) {
      case 'env':
        return this.resolveFromEnv(spec.key || '');

      case 'file':
        return this.resolveFromFile(spec.path || '');

      case 'keyring':
        return this.resolveFromKeyring(spec.alias || '');

      case '1password':
        return this.resolveFrom1Password(
          spec.vault || '',
          spec.item || '',
          spec.field || 'password'
        );

      case 'vault':
        return this.resolveFromVault(
          spec.mount || '',
          spec.path || '',
          spec.field || 'password'
        );

      default:
        throw new Error(`未知的密码来源: ${(spec as PasswordSpec).source}`);
    }
  }

  /**
   * 从环境变量读取密码
   */
  private resolveFromEnv(envKey: string): string {
    const value = process.env[envKey];
    if (!value) {
      throw new Error(`环境变量 ${envKey} 未设置`);
    }
    return value;
  }

  /**
   * 从文件读取密码
   */
  private resolveFromFile(filePath: string): string {
    if (!filePath) {
      throw new Error('密码文件路径未指定');
    }

    // 支持 ~ 展开
    const resolvedPath = filePath.replace(/^~/, os.homedir());
    const absolutePath = path.resolve(resolvedPath);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`密码文件不存在: ${absolutePath}`);
    }

    // 读取文件并去除首尾空白
    const content = fs.readFileSync(absolutePath, 'utf8').trim();

    if (!content) {
      throw new Error(`密码文件为空: ${absolutePath}`);
    }

    return content;
  }

  /**
   * 从系统密钥环读取密码
   *
   * 需要安装 keytar 库才能使用此功能
   */
  private async resolveFromKeyring(alias: string): Promise<string> {
    if (!alias) {
      throw new Error('密钥环别名未指定');
    }

    try {
      // 尝试动态导入 keytar
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const keytar = require('keytar');
      const password = await keytar.getPassword('dmcli', alias);
      if (!password) {
        throw new Error(`密钥环中未找到别名 "${alias}" 对应的密码`);
      }
      return password;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.includes('密钥环中未找到')) {
        throw error;
      }
      throw new Error(
        `密钥环功能不可用，请安装 keytar 库: npm install keytar。` +
        `原始错误: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 从 1Password CLI 读取密码
   *
   * 需要安装并登录 1Password CLI (op)
   */
  private async resolveFrom1Password(
    vault: string,
    item: string,
    field: string
  ): Promise<string> {
    if (!vault || !item) {
      throw new Error('1Password 引用需要指定 vault 和 item');
    }

    const { execSync } = require('child_process');

    try {
      const result = execSync(
        `op item get "${item}" --vault "${vault}" --fields "${field}" --format json`,
        {
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }
      );

      const parsed = JSON.parse(result);
      return parsed.value || parsed;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('not signed in')) {
        throw new Error('1Password CLI 未登录，请先执行 "op signin"');
      }
      throw new Error(`1Password 读取失败: ${message}`);
    }
  }

  /**
   * 从 HashiCorp Vault 读取密码
   *
   * 需要设置 VAULT_ADDR 和 VAULT_TOKEN 环境变量
   */
  private async resolveFromVault(
    mount: string,
    secretPath: string,
    field: string
  ): Promise<string> {
    if (!mount || !secretPath) {
      throw new Error('Vault 引用需要指定 mount 和 path');
    }

    const vaultAddr = process.env.VAULT_ADDR;
    const vaultToken = process.env.VAULT_TOKEN;

    if (!vaultAddr || !vaultToken) {
      throw new Error(
        'Vault 集成需要设置 VAULT_ADDR 和 VAULT_TOKEN 环境变量'
      );
    }

    const url = `${vaultAddr}/v1/${mount}/data/${secretPath}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'X-Vault-Token': vaultToken,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error('Vault 认证失败，请检查 VAULT_TOKEN');
        }
        if (response.status === 404) {
          throw new Error(`Vault 密钥不存在: ${mount}/${secretPath}`);
        }
        throw new Error(`Vault 请求失败: ${response.status} ${response.statusText}`);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await response.json();

      // KV v2 格式: data.data[field]
      const secret = data?.data?.data?.[field];
      if (secret === undefined) {
        throw new Error(
          `Vault 密钥 "${mount}/${secretPath}" 中未找到字段 "${field}"`
        );
      }

      return secret;
    } catch (error: unknown) {
      if (error instanceof Error && error.message.startsWith('Vault ')) {
        throw error;
      }
      throw new Error(
        `Vault 请求异常: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 保存凭据到密钥环
   */
  async saveCredential(alias: string, user: string, password: string): Promise<void> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const keytar = require('keytar');
      await keytar.setPassword('dmcli', alias, JSON.stringify({ user, password }));
    } catch {
      throw new Error('密钥环功能不可用，请安装 keytar 库: npm install keytar');
    }
  }

  /**
   * 从密钥环读取凭据
   */
  async getCredential(alias: string): Promise<{ user: string; password: string } | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const keytar = require('keytar');
      const data = await keytar.getPassword('dmcli', alias);
      if (!data) {
        return null;
      }
      return JSON.parse(data);
    } catch {
      throw new Error('密钥环功能不可用，请安装 keytar 库: npm install keytar');
    }
  }
}
