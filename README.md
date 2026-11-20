# Node-RED on unkernel

[ブラウザでデモを開く](https://utaani.github.io/unkernel-node-red/)

[unkernel](https://github.com/pithings/unkernel) を使って、[Node-RED](https://github.com/node-red/node-red) をブラウザ内で起動するデモです。GitHub Pages が配信するファイルを読み込むと、空の Node-RED エディターが開きます。Node-RED は閲覧者のブラウザ内で動作し、サーバーをデプロイせず、 Node-RED のお試しが可能です。

## 試し方

1. WebAssembly JSPI に対応するブラウザでデモを開きます。Chromium 156 で動作を確認しています。
2. 起動が終わると、空の「フロー 1」が表示されます。初回の配信量は約 62 MiB で、起動は約 1〜2 分でした。
3. たとえば Inject ノードと Debug ノードをつなぎ、デプロイしてから Inject のボタンを押すと、Debug 欄にメッセージが出ます。

編集内容はそのタブの試用環境に保存されます。ページを再読み込みすると初期状態に戻るので、残したいフローは Node-RED のメニューから JSON にエクスポートしてください。

## カスタムノードと設定

「パレットの管理」から、依存関係を同梱した、または依存関係のない Node-RED ノードの npm パッケージ（`.tgz`）をアップロードできます。ゲストはオフラインで動作し、追加したノードはページの再読み込みで消えます。

同梱した [settings.js](settings.js) ではウェルカムツアーを無効にしています。このファイルの設定を変更する場合は、ゲストイメージの再ビルドが必要です。

## 仕組み

- Web Worker で unkernel を起動し、圧縮した ext4 イメージから Node-RED 5.0.10 と Node.js 24.22.3 を読み込みます。
- 起動ページがゲストの Web Worker を保持し、Node-RED のエディターは同じページ内の iframe で開きます。これにより、ゲストを動かしている親ページを開いたまま、エディターに専用の URL を持たせられます。エディターはその URL を基準に、JavaScript、CSS、フロー API を相対パスで読み込みます。
- Service Worker は `editor/<セッションID>/` 以下の HTTP リクエストを起動元のタブへ渡し、親ページが unkernel の `vm.fetch()` でゲストの Node-RED に届けます。ライブ通知は、ゲスト内の WebSocket から HTTP ポーリングでエディターに届けます。
- このリポジトリのルートは静的サイトの配信物です。ローカルで試す場合は、チェックアウトしたディレクトリで `python3 -m http.server 18883 --bind 127.0.0.1` を実行し、`http://127.0.0.1:18883/` を開きます。GitHub Pages では HTTPS で配信しています。

### HTTP In ノードを試す

ゲスト内の `http://localhost:1880/api/test` は、そのゲストで動く Node-RED を指します。エディターと同じブラウザからは、エディターの URL を基準にした `api/test` を呼ぶと、同じ Service Worker 経由で HTTP In ノードに届きます。たとえば `GET /test` をデプロイした後、デモのトップページの開発者コンソールで次を実行できます。

```js
const editor = document.querySelector('iframe');
const response = await fetch(new URL('api/test', editor.src));
console.log(response.status, await response.text());
```

GitHub Pages のプロジェクト URL 直下にある `/api/test` は静的配信先へのリクエストになります。別端末や外部サービスから Webhook として呼ぶには、外部のリクエストを受け付ける実行環境が必要です。

## 保証について

このデモは無保証で提供します。

## ライセンス

このデモ用に作成したコードのライセンスは検討中です。同梱の第三者ソフトウェアには、それぞれのライセンスが適用されます。

| 配布物 | ライセンスと上流 |
| --- | --- |
| `sdk/` の unkernel JavaScript SDK | MIT。[unkernel の MIT ライセンス](https://github.com/pithings/unkernel/blob/0e4b2ec/LICENSE-MIT) |
| `sdk/unkernel-alpine.wasm` | unkernel の Linux カーネル部分は GPL-2.0-only。Alpine ユーザーランドも同梱。[unkernel の GPL ライセンス](https://github.com/pithings/unkernel/blob/0e4b2ec/LICENSE)・[使用版の上流コミット](https://github.com/pithings/unkernel/tree/0e4b2ec) |
| `node-red.kwsparse.gz` | [Node-RED（Apache-2.0）](https://github.com/node-red/node-red/blob/main/LICENSE)、[Node.js と同梱コンポーネント](https://github.com/nodejs/node/blob/v24.22.3/LICENSE)、Alpine のライブラリ、npm 依存パッケージを収録 |

配布物に含まれる第三者ソフトウェアのライセンス文書・著作権表示・NOTICE、および GPL 対象バイナリの対応ソースの提供方法は確認中です。表の上流リンクは使用したソフトウェアの参照先です。
