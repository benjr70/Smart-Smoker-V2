const CopyWebpackPlugin = require('copy-webpack-plugin');
const rules = require('./webpack.rules');
const path = require('path');

const thickElectronPlugins = [
  new CopyWebpackPlugin({
    patterns: [
      {
        context: path.resolve(__dirname, 'cra-forge'),
        // globOptions: {
        //   ignore: ['**/index.html'],
        // },
        from: './**',
        to: path.resolve(__dirname, '.webpack/renderer/main_window'),
      },
    ],
  }),
];

module.exports = {
  module: {
    rules,
  },
  plugins: process.env.ELECTRON_APP_MODE === 'thin' ? [] : thickElectronPlugins,
  resolve: {
    extensions: ['.js', '.ts'],
    alias: {
      src: path.resolve(__dirname, './src'),
      ['electron-app']: path.resolve(__dirname, './electron-app'),
    },
  },
};
