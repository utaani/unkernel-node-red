import { createKernel } from './sdk/web.mjs';
import { enableTerminal } from './terminal/session.js';

const status = document.querySelector('#status');
const japanese = /^ja(?:-|$)/i.test(navigator.language);
document.documentElement.lang = japanese ? 'ja' : 'en';
const localize = (ja, en) => japanese ? ja : en;
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

async function registerEditorSession(registration) {
  const channel = new MessageChannel();
  const registered = new Promise(resolve => { channel.port1.onmessage = resolve; });
  registration.active.postMessage({ instance }, [channel.port2]);
  const { data: registrationResult } = await registered;
  channel.port1.close();
  if (registrationResult?.error) throw new Error(registrationResult.error);
}

const backupButton = document.querySelector('#backup');
const restoreButton = document.querySelector('#restore');
const restoreFile = document.querySelector('#restore-file');
backupButton.textContent = localize('バックアップ', 'Backup');
restoreButton.textContent = localize('リストア', 'Restore');

async function runArchive(args, input) {
  const result = await vm.exec('/bin/tar', args, { input, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024 });
  if (result.exitCode !== 0) throw new Error(new TextDecoder().decode(result.stderr).trim() || 'tar failed');
  return result.stdout;
}

async function restoreUserData(file) {
  if (!file.size || file.size > 256 * 1024 * 1024) throw new Error('Invalid backup size');
  const bytes = new Uint8Array(await file.arrayBuffer());
  await runArchive(['-xzf', '-', '-C', '/data/user'], bytes);
}

async function boot(backupFile) {
  const relay = new URLSearchParams(location.search).get('wisp');
  let net;
  if (relay) {
    const endpoint = new URL(relay);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname);
    if (endpoint.username || endpoint.password ||
        (endpoint.protocol !== 'wss:' && !(local && endpoint.protocol === 'ws:'))) {
      throw new Error(localize('Wisp の URL には wss:// を使ってください。', 'Use wss:// for the Wisp URL.'));
    }
    net = { kind: 'net', backend: { kind: 'wisp', servers: endpoint.href } };
  }
  const registration = await navigator.serviceWorker.register('./sw.js');
  await navigator.serviceWorker.ready;
  async function loadDisk(file, name) {
    const image = await fetch(file);
    if (!image.ok) throw new Error(localize(file + ' を取得できませんでした。', 'Could not download ' + file + '.') + ' HTTP ' + image.status);
    return { kind: 'data', name, mode: 'snapshot',
      template: new Uint8Array(await image.arrayBuffer()) };
  }
  const [alpine, disk] = await Promise.all([
    fetch('./alpine.erofs'),
    loadDisk('./node-red.kwsparse.gz?v=2', 'node-red-aarch64-data'),
  ]);
  if (!alpine.ok) throw new Error(localize('Alpine を取得できませんでした。', 'Could not download Alpine.') + ' HTTP ' + alpine.status);
  const distro = { kind: 'http', url: URL.createObjectURL(await alpine.blob()) };
  status.textContent = localize('Alpine と Node-RED を起動しています…', 'Starting Alpine and Node-RED…');
  const decoder = new TextDecoder();
  let output = '';
  vm = await createKernel({
    distro, disks: [disk], memoryMiB: 768, worker: true, shared: false, cpus: 1, net,
    onOutput(bytes) {
      output = (output + decoder.decode(bytes, { stream: true })).slice(-4000);
    },
  });
  globalThis.demoBootLog = () => output;
  if (backupFile) await restoreUserData(backupFile);
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
  vm.write(net ? 'npm_config_offline=false npm_config_maxsockets=4 sh /data/start-guest\n' : 'sh /data/start-guest\n');
  await ready;
  await registerEditorSession(registration);
  const editor = document.createElement('iframe');
  editor.title = localize('Node-RED エディター', 'Node-RED editor');
  const editorUrl = './editor/' + instance + '/';
  editor.src = editorUrl;
  status.textContent = 'Node-RED';
  document.body.append(editor);
  enableTerminal(vm, localize);
  backupButton.disabled = false;
  backupButton.addEventListener('click', async () => {
    backupButton.disabled = true;
    try {
      const filename = 'node-red-backup.tar.gz';
      const file = typeof window.showSaveFilePicker === 'function'
        ? await window.showSaveFilePicker({
          suggestedName: filename,
          types: [{ description: 'Node-RED backup', accept: { 'application/gzip': ['.gz', '.tgz'] } }],
        })
        : null;
      const bytes = await runArchive(['-czf', '-', '-C', '/data/user', '.']);
      const archive = new Blob([bytes], { type: 'application/gzip' });
      if (file) {
        await archive.stream().pipeTo(await file.createWritable());
      } else {
        const url = URL.createObjectURL(archive);
        const download = document.createElement('a');
        download.href = url;
        download.download = filename;
        download.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
      status.textContent = 'Node-RED';
    } catch (error) {
      if (error.name !== 'AbortError') {
        status.textContent = localize('バックアップに失敗しました。', 'Backup failed. ') + error.message;
      }
    } finally {
      backupButton.disabled = false;
    }
  });

  const openDashboard = document.querySelector('#open-dashboard');
  openDashboard.disabled = false;
  openDashboard.addEventListener('click', () => {
    window.open(new URL('api/dashboard/', editor.src).href, '_blank', 'noopener');
  });

  const reloadEditor = document.querySelector('#reload-editor');
  reloadEditor.disabled = false;
  reloadEditor.addEventListener('click', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js');
      const registration = await navigator.serviceWorker.ready;
      await registerEditorSession(registration);
      editor.src = editorUrl;
      status.textContent = 'Node-RED';
    } catch (error) {
      status.textContent = localize('エディターを再読み込みできませんでした。', 'Could not reload the editor. ') + error.message;
      console.error(error);
    }
  });
  vm.exited.then(() => {
    openDashboard.disabled = true;
    reloadEditor.disabled = true;
  });
}

