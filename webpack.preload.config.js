const path = require('path');
const webpack = require('webpack');

module.exports = (env, argv) => {
  const isDevelopment = argv.mode === 'development';

  return {
    target: 'electron-preload',
    entry: './src/preload/preload.ts',
    output: {
      path: path.resolve(__dirname, 'dist/preload'),
      filename: 'preload.js'
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          use: {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.json'
            }
          }
        }
      ]
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    plugins: [
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(isDevelopment ? 'development' : 'production')
      })
    ],
    devtool: isDevelopment ? 'source-map' : false,
    optimization: {
      minimize: !isDevelopment
    }
  };
};