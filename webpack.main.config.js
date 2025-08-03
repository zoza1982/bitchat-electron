const path = require('path');
const webpack = require('webpack');
const nodeExternals = require('webpack-node-externals');

module.exports = (env, argv) => {
  const isDevelopment = argv.mode === 'development';

  return {
    target: 'electron-main',
    entry: './src/main/index.ts',
    output: {
      path: path.resolve(__dirname, 'dist/main'),
      filename: 'index.js'
    },
    externals: [nodeExternals()],
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.main.json'
            }
          }
        }
      ]
    },
    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        '@shared': path.resolve(__dirname, 'src/shared')
      }
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(isDevelopment ? 'development' : 'production')
      })
    ],
    devtool: isDevelopment ? 'source-map' : false,
    optimization: {
      minimize: !isDevelopment
    },
    node: {
      __dirname: false,
      __filename: false
    }
  };
};