#!/usr/bin/env node
import qrcode from 'qrcode-terminal';
import { detectLanAddress, resolveConfig } from './config.js';
import { startBridgeServer } from './server.js';

async function main(): Promise<void> {
  const config = resolveConfig(process.argv.slice(2));
  const { pairing, registry } = await startBridgeServer(config);
  const agents = await registry.detectAll();

  const lanIp = detectLanAddress();
  const displayUrl = config.publicUrl ?? `http://${lanIp}:${config.port}`;
  const pairPayload = pairing.buildPairPayload(displayUrl, config.hostName);

  console.log('\n=== Agent Remote Host Bridge ===');
  console.log(`Host:       ${config.hostName}`);
  console.log(`Workspace:  ${config.workspacePath}`);
  console.log(`Endpoint:   ${displayUrl}`);
  console.log(`Pair Code:  ${pairing.getPairCode()}`);
  console.log('\nDetected Agents:');
  for (const agent of agents) {
    const marker = agent.available ? '[READY]' : '[NOT FOUND]';
    console.log(`  ${marker} ${agent.name} (${agent.command})`);
  }

  console.log('\nScan this QR code in the Agent Remote mobile app:\n');
  qrcode.generate(JSON.stringify(pairPayload), { small: true });
  console.log('\nPress Ctrl+C to stop.\n');
}

main().catch((err) => {
  console.error('Failed to start Agent Remote Bridge:', err);
  process.exit(1);
});
