# 分离签名（当前：无）

> 状态：未引入签名密钥（A 方案），本目录目前为空是**预期状态**。

- 签名消息体（与主仓 `SourceSignature.signedMessage` 一致）：
  `key|version|sha256` 的 UTF-8 字节，ed25519 签名，文件名为 `<key>.sig`（hex 编码）。
- 有 `.sig` 且 `keys/` 有对应公钥时，客户端按 `SourceInstaller.plan/confirm` 验签；
  签名失败 → 拒绝并保留旧版本。
- 无 `.sig` 的条目：客户端标记未验证并要求二次确认后方可安装/更新。
- 在 Q-ware3 落定前：不要合入任何 `.sig` 文件。
