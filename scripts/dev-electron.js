const { spawn } = require('child_process');
const path = require('path');

// Wait for webpack builds to be ready
console.log('Starting BitChat development environment...');

let electronProcess = null;
let webpackReady = false;

function startElectron() {
  if (electronProcess) {
    electronProcess.kill();
  }
  
  electronProcess = spawn('electron', ['.'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development'
    }
  });
  
  electronProcess.on('close', () => {
    process.exit();
  });
}

// Watch for main process changes
const chokidar = require('chokidar');
const watcher = chokidar.watch(path.join(__dirname, '../dist/main'), {
  ignoreInitial: true
});

watcher.on('change', () => {
  console.log('Main process changed, restarting Electron...');
  if (webpackReady) {
    startElectron();
  }
});

// Start electron after a delay to ensure webpack is ready
setTimeout(() => {
  webpackReady = true;
  startElectron();
}, 5000);

// Handle process termination
process.on('SIGINT', () => {
  if (electronProcess) {
    electronProcess.kill();
  }
  process.exit();
});