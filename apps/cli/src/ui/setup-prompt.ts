import { BoxRenderable, createCliRenderer, InputRenderable, TextRenderable } from '@opentui/core';

export async function promptForName(): Promise<string | null> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    screenMode: 'alternate-screen',
  });

  return new Promise<string | null>((resolve) => {
    const container = new BoxRenderable(renderer, {
      id: 'container',
      width: '100%',
      height: '100%',
      backgroundColor: '#1a1a2e',
    });

    const title = new TextRenderable(renderer, {
      id: 'title',
      content: '  Welcome to psst! What should we call you?',
      width: '100%',
      height: 2,
      fg: '#e0e0e0',
    });

    const input = new InputRenderable(renderer, {
      id: 'name-input',
      width: '80%',
      placeholder: 'Your name...',
      maxLength: 50,
    });

    const hint = new TextRenderable(renderer, {
      id: 'hint',
      content: '  ⏎ confirm  Ctrl+C quit',
      width: '100%',
      height: 1,
      fg: '#666666',
    });

    container.add(title);
    container.add(input);
    container.add(hint);
    renderer.root.add(container);
    input.focus();

    input.on('enter', (value: string) => {
      const trimmed = value.trim();
      if (trimmed.length > 0) {
        renderer.destroy();
        resolve(trimmed);
      }
    });

    renderer.keyInput.on('keypress', (key) => {
      if (key.ctrl && key.name === 'c') {
        renderer.destroy();
        resolve(null);
      }
    });

    renderer.start();
  });
}