function start(file) {
  boot(file).catch(error => {
    status.textContent = localize('起動できませんでした。', 'Startup failed. ') + error.message;
    console.error(error);
  });
}

// Pass the selected archive across a same-tab navigation without putting it in the URL.
async function withRestoreStore(operation) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open('unkernel-node-red-restore:' + location.pathname, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('pending');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction('pending', 'readwrite');
      const result = operation(transaction.objectStore('pending'));
      transaction.oncomplete = () => resolve(result.result);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    db.close();
  }
}

const pageUrl = new URL(location.href);
const restoreId = pageUrl.searchParams.get('restore');
restoreButton.addEventListener('click', () => restoreFile.click());
restoreFile.addEventListener('change', async () => {
  const [file] = restoreFile.files;
  if (!file) return;
  restoreFile.value = '';
  restoreButton.disabled = true;
  try {
    if (file.size < 2 || file.size > 256 * 1024 * 1024) throw new Error('Invalid backup size');
    const header = new Uint8Array(await file.slice(0, 2).arrayBuffer());
    if (header[0] !== 0x1f || header[1] !== 0x8b) throw new Error('Expected a gzip backup');
    const id = crypto.randomUUID();
    await withRestoreStore(store => store.put(file, id));
    const target = new URL(location.href);
    target.searchParams.set('restore', id);
    location.replace(target.href);
  } catch (error) {
    status.textContent = localize('バックアップを開けませんでした。', 'Could not open the backup. ') + error.message;
    restoreButton.disabled = false;
  }
});

if (restoreId && restoreId !== '1') {
  restoreButton.disabled = true;
  withRestoreStore(store => {
    const pending = store.get(restoreId);
    store.delete(restoreId);
    return pending;
  }).then(file => {
    if (!file) throw new Error('Backup file is no longer available');
    pageUrl.searchParams.delete('restore');
    history.replaceState(null, '', pageUrl);
    restoreButton.disabled = false;
    start(file);
  }).catch(error => {
    status.textContent = localize('バックアップを開けませんでした。', 'Could not open the backup. ') + error.message;
    restoreButton.disabled = false;
  });
} else if (restoreId === '1') {
  status.textContent = localize('「リストア」を押してバックアップを選択してください。', 'Click Restore to select your backup.');
} else {
  start();
}
