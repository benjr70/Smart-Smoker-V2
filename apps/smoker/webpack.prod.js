const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const Dotenv = require('dotenv-webpack');
const CopyWebpackPlugin = require('copy-webpack-plugin');
var webpack = require("webpack");

module.exports = {
  mode: 'production',
  devtool: 'source-map',
  entry: './src/index.tsx',
  devtool: 'inline-source-map',
  target: 'web',
  output: {
    path: path.join(__dirname, '/dist'),
    filename: 'bundle.js'
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
          transpileOnly: true
        }
      },
      exclude: [/node_modules/, /\.test\.(ts|tsx)$/, /\.spec\.(ts|tsx)$/],
    },
    {
      test: /\.css$/,
      use: ["style-loader", "css-loader"],
    }
  ]
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  plugins:[
    new HtmlWebpackPlugin({
      template: './public/index.html'
    }),
    new Dotenv({
      path: '.env.prod'
    }),
    new webpack.DefinePlugin({
      VERSION: JSON.stringify(require("../../package.json").version),
    }),
    new CopyWebpackPlugin({
      patterns: [
        { from: 'public', to: '', globOptions: { ignore: ['**/index.html'] } }
      ],
    }),
  ]
}