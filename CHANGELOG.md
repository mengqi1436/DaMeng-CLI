# 更新日志

本文档记录达梦数据库 CLI 项目的所有重要更改。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)，
并且本项目遵循 [语义化版本控制](https://semver.org/lang/zh-CN/)。

## [1.0.0] - 2026-06-15

### 新增
- 创建项目基础结构
- 完成核心文档编写
  - 达梦数据库技术文档
  - 达梦数据库 API 参考
  - SQL 语法兼容性对比
  - 项目结构说明
- 添加各语言代码示例
  - Java JDBC 连接示例
  - Python dmPython 连接示例
  - Go 连接示例
  - .NET 连接示例
  - Node.js 连接示例
  - C/C++ ODBC 连接示例
- 创建连接测试脚本
  - Linux Bash 脚本
  - Windows 批处理脚本
- 添加配置文件模板
  - 连接字符串配置
  - Java properties 配置
  - YAML 配置
- 创建项目文档
  - README.md
  - PROJECT_SUMMARY.md
  - CHANGELOG.md
  - LICENSE
  - .gitignore

### 文档内容
- 官方文档链接
- 各编程语言驱动信息
- 连接字符串格式示例
- 关键 API 函数或方法列表
- 与其他数据库的兼容性对比
- 命令行工具使用说明
- 数据类型映射
- 连接池配置

### 支持的编程语言
- Java (JDBC)
- Python (dmPython)
- Go (database/sql)
- .NET (DmProvider)
- Node.js (dmdb)
- C/C++ (ODBC)

### 兼容性支持
- Oracle 兼容模式
- MySQL 兼容模式
- DM 默认模式

## [未发布]

### 计划
- 添加更多代码示例
- 完善错误处理示例
- 添加性能优化指南
- 添加迁移指南
- 添加故障排除指南

---

## 版本说明

### 版本格式
- 主版本号：不兼容的 API 修改
- 次版本号：向下兼容的功能性新增
- 修订号：向下兼容的问题修正

### 更改类型
- **新增**：新功能
- **变更**：对现有功能的变更
- **弃用**：已经不建议使用，即将移除的功能
- **移除**：已移除的功能
- **修复**：问题修复
- **安全**：安全相关的更改

---

## 贡献指南

欢迎提交 Issue 和 Pull Request 来改进本项目。

### 提交更改
1. Fork 项目
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 创建 Pull Request

### 更新日志
在提交更改时，请在 CHANGELOG.md 中添加相应的条目。

---

**最后更新**: 2026年6月15日
