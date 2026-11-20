import { createKernel } from './sdk/web.mjs';

const status = document.querySelector('#status');
const instance = crypto.randomUUID();
let vm;

navigator.serviceWorker.addEventListener('message', async ({ data, ports }) => {
  if (data.instance !== instance || !ports[0]) return;
  const port = ports[0];
  try {
    const bridge = data.path.startsWith('/_comms/');
    const path = bridge ? data.path.slice('/_comms'.length) : data.path;
    const response = await vm.fetch('http://127.0.0.1:' + (bridge ? 1881 : 1880) + path, {
      method: data.method,
      headers: data.headers,
      body: data.body,
    });
    const body = await response.arrayBuffer();
    port.postMessage({ status: response.status, headers: [...response.headers], body }, [body]);
  } catch (error) {
    port.postMessage({ error: error.message });
  }
});

async function boot() {
  const relay = new URLSearchParams(location.search).get('wisp');
  let net;
  if (relay) {
    const endpoint = new URL(relay);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
    if (endpoint.username || endpoint.password ||
        (endpoint.protocol !== 'wss:' && !(local && endpoint.protocol === 'ws:'))) {
      throw new Error('Wisp の URL には wss:// を使ってください。');
    }
    net = { kind: 'net', backend: { kind: 'wisp', servers: endpoint.href } };
  }
  const registration = await navigator.serviceWorker.register('./sw.js');
  await navigator.serviceWorker.ready;
  async function loadDisk(file, name) {
    const image = await fetch(file);
    if (!image.ok) throw new Error(file + ' を取得できませんでした。HTTP ' + image.status);
    return { kind: 'data', name, mode: 'snapshot',
      template: new Uint8Array(await image.arrayBuffer()) };
  }
  const [alpine, disk] = await Promise.all([
    fetch('./alpine.erofs'),
    loadDisk('./node-red.kwsparse.gz', 'node-red-aarch64-data'),
  ]);
  if (!alpine.ok) throw new Error('Alpine を取得できませんでした。HTTP ' + alpine.status);
  const distro = { kind: 'http', url: URL.createObjectURL(await alpine.blob()) };
  status.textContent = 'Alpine と Node-RED を起動しています…';
  const decoder = new TextDecoder();
  let output = '';
  vm = await createKernel({
    distro, disks: [disk], memoryMiB: 768, worker: true, shared: false, cpus: 1, net,
    onOutput(bytes) {
      output = (output + decoder.decode(bytes, { stream: true })).slice(-4000);
    },
  });
  globalThis.demoBootLog = () => output;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(output.slice(-700))), 240000);
    vm.onOutput(() => {
      if (output.includes('NODE_RED_DEMO_READY')) {
        clearTimeout(timer);
        resolve();
      }
    });
    vm.exited.then(result => {
      clearTimeout(timer);
      reject(new Error(result.kind + ' ' + output.slice(-700)));
    });
  });
  vm.write(net ? 'npm_config_offline=false sh /data/start-guest\n' : 'sh /data/start-guest\n');
  await ready;
  const channel = new MessageChannel();
  const registered = new Promise(resolve => { channel.port1.onmessage = resolve; });
  registration.active.postMessage({ instance }, [channel.port2]);
  const { data: registrationResult } = await registered;
  channel.port1.close();
  if (registrationResult?.error) throw new Error(registrationResult.error);
  const editor = document.createElement('iframe');
  editor.title = 'Node-RED エディター';
  editor.src = './editor/' + instance + '/';
  status.textContent = 'Node-RED';
  document.body.append(editor);
}

boot().catch(error => {
  status.textContent = '起動できませんでした。' + error.message;
  console.error(error);
});
