(() => {
  const NativeWebSocket = window.WebSocket;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  class GuestComms extends EventTarget {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    readyState = 0;
    #path = './_comms/';
    #id;
    #outgoing = Promise.resolve();

    constructor() {
      super();
      this.#listen();
    }
    #emit(event) {
      this.dispatchEvent(event);
      this['on' + event.type]?.(event);
    }
    async #request(path, method, body) {
      const response = await fetch(path, { method, body, cache: 'no-store' });
      if (!response.ok) throw new Error('Guest communication failed: ' + response.status);
      return response.json();
    }
    async #listen() {
      try {
        this.#id = await this.#request(this.#path, 'POST');
        if (this.readyState !== 0) {
          await this.#request(this.#path + this.#id, 'DELETE');
          return;
        }
        this.readyState = 1;
        this.#emit(new Event('open'));
        while (this.readyState === 1) {
          for (const data of await this.#request(this.#path + this.#id, 'GET')) {
            this.#emit(new MessageEvent('message', { data }));
          }
          await wait(250);
        }
      } catch {
        if (this.readyState < 2) {
          this.#emit(new Event('error'));
          this.close();
        }
      }
    }
    send(data) {
      if (this.readyState !== 1) throw new DOMException('WebSocket is closed', 'InvalidStateError');
      this.#outgoing = this.#outgoing.then(() =>
        this.#request(this.#path + this.#id, 'POST', data)
      ).catch(() => this.close());
    }
    close() {
      if (this.readyState >= 2) return;
      this.readyState = 3;
      if (this.#id) this.#request(this.#path + this.#id, 'DELETE').catch(() => {});
      this.#emit(new CloseEvent('close'));
    }
  }
  window.WebSocket = new Proxy(NativeWebSocket, {
    construct(target, args) {
      const url = new URL(args[0], location.href);
      if (url.host === location.host && url.pathname === location.pathname + 'comms') {
        return new GuestComms();
      }
      return Reflect.construct(target, args);
    },
  });
})();
