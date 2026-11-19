const prefix = new URL('editor/', self.registration.scope).pathname;
const ownerCache = 'unkernel-editor-owners:' + self.registration.scope;
const ownerKey = instance => new URL('editor/' + encodeURIComponent(instance) + '/', self.registration.scope);
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (!event.data?.instance || !event.ports[0]) return;
  event.waitUntil(registerOwner(event.data.instance, event.source.id, event.ports[0]));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith(prefix)) {
    event.respondWith(proxy(event.request, url));
  }
});
async function registerOwner(instance, clientId, port) {
  try {
    const owners = await caches.open(ownerCache);
    const keys = await owners.keys();
    const live = new Set((await self.clients.matchAll({ type: 'window', includeUncontrolled: true })).map(client => client.id));
    await Promise.all(keys.map(async key => {
      const entry = await owners.match(key);
      if (entry && !live.has(await entry.text())) await owners.delete(key);
    }));
    await owners.put(ownerKey(instance), new Response(clientId));
    port.postMessage('ready');
  } catch (error) {
    port.postMessage({ error: error.message });
  }
}
async function proxy(request, url) {
  try {
    const [instance, ...parts] = url.pathname.slice(prefix.length).split('/');
    const owners = await caches.open(ownerCache);
    const key = ownerKey(instance);
    const entry = await owners.match(key);
    const client = entry && await self.clients.get(await entry.text());
    if (!client) {
      if (entry) await owners.delete(key);
      return new Response('Node-RED session ended. Reload the demo.', { status: 503 });
    }
    const channel = new MessageChannel();
    const body = request.body ? await request.arrayBuffer() : undefined;
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        channel.port1.close();
        reject(new Error('Guest request timed out'));
      }, request.method === "POST" && parts.join("/") === "nodes" ? 120000 : 30000);
      channel.port1.onmessage = ({ data }) => {
        clearTimeout(timer);
        channel.port1.close();
        resolve(data);
      };
      client.postMessage({
        instance, path: '/' + parts.join('/') + url.search,
        method: request.method, headers: [...request.headers], body,
      }, [channel.port2, ...(body ? [body] : [])]);
    });
    if (result.error) throw new Error(result.error);
    const headers = new Headers(result.headers);
    for (const name of ['content-length', 'transfer-encoding', 'connection', 'content-encoding']) headers.delete(name);
    let payload = result.body;
    if (parts.join('/') === '' && headers.get('content-type')?.includes('text/html')) {
      payload = new TextDecoder().decode(payload).replace(/<head[^>]*>/i, match =>
        match + '<script src="../../comms.js"></script>');
    }
    const noBody = request.method === 'HEAD' || [204, 205, 304].includes(result.status);
    return new Response(noBody ? null : payload, { status: result.status, headers });
  } catch (error) {
    return new Response(error.message, { status: 502 });
  }
}
