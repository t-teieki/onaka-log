// 開発用: 実機（iPhone）から WSL のローカルのバックエンドへつなぐための中継
// WSL の mirrored モードでは、LAN から WSL の :8000 に直接届かない（Windows からの 127.0.0.1 は届く）。
// Windows の Node（Metro と同じく LAN から届く）で 0.0.0.0:<LISTEN> を待ち受け、127.0.0.1:<TARGET> へ流す。
// 使い方: npm run api:relay（既定 8010 → 8000）。アプリの接続先は .env.local の EXPO_PUBLIC_API_BASE_URL=http://<PC の LAN の IP>:8010
import net from 'node:net';
import os from 'node:os';

const listenPort = Number(process.argv[2] ?? 8010);
const targetPort = Number(process.argv[3] ?? 8000);

net
  .createServer((client) => {
    const upstream = net.connect(targetPort, '127.0.0.1');
    client.pipe(upstream).pipe(client);
    client.on('error', () => upstream.destroy());
    upstream.on('error', () => client.destroy());
  })
  .listen(listenPort, '0.0.0.0', () => {
    const lan = Object.values(os.networkInterfaces())
      .flat()
      .filter((a) => a && a.family === 'IPv4' && !a.internal)
      .map((a) => `http://${a.address}:${listenPort}`);
    console.log(`中継: 0.0.0.0:${listenPort} → 127.0.0.1:${targetPort}`);
    console.log(`アプリの接続先の候補: ${lan.join(' / ')}`);
  });
