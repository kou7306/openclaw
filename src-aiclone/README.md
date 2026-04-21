# src-aiclone/ 雛形

fork 先の openclaw リポジトリ直下にコピーして使う「上乗せ層」のスケルトン。
upstream のコードを直接編集せず、ここに独自実装を閉じ込める。

## 使い方（fork 後）

```bash
# ai-clone (openclaw fork) リポジトリ直下で
cp -R /Users/kouta/Documents/ai-clone-doc/reference/src-aiclone ./src-aiclone
```

その後 `pnpm-workspace.yaml` や `tsconfig.projects.json` に `src-aiclone` を追加する（方法は upstream のビルド設定を読んでから決める）。

## ディレクトリ

```
src-aiclone/
├── context-engine/       # 独自 Context Engine（persona/working 注入 + recall ツール）
├── memory/               # ai_* テーブルの DDL・recall・short_memory 生成
├── embedding/            # BGE-M3 MemoryEmbeddingProviderAdapter
├── heartbeat/            # 定期観察・気づき生成・抑制
├── dreaming/             # upstream dreaming フック（fact 生成）
├── ingestion/            # UI ドロップ受け口
└── ipc/                  # UI ↔ daemon 用 JSON-RPC スキーマ（必要なら）
```

## TODO マーカー

`// NOTE(upstream):` は fork 後に upstream の実インポートパスに差し替える箇所。
`// NOTE(impl):` は中身をこれから書く箇所。
