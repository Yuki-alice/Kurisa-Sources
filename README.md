# Kurisa 独立源仓库

> 与主仓分离。主仓零预置（C1）；本仓库只收干净实现的新源（看行为重写，不准抄代码，GPL 脚本禁入）。
> 规范见主仓 docs/source-warehouse-DRAFT.md；写源看 docs/venera-to-kurisa-migration-DRAFT.md。

## 布局

- index.json：源索引（空数组起步）。
- scripts：<key>.js（一源一文件；仅 _template 模板与日后合入的新源）。
- signatures：<key>.sig（ed25519 分离签名）。
- keys：当前公钥与轮换历史。

## 发布

- PR 加源或升版 → CI（d.ts 校验、静态扫描、矩阵）全绿 → 维护者签名 → 更新 index.json。
- 模板文件（_template 开头）不计入索引，仅供作者复制起步。
