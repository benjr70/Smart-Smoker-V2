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
        // Build TS/TSX sources from the workspace package "temperaturechart"
        test: /\.tsx?$/,
        include: [
          path.resolve(__dirname, '../../packages/TemperatureChart/src'),
          path.resolve(__dirname, '../../node_modules/temperaturechart/src'),
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
