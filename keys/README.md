# 仓库公钥（当前：无）

> 状态：未引入签名密钥（A 方案）。本目录目前为空是**预期状态**，不是缺失。

- 所有 `index.json` 条目均视为**未验证**：客户端安装/更新时标记未验证并要求二次确认
 （见主仓 `SourceInstaller.plan/confirm` 的 `signatureMissing` 分支）。
- 引入签名的前置条件（Q-ware3）：维护者密钥保管方式经 M7 安全评审确定后，
  在此目录发布当前公钥（`current.ed25519.pub`，hex）与轮换历史（`revoked/`），
  届时 `signatures/` 下的 `.sig` 文件才会被客户端验签。
- 在此之前：不要接受任何自称“官方签名”的 `.sig` 文件进库。
