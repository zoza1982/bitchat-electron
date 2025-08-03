import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import * as path from 'path';
import { 
  registerIPCHandlers, 
  initializeSessionManager,
  simulatePeerConnection,
  simulatePeerDisconnection,
  simulateIncomingMessage
} from './ipc-handlers';

let mainWindow: BrowserWindow | null = null;

const createWindow = (): void => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: path.join(__dirname, '../preload/preload.js')
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    backgroundColor: '#1a1a1a',
    show: false,
    icon: path.join(__dirname, '../../resources/icon.png')
  });

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  // Load the index.html of the app.
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:8080');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevent navigation outside the app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('http://localhost:8080') && !url.startsWith('file://')) {
      event.preventDefault();
    }
  });
};

// Create development menu for testing
const createDevMenu = (): void => {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'BitChat',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Test',
      submenu: [
        {
          label: 'Simulate Peer Connection',
          click: () => {
            const peerId = Buffer.from(Math.random().toString()).toString('hex').slice(0, 16);
            simulatePeerConnection(peerId, `TestUser-${peerId.slice(0, 6)}`);
          }
        },
        {
          label: 'Simulate Peer Disconnection',
          click: () => {
            // Disconnect first peer
            simulatePeerDisconnection('mock-peer-1');
          }
        },
        {
          label: 'Simulate Incoming Message',
          click: () => {
            const messages = [
              'Hello from test peer!',
              'This is a test message.',
              'How are you doing?',
              'Testing the chat functionality.'
            ];
            const message = messages[Math.floor(Math.random() * messages.length)];
            simulateIncomingMessage('mock-peer-1', message);
          }
        },
        {
          label: 'Simulate Private Message',
          click: () => {
            simulateIncomingMessage('mock-peer-1', 'This is a private encrypted message!', true);
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
app.whenReady().then(async () => {
  // Initialize session manager and transport
  await initializeSessionManager();
  
  // Register IPC handlers
  registerIPCHandlers();
  
  // Create window
  createWindow();
  
  // Set up development menu
  if (process.env.NODE_ENV === 'development') {
    createDevMenu();
    
    // Add some mock peers for testing
    setTimeout(() => {
      simulatePeerConnection('mock-peer-1', 'Alice');
      setTimeout(() => {
        simulatePeerConnection('mock-peer-2', 'Bob');
      }, 500);
    }, 1000);
  }

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Security: Prevent new window creation
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
  });
});