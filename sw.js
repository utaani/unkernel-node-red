const prefix = new URL('editor/', self.registration.scope).pathname;
const owners = new Map();
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  if (!event.data?.instance || !event.ports[0]) return;
  owners.set(event.data.instance, event.source.id);
  event.ports[0].postMessage('ready');
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin === self.location.origin && url.pathname.startsWith(prefix)) {
    event.respondWith(proxy(event.request, url));
  }
});
async function proxy(request, url) {
  try {
    const [instance, ...parts] = url.pathname.slice(prefix.length).split('/');
    const client = await self.clients.get(owners.get(instance));
    if (!client) return new Response('Node-RED session ended. Reload the demo.', { status: 503 });
    const channel = new MessageChannel();
    const body = request.body ? await request.arrayBuffer() : undefined;
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        channel.port1.close();
        reject(new Error('Guest request timed out'));
      }, 30000);
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
