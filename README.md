# 达梦数据库 CLI 工具集

[English](README.md) | [中文](README_CN.md)

## 项目简介

本项目提供达梦数据库（Dameng Database）的命令行工具、开发文档和代码示例，帮助开发者快速上手达梦数据库开发。

## 主要内容

### 📚 技术文档

- **[达梦数据库技术文档.md](达梦数据库技术文档.md)** - 完整技术文档，包含连接方式、API、兼容性等
- **[达梦数据库API参考.md](达梦数据库API参考.md)** - API 快速参考手册
- **[SQL语法兼容性对比](docs/sql_compatibility.md)** - 与 Oracle、MySQL、PostgreSQL 的兼容性对比
- **[连接字符串配置](config/connection_strings.md)** - 各语言连接字符串配置示例

### 💻 代码示例

| 语言 | 文件 | 说明 |
|------|------|------|
| Java | [examples/java/DMConnectionExample.java](examples/java/DMConnectionExample.java) | JDBC 连接示例 |
| Python | [examples/python/dm_connection_example.py](examples/python/dm_connection_example.py) | dmPython 连接示例 |
| Go | [examples/go/dm_connection_example.go](examples/go/dm_connection_example.go) | Go 连接示例 |
| .NET | [examples/dotnet/DMConnectionExample.cs](examples/dotnet/DMConnectionExample.cs) | .NET 连接示例 |
| Node.js | [examples/nodejs/dm_connection_example.js](examples/nodejs/dm_connection_example.js) | Node.js 连接示例 |
| C/C++ | [examples/c/dm_odbc_example.c](examples/c/dm_odbc_example.c) | ODBC 连接示例 |

## 快速开始

### 1. 安装达梦数据库

从达梦官网下载并安装数据库:
- 官网: https://www.dameng.com
- 下载中心: https://www.dameng.com/download/index.html

### 2. 配置环境变量

```bash
# Linux
export DM_HOME=/opt/dmdbms
export PATH=$PATH:$DM_HOME/bin

# Windows
set DM_HOME=C:\dmdbms
set PATH=%PATH%;%DM_HOME%\bin
```

### 3. 启动数据库服务

```bash
# Linux
systemctl start DmServiceDMSERVER

# Windows
net start DmServiceDMSERVER
```

### 4. 测试连接

```bash
# 使用 disql 命令行工具
disql SYSDBA/SYSDBA@localhost:5236
```

### 5. 运行示例代码

选择对应语言的示例代码，修改连接参数后运行:

```bash
# Java 示例
javac -cp .:DmJdbcDriver18.jar examples/java/DMConnectionExample.java
java -cp .:DmJdbcDriver18.jar DMConnectionExample

# Python 示例
python examples/python/dm_connection_example.py

# Go 示例
cd examples/go
go run dm_connection_example.go

# .NET 示例
cd examples/dotnet
dotnet run

# Node.js 示例
cd examples/nodejs
npm install dmdb
node dm_connection_example.js
```

## 连接字符串格式

### JDBC
```
jdbc:dm://localhost:5236
jdbc:dm://192.168.1.100:5236/DAMENG
```

### Python dmPython
```python
dmPython.connect(user='SYSDBA', password='SYSDBA', server='localhost', port=5236)
```

### Go
```
dm://SYSDBA:SYSDBA@localhost:5236/SYSDBA
```

### .NET
```
Server=localhost;Port=5236;User Id=SYSDBA;Password=SYSDBA;
```

### Node.js
```javascript
{ connectString: 'localhost:5236', user: 'SYSDBA', password: 'SYSDBA' }
```

## 默认配置

| 配置项 | 值 |
|--------|-----|
| 默认端口 | 5236 |
| 默认管理员 | SYSDBA |
| 默认密码 | SYSDBA |
| 驱动类名 | dm.jdbc.driver.DmDriver |

## 各语言驱动

| 语言 | 驱动/包名 | 安装方式 |
|------|----------|---------|
| Java | com.dameng:DmJdbcDriver18 | Maven |
| Python | dmPython | 源码编译 |
| Go | gitee.com/chunanyong/dm | go get |
| .NET | DmProvider | NuGet |
| Node.js | dmdb | npm |
| C/C++ | ODBC 驱动 | 系统安装 |

## SQL 兼容性

达梦数据库支持多种兼容模式:

| 兼容模式 | 参数值 | 说明 |
|---------|--------|------|
| DM 默认模式 | 0 | 达梦原生语法 |
| Oracle 兼容模式 | 1/2 | 兼容 Oracle SQL 语法 |
| MySQL 兼容模式 | 3 | 兼容 MySQL SQL 语法 |

配置方式:
```ini
# dm.ini
COMPATIBLE_MODE = 2  # Oracle 兼容模式
```

## 命令行工具 (disql)

### 基本连接
```bash
disql SYSDBA/SYSDBA@localhost:5236
```

### 常用命令
```sql
DESC table_name;           -- 查看表结构
SET LINESIZE 200;          -- 设置行宽
SET PAGESIZE 100;          -- 设置每页行数
SPOOL file.txt;            -- 输出到文件
@script.sql;               -- 执行脚本
EXIT;                      -- 退出
```

## 常见问题

### 1. 连接失败

- 检查数据库服务是否启动
- 确认端口号是否正确 (默认 5236)
- 检查防火墙设置
- 验证用户名和密码

### 2. 中文乱码

- JDBC 连接添加参数: `?charset=UTF-8`
- 设置客户端字符集与数据库一致

### 3. 驱动找不到

- 确保驱动在 classpath 中
- 检查驱动版本与数据库版本匹配

## 官方资源

- **达梦官网**: https://www.dameng.com
- **技术文档中心**: https://eco.dameng.com/document/
- **技术社区**: https://eco.dameng.com/community/
- **在线体验**: https://eco.dameng.com/tour/
- **技术支持**: dmtech@dameng.com

## 项目结构

```
D:\MCP\DaMeng-CLI\
├── README.md                          # 项目说明
├── 达梦数据库技术文档.md                # 完整技术文档
├── 达梦数据库API参考.md                 # API 快速参考
├── docs/                              # 文档目录
│   ├── sql_compatibility.md           # SQL 兼容性对比
│   └── project_structure.md           # 项目结构说明
├── config/                            # 配置示例
│   └── connection_strings.md          # 连接字符串配置
└── examples/                          # 代码示例
    ├── java/                          # Java 示例
    ├── python/                        # Python 示例
    ├── go/                            # Go 示例
    ├── dotnet/                        # .NET 示例
    ├── nodejs/                        # Node.js 示例
    └── c/                             # C/C++ 示例
```

## 许可证

本项目采用 MIT 许可证。

## 贡献指南

欢迎提交 Issue 和 Pull Request 来改进本项目。

---

**更新日期**: 2026年6月15日

**注意**: 本文档基于达梦数据库 DM8 版本整理，具体使用时请参考对应版本的官方文档。
