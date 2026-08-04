const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
var webpack = require('webpack');

module.exports = {
  mode: 'development',
  entry: './src/index.tsx',
  devtool: 'inline-source-map',
  target: 'web',
  output: {
    path: path.join(__dirname, '/dist'),
    filename: 'bundle.js',
  },
  devtool: 'inline-source-map',
  devServer: {
    static: './dist',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: [/node_modules/, /\.test\.(ts|tsx)$/, /\.spec\.(ts|tsx)$/],
      },
      {
        // Build TS/TSX sources from the workspace packages "temperaturechart",
        // "smoke-session", "api-transport" and "theme", which ship TS/TSX
        // sources (no prebuilt dist). Both layouts are listed on purpose: locally
        // node_modules/<pkg> is a symlink so webpack reports the packages/
        // real path, while CI ships the workspace as an upload-artifact, which
        // dereferences the symlink into a real node_modules/ directory that the
        // rule above excludes. Guarded by src/workspaceSourceLoader.test.ts.
        test: /\.tsx?$/,
        include: [
          path.resolve(__dirname, '../../packages/TemperatureChart/src'),
          path.resolve(__dirname, '../../node_modules/temperaturechart/src'),
          path.resolve(__dirname, '../../packages/smoke-session/src'),
          path.resolve(__dirname, '../../node_modules/smoke-session/src'),
          path.resolve(__dirname, '../../packages/api-transport/src'),
          path.resolve(__dirname, '../../node_modules/api-transport/src'),
          path.resolve(__dirname, '../../packages/theme/src'),
          path.resolve(__dirname, '../../node_modules/theme/src'),
        ],
        use: 'ts-loader',
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      // axios is a PEER dependency of the shared "api-transport" package, which
      // owns the only `import axios from 'axios'` in the API layer. Webpack
      // resolves that bare specifier from the ISSUER directory
      // (packages/api-transport/src), whose node_modules walk leaves this app's
      // tree and lands on the repo-root hoisted axios — which would make the
      // pin in this app's package.json inert. Alias it back to the copy npm
      // installed for this app. Guarded by src/api/axiosBundlePin.test.ts.
      axios: path.dirname(require.resolve('axios/package.json')),
    },
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public/index.html',
    }),
    new Dotenv({
      path: '.env.local',
    }),
    new webpack.DefinePlugin({
      VERSION: JSON.stringify(require('../../package.json').version),
    }),
    new CopyWebpackPlugin({
      patterns: [{ from: 'public', to: '', globOptions: { ignore: ['**/index.html'] } }],
    }),
  ],
};
