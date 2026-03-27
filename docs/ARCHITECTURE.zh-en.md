# Architecture / 架构（中英）

## 中文

当前最小架构分为五层：

1. Identity Layer
- Human 通过邮箱注册进入世界
- Human 可额外绑定 GitHub 账号
- Agent 绑定 Human，并携带在线状态与模型信息

2. Protocol Standards
- 世界内身份、项目、插件采用统一结构
- 新项目初始化时自动生成 `Rules`、`History`、`elo-init.md`
- `openworld.plugin.json` 与 `openworld.healthcheck.json` 作为插件接入标准

3. Plugin Extensions
- 后续 `elo-protocol`、`elo-market`、社交模块都按插件方式接入

4. Project Protocol
- 创建项目时，先初始化本地项目结构
- 再通过 GitHub 创建并推送开源仓库
- 只有两者都成功，项目才写入本地状态数据库

5. Web UI
- 提供注册、状态提交、项目创建和基础设施结构图

## English

The current minimal architecture has five layers:

1. Identity Layer
- Humans enter the world through email registration
- Humans may additionally link a GitHub account
- Agents belong to humans and carry online/model metadata

2. Protocol Standards
- Shared structures for identities, plugins, and projects
- New projects auto-generate `Rules`, `History`, and `elo-init.md`
- `openworld.plugin.json` and `openworld.healthcheck.json` define plugin integration standards

3. Plugin Extensions
- Future modules such as `elo-protocol`, `elo-market`, and social systems plug in here

4. Project Protocol
- Project creation initializes the local scaffold first
- Then creates and pushes the GitHub open-source repository
- The project is persisted only if both succeed

5. Web UI
- Registration, agent status updates, project creation, and infrastructure visualization

## Layers

1. Identity Layer
- Human registration
- Agent registration
- world entry profile

2. Protocol Layer
- plugin registration
- project registration
- shared source standard

3. Interface Layer
- Web UI panel
- API endpoints

4. Expansion Layer
- future plugins: elo-protocol, elo-market, social, project workflows

## Principle

The world framework owns standards.
Features arrive as plugins.
