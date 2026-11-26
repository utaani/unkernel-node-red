export function enableTerminal(vm, localize) {
  const button = document.querySelector('#open-terminal');
  const dialog = document.querySelector('#terminal-dialog');
  const screen = document.querySelector('#terminal-screen');
  let active;

  button.disabled = false;
  vm.exited.then(() => { button.disabled = true; });
  dialog.addEventListener('close', () => {
    active?.dispose();
    active = undefined;
    button.focus();
  });

  button.addEventListener('click', async () => {
    if (dialog.open) return;
    let pty;
    let terminal;
    let observer;
    const session = {
      dispose() {
        observer?.disconnect();
        terminal?.dispose();
        pty?.close().catch(console.error);
        screen.replaceChildren();
      },
    };
    active = session;
    const isOpen = () => active === session && dialog.open;
    const showError = error => {
      if (isOpen()) {
        const message = localize('シェルを利用できません。', 'Shell unavailable. ') + error.message;
        if (terminal) terminal.writeln('\r\n' + message);
        else screen.textContent = message;
      }
    };

    screen.textContent = localize('シェルを起動しています…', 'Opening the shell…');
    dialog.showModal();
    try {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import('./xterm.mjs'),
        import('./addon-fit.mjs'),
      ]);
      if (!isOpen()) return;
      screen.replaceChildren();
      terminal = new Terminal({ cursorBlink: true });
      const fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(screen);
      fit.fit();
      pty = await vm.spawn('/bin/sh', ['-l'], { cols: terminal.cols, rows: terminal.rows });
      if (!isOpen()) {
        await pty.close();
        return;
      }

      terminal.onData(data => pty.write(data).catch(showError));
      terminal.onResize(({ cols, rows }) => pty.resize(cols, rows));
      fit.fit();
      pty.resize(terminal.cols, terminal.rows);
      observer = new ResizeObserver(() => fit.fit());
      observer.observe(screen);
      terminal.focus();

      const ended = pty.ended.catch(showError);
      await pty.output.pipeTo(new WritableStream({
        write(bytes) {
          if (isOpen()) return new Promise(resolve => terminal.write(bytes, resolve));
        },
      }));
      await ended;
      if (isOpen()) terminal.writeln('\r\n' + localize('シェルを終了しました。', 'Shell exited.'));
    } catch (error) {
      showError(error);
    }
  });
}
