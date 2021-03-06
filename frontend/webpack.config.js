const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
  mode: 'development',
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
      use: 'ts-loader',
      exclude: /node_modules/,
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
    })
  ]
}