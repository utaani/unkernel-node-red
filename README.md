# Node-RED on unkernel

[日本語版](README-ja.md) 

[Open the demo](https://utaani.github.io/unkernel-node-red/)

<img width="1282" height="929" alt="Node-RED editor running in the browser" src="ss-en.png?raw=true" />

This demo runs [Node-RED](https://github.com/node-red/node-red) in your browser using [unkernel](https://github.com/pithings/unkernel). GitHub Pages serves the files. Your browser boots the Linux guest and opens an empty Node-RED editor, so you can try it without deploying a server.

## Try it

1. Open the demo in a browser that supports WebAssembly JSPI. It was tested with Chromium 156.
2. Wait for the empty **Flow 1** tab to appear. The initial download is about 67.6 MiB. Startup took about one to two minutes on a Raspberry Pi 5.
3. Connect an Inject node to a Debug node, click **Deploy**, and press the Inject button. The message appears in the Debug sidebar.

Your edits live in the current browser session. Reloading the page resets the demo. To keep a flow, export it as JSON from the Node-RED menu before reloading.

## Custom nodes and settings

Use **Manage palette** to upload a Node-RED npm package (`.tgz`) that has no dependencies or bundles them. The guest runs offline, and any nodes you add are lost when you reload the page.

The included [settings.js](settings.js) disables the welcome tour. Changes to this file take effect after the guest image is rebuilt.

## How it works

- A Web Worker runs unkernel `v0.2.0-261126-fd204d3`. The guest uses `alpine.erofs` as its Alpine root filesystem and loads Node-RED 5.0.10 and Node.js 24.22.3 from a compressed ext4 image.
- The main page keeps the guest's Web Worker alive and opens the editor in an iframe. The editor gets its own URL and uses relative paths to load JavaScript, CSS, and the flow API.
- A Service Worker routes HTTP requests under `editor/<session-id>/` back to the tab that started the guest. The page forwards them to Node-RED using unkernel's `vm.fetch()`. The editor receives live updates by polling a bridge to the guest's WebSocket.
- The repository root contains the static site. To try a local checkout, run `python3 -m http.server 18883 --bind 127.0.0.1` from the repository root and open `http://127.0.0.1:18883/`. GitHub Pages serves the demo over HTTPS.

### Try an HTTP In node

Inside the guest, `http://localhost:1880/api/test` points to its own Node-RED instance. From the same browser, a request to `api/test` relative to the editor URL reaches the HTTP In node through the Service Worker. After deploying a flow with an HTTP In node for `GET /test`, run this in the demo page's top-level developer console.

```js
const editor = document.querySelector('iframe');
const response = await fetch(new URL('api/test', editor.src));
console.log(response.status, await response.text());
```

A request to `/api/test` directly under the GitHub Pages project URL goes to the static host. To accept webhook requests from other devices or services, you need a runtime that can accept external requests.

## Current limitations on GitHub Pages

- **Outgoing connections from the HTTP Request node.** The published demo leaves the guest's outbound network unconfigured, so the guest cannot reach the internet.
- **Public APIs and webhooks using HTTP In nodes.** GitHub Pages serves static files and cannot forward outside requests to a guest running in a visitor's browser. You can test the endpoint from the same browser using the example above.
- **Installing custom nodes from the npm registry through Manage palette.** The guest and its npm client run offline. You can upload a `.tgz` file. If it has dependencies, make all direct and transitive dependencies available first or bundle them with the package. When separate offline installs work for those packages, install dependencies before the packages that use them.

## Warranty

This demo is provided without warranty. It is hosted within the [GitHub Pages usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).

## Licenses

The license for this demo's own code is under consideration. Bundled third-party software is subject to its own licenses.

| Distributed file | License and upstream project |
| --- | --- |
| unkernel JavaScript SDK in `sdk/` | MIT. [unkernel MIT license](https://github.com/pithings/unkernel/blob/fd204d3/LICENSE-MIT) |
| `sdk/unkernel.wasm` | The unkernel Linux kernel component is GPL-2.0-only. [unkernel GPL license](https://github.com/pithings/unkernel/blob/fd204d3/LICENSE) · [Upstream revision](https://github.com/pithings/unkernel/tree/fd204d3) |
| `alpine.erofs` | Alpine userspace for AArch64. [Upstream release](https://github.com/pithings/unkernel/releases/tag/v0.2.0-261126-fd204d3) |
| `node-red.kwsparse.gz` | Includes [Node-RED (Apache-2.0)](https://github.com/node-red/node-red/blob/main/LICENSE), [Node.js and bundled components](https://github.com/nodejs/node/blob/v24.22.3/LICENSE), Alpine libraries, and npm dependencies. |

Third-party license texts, copyright notices, NOTICE files, and the way to make corresponding source available for GPL-covered binaries are under review. The links above identify the upstream projects and versions used.
