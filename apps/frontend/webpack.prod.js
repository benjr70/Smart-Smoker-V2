const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
var webpack = require('webpack');

// NOTE: this was `module.exports = env = {` — an accidental assignment to an
// undeclared global, which throws in strict mode (e.g. when the config is
// required from a test). Nothing reads that global.
module.exports = {
  mode: 'production',
  devtool: 'source-map',
  entry: './src/index.tsx',
  devtool: 'inline-source-map',
  target: 'web',
  output: {
    path: path.join(__dirname, '/dist'),
    filename: 'bundle.[contenthash].js',
  },
  devtool: 'inline-source-map',
  devServer: {
    static: './dist',
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
        exclude: /node_modules/,
      },
      {
        // Allow building our workspace packages "temperaturechart",
        // "smoke-session" and "api-transport" which ship TS/TSX sources (no
        // prebuilt dist).
        test: /\.tsx?$/,
        include: [
          path.resolve(__dirname, '../../packages/TemperatureChart/src'),
          path.resolve(__dirname, '../../node_modules/temperaturechart/src'),
          path.resolve(__dirname, '../../packages/smoke-session/src'),
          path.resolve(__dirname, '../../node_modules/smoke-session/src'),
          path.resolve(__dirname, '../../packages/api-transport/src'),
          path.resolve(__dirname, '../../node_modules/api-transport/src'),
        ],
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
          },
        },
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        // The self-hosted Plus Jakarta Sans webfont: its face stylesheet points
        // at font files with relative urls, which css-loader hands to webpack to
        // emit alongside the bundle. Without this the build fails to resolve
        // them and the app would have to fall back to a font CDN.
        test: /\.(woff2?|eot|ttf|otf)$/i,
        type: 'asset/resource',
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
      path: '.env.prod',
    }),
    new webpack.DefinePlugin({
      VERSION: JSON.stringify(require('../../package.json').version),
    }),
    new CopyWebpackPlugin({
      patterns: [{ from: 'public', to: '', globOptions: { ignore: ['**/index.html'] } }],
    }),
  ],
};
