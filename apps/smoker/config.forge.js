module.exports = {
  buildIdentifier: 'smoker-electron-build',
  packagerConfig: {
    name: process.env.ELECTRON_APP_MODE === 'thin' ? 'smoker-shell' : 'smoker',
    // This flag configures whether the production
    // installer deploys raw source or an asar archive
    asar: true,
  },
  makers: [
    /**
     * squirrel Installer Configuration
     * However, can be used with raw files
     */
    {
      name: '@electron-forge/maker-squirrel',
      platforms: ['win32'],
      config: {
        authors: 'Ben Rolf',
      },
    },
    /**
     * ZIP Distribution config
     * Useful for all platforms without installation
     */
    {
      name: '@electron-forge/maker-zip',
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-webpack',
      config: {
        mainConfig: './webpack.main.config.js',
        renderer: {
          config: './webpack.renderer.config.js',
          entryPoints: [
            {
              html:
                process.env.ELECTRON_APP_MODE === 'thin'
                  ? './public/thin.html'
                  : './cra-forge/index.html',
              js: './public/place_holder.js',
              name: 'main_window',
              preload: {
                js: './electron-app/preload.ts',
              },
            },
          ],
        },
      },
    },
  ],
};
