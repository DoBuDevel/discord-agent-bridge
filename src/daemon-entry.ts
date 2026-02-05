/**
 * Entry point for the daemon process
 * Called by DaemonManager.startDaemon() to run the bridge server in background
 */

import { main } from './index.js';

main().catch((error) => {
  console.error('Daemon fatal error:', error);
  process.exit(1);
});
