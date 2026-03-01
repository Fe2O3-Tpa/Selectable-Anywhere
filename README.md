# 🧩 Selectable Anywhere

**安全優先**で**テキスト選択・コピー制限を解除**するTampermonkey用UserScript

---

## 🎯 概要

Selectable Anywhere は、Webサイト上で禁止されている
- テキスト選択
- コピー
- 右クリック
といった制限を、安全性を重視した方法で解除する UserScript です。

prototype の改変など副作用の大きい手法は使用せず、  
通常サイトで安定動作する設計になっています。

---

## ✨ 特徴

- ✅ 安全優先設計（prototype改変なし）
- ✅ 常時表示 ON/OFF トグルUI
- ✅ 状態はサイト別に保存（GM API使用）
- ✅ 軽量 MutationObserver 監視
- ✅ デバッグログ対応（DEBUGフラグ）

---

## 🚀 インストール方法

1. **Tampermonkey** をインストール  
2. 「新規スクリプト」を作成  
3. 本プロジェクトのコードを貼り付け  
4. `@match` を編集して対象サイトを指定  
5. 保存して有効化  

---

## ⚙ 使い方

### 🟢 有効状態（緑・S表示）

- テキスト選択可能
- コピー可能
- 右クリック可能

### 🔴 無効状態（赤・×表示）

- スクリプトは何もしません

### 🔁 切替方法

- 画面右下の丸いボタンをクリック
- 状態が保存され、自動でページが再読み込みされます

---

## 🎛 UI仕様

| 項目 | 内容 |
|------|------|
| 位置 | 右下固定 |
| サイズ | 40px × 40px |
| 形状 | 円形 |
| 表示 | S（ON） / ×（OFF） |
| z-index | 2147483647 |

---

## 🛡 安全設計ポリシー

このスクリプトは以下を **行いません**：

- ❌ EventTarget.prototype の改変
- ❌ addEventListener の上書き
- ❌ pointer-events の変更
- ❌ Shadow DOM 内部干渉
- ❌ iframe 内部干渉

副作用を最小限に抑えることを最優先としています。

---

## 🧠 技術仕様

### 実行タイミング

```

@run-at document-start

```

### 状態保存

```

GM_setValue / GM_getValue

```

### 対象イベント

- copy
- cut
- contextmenu
- selectstart

### CSS戦略

- `user-select` のみ上書き
- `input / textarea / button` は除外
- pointer-events は変更しない

### MutationObserver

- `style` 属性変更のみ監視
- subtree: true

---

## ❌ 対応していないもの

- DRM保護コンテンツ
- canvas描画テキスト
- Shadow DOM内部制限
- クロスオリジンiframe
- 強固なJavaScript制限サイト

---

## 🧪 動作確認環境

- Chrome 最新版
- Edge 最新版
- Tampermonkey 最新版

---

## 🔮 今後の拡張予定

- UIドラッグ移動機能
- Shadow DOM対応版
- iframe対応版

---

## ⚠ 注意事項

- 一部Webアプリでは挙動が変わる可能性があります
- 重要な操作前には一時的な無効化を推奨します
- サイトの利用規約に違反しない範囲で使用してください

---

## 📄 ライセンス

MIT License

---

## 🧩 プロジェクト方針

Selectable Anywhere は

> 「壊さず、静かに、必要なときだけ解除する」

という思想で設計されています。

安全性と実用性のバランスを重視しています。