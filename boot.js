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
  const registration = await navigator.serviceWorker.register('./sw.js');
  await navigator.serviceWorker.ready;
  const image = await fetch('./node-red.kwsparse.gz');
  if (!image.ok) throw new Error('イメージを取得できませんでした。HTTP ' + image.status);
  const disk = { kind: 'data', name: 'unkernel-node-red-demo', mode: 'snapshot',
    template: new Uint8Array(await image.arrayBuffer()) };
  status.textContent = 'Alpine と Node-RED を起動しています…';
  const decoder = new TextDecoder();
  let output = '';
  vm = await createKernel({
    disks: [disk], memoryMiB: 768, worker: true, shared: false,
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
  vm.write('sh /data/start-guest\n');
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
