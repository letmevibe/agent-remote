# agent-remote-cli

Local-first Host Bridge CLI for **[Agent Remote](https://github.com/letmevibe/agent-remote)** — control **Antigravity CLI (`agy`)** and other local coding agents smoothly from your phone with zero web lag.

## Quick Start

Run inside any project folder:

```bash
npx agent-remote-cli
```

Or install globally:

```bash
npm install -g agent-remote-cli
agent-remote
```

Scan the QR code printed in your terminal using the **Agent Remote** mobile app to start streaming, reviewing git diffs, and attaching screenshots directly from your phone.

## Options

- `--cwd, -C <path>`: Workspace directory (defaults to current directory)
- `--port, -p <port>`: Bridge port (default `4789`)
- `--name <name>`: Custom host display name
- `--public-url <url>`: Public Tailscale / Cloudflare Tunnel URL for remote access outside Wi-Fi

## License

MIT © 2026 Dinh Quang Cuong
