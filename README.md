# BitChat Electron Desktop Client

A decentralized peer-to-peer messaging application with end-to-end encryption, compatible with existing BitChat iOS and macOS clients.

## Features

- **Decentralized P2P messaging** using Bluetooth Low Energy mesh networking
- **End-to-end encryption** with Noise Protocol Framework (XX pattern)
- **Nostr protocol fallback** for offline messaging to favorites
- **Ephemeral identities** with no persistent message storage
- **Cross-platform support** for Windows, macOS, and Linux

## Development Status

Currently in Phase 1 (Foundation) - Week 1 of 18-week development plan.

See `IMPLEMENTATION_STATUS.md` for detailed progress tracking.

## Quick Start

### Prerequisites

- Node.js >= 18.0.0
- npm or yarn

### Installation

```bash
# Clone the repository
git clone [repository-url]
cd bitchat-electron

# Install dependencies
npm install
```

### Development

```bash
# Start the app in development mode
npm start

# Or run individual processes
npm run dev:main      # Watch main process
npm run dev:preload   # Watch preload script
npm run dev:renderer  # Start renderer dev server
```

### Building

```bash
# Build for production
npm run build

# Package for current platform
npm run dist

# Package for all platforms
npm run dist:all
```

### Testing

```bash
# Run tests
npm test

# Run tests in watch mode
npm test:watch

# Lint code
npm run lint

# Fix lint issues
npm run lint:fix
```

## Project Structure

```
bitchat-electron/
├── src/
│   ├── main/          # Main process (Electron)
│   ├── renderer/      # Renderer process (React UI)
│   ├── preload/       # Preload scripts (IPC bridge)
│   └── shared/        # Shared types and constants
├── dist/              # Build output
├── release/           # Packaged apps
└── docs/              # Documentation
```

## Technical Stack

- **Electron** v27+ - Desktop framework
- **TypeScript** v5+ - Type safety
- **React** v18+ - UI framework
- **Webpack** v5+ - Bundling
- **Noble/Bleno** - Bluetooth Low Energy
- **Nostr Tools** - Nostr protocol
- **TweetNaCl** - Cryptography

## Security

- Context isolation enabled
- No direct IPC exposure
- Secure preload script patterns
- Content Security Policy enforced
- All communication encrypted

## Contributing

This project is currently under active development. See `IMPLEMENTATION_PLAN.md` for the roadmap.

## License

[License information to be added]