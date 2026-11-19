# Node-RED on unkernel

[ブラウザでデモを開く](https://utaani.github.io/unkernel-node-red/)

unkernel を使って、Alpine Linux（riscv64）と Node-RED をブラウザ内で起動するデモです。GitHub Pages が配信するファイルを読み込むと、空の Node-RED エディターが開きます。Node-RED は閲覧者の端末で動作し、SSH や Node.js のインストールは不要です。

## 試し方

1. WebAssembly JSPI に対応するブラウザでデモを開きます。Chromium 156 で動作を確認しています。
2. 起動が終わると、空の「フロー 1」が表示されます。初回の配信量は約 62 MiB で、Pi 5 での起動は約 1〜2 分でした。
3. たとえば Inject ノードと Debug ノードをつなぎ、デプロイしてから Inject のボタンを押すと、Debug 欄にメッセージが出ます。

編集内容はそのタブの試用環境に保存されます。ページを再読み込みすると初期状態に戻るので、残したいフローは Node-RED のメニューから JSON にエクスポートしてください。

## 仕組み

- Web Worker で unkernel を起動し、圧縮した ext4 イメージから Node-RED 5.0.10 と Node.js 24.22.3 を読み込みます。
- Service Worker が同じページ内のエディターからの HTTP リクエストをゲストに渡します。ライブ通知は、ゲスト内の WebSocket から HTTP ポーリングでエディターに届けます。
- このリポジトリのルートは静的サイトの配信物です。ローカルで試す場合は、チェックアウトしたディレクトリで `python3 -m http.server 18883 --bind 127.0.0.1` を実行し、`http://127.0.0.1:18883/` を開きます。GitHub Pages では HTTPS で配信しています。

## ライセンス

このデモ用に作成したコードのライセンスは検討中です。同梱の第三者ソフトウェアには、それぞれのライセンスが適用されます。

| 配布物 | ライセンスと上流 |
| --- | --- |
| `sdk/` の unkernel JavaScript SDK | MIT。[unkernel の MIT ライセンス](https://github.com/pithings/unkernel/blob/0e4b2ec/LICENSE-MIT) |
| `sdk/unkernel-alpine.wasm` | unkernel の Linux カーネル部分は GPL-2.0-only。Alpine ユーザーランドも同梱。[unkernel の GPL ライセンス](https://github.com/pithings/unkernel/blob/0e4b2ec/LICENSE)・[使用版の上流コミット](https://github.com/pithings/unkernel/tree/0e4b2ec) |
| `node-red.kwsparse.gz` | [Node-RED（Apache-2.0）](https://github.com/node-red/node-red/blob/main/LICENSE)、[Node.js と同梱コンポーネント](https://github.com/nodejs/node/blob/v24.22.3/LICENSE)、Alpine のライブラリ、npm 依存パッケージを収録 |

配布物に含まれる第三者ソフトウェアのライセンス文書・著作権表示・NOTICE、および GPL 対象バイナリの対応ソースの提供方法は確認中です。表の上流リンクは使用したソフトウェアの参照先です。
