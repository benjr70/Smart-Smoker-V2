const path = require('path');

module.exports = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './electron-app/index.ts',
  // Put your normal webpack config below here
  module: {
    rules: require('./webpack.rules'),
  },
  resolve: {
    extensions: ['.js', '.ts'],
    modules: ['node_modules', '../../node_modules'],
    alias: {
      src: path.resolve(__dirname, './src'),
      ['electron-app']: path.resolve(__dirname, './electron-app'),
    },
  },
};
