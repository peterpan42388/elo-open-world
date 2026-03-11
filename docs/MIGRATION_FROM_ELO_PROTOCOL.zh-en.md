# Migration from ELO Protocol / 从 ELO Protocol 迁移（中英）

## Chinese

`elo-protocol` 不再承担“整个世界框架”的角色。
之后它适合作为 `ELO Open World` 的一个插件接入。

建议迁移路径：
1. 保持 `elo-protocol` 独立
2. 在本框架中将其注册为 `protocol plugin`
3. 后续让 market/social/project 模块都通过共同插件标准接入

## English

`elo-protocol` should no longer act as the whole world framework.
It should become a plugin inside `ELO Open World`.
