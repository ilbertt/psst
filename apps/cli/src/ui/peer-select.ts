import {
  BoxRenderable,
  createCliRenderer,
  SelectRenderable,
  SelectRenderableEvents,
  TextRenderable,
} from '@opentui/core';
import type { Peer } from '#types.ts';

export async function showPeerSelect(peers: Peer[]): Promise<Peer | null> {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    screenMode: 'alternate-screen',
  });

  return new Promise<Peer | null>((resolve) => {
    const container = new BoxRenderable(renderer, {
      id: 'container',
      width: '100%',
      height: '100%',
      backgroundColor: '#1a1a2e',
    });

    const title = new TextRenderable(renderer, {
      id: 'title',
      content: '  Who do you want to talk to?',
      width: '100%',
      height: 3,
      fg: '#e0e0e0',
    });

    const select = new SelectRenderable(renderer, {
      id: 'peer-select',
      width: '100%',
      height: '80%',
      options: peers.map((p) => ({
        name: p.name,
        description: 'online',
        value: p.id,
      })),
      backgroundColor: '#1a1a2e',
      textColor: '#a0a0a0',
      selectedBackgroundColor: '#3b82f6',
      selectedTextColor: '#ffffff',
      showDescription: true,
      wrapSelection: true,
    });

    const hint = new TextRenderable(renderer, {
      id: 'hint',
      content: '  ↑/↓ navigate  ⏎ select  Ctrl+C quit',
      width: '100%',
      height: 1,
      fg: '#666666',
    });

    container.add(title);
    container.add(select);
    container.add(hint);
    renderer.root.add(container);
    select.focus();

    select.on(SelectRenderableEvents.ITEM_SELECTED, (index: number) => {
      const peer = peers[index];
      renderer.destroy();
      resolve(peer ?? null);
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
