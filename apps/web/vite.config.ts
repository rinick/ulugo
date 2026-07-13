import react from '@vitejs/plugin-react';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';
import path from 'node:path';

export default defineConfig(({mode}) => {
  const electronDevBuild = mode === 'electron-dev';

  return {
    base: './',
    plugins: [
      react(),
      VitePWA({
        injectRegister: false,
        registerType: 'autoUpdate',
        manifest: {
          name: 'Ulugo',
          short_name: 'Ulugo',
          description: 'A modern SGF editor for Go, Weiqi, and Baduk.',
          theme_color: '#f4f7f5',
          background_color: '#f4f7f5',
          display: 'standalone',
          scope: '.',
          start_url: '.',
          icons: [
            {
              src: 'icon-192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
            },
          ],
        },
        workbox: {
          clientsClaim: true,
          disableDevLogs: true,
          globPatterns: ['**/*.{js,css,html,ico,png,webp,woff2,ttf,wav}'],
          maximumFileSizeToCacheInBytes: electronDevBuild ? 5 * 1024 * 1024 : undefined,
          mode: 'development',
          skipWaiting: true,
        },
      }),
    ],
    build: {
      minify: electronDevBuild ? false : true,
      rollupOptions: {
        output: {
          assetFileNames: 'assets/[name][extname]',
          chunkFileNames: 'assets/[name].js',
          entryFileNames: 'assets/[name].js',
        },
      },
    },
    server: {
      hmr: false,
      port: 5072,
    },
    resolve: {
      alias: [
        {find: '@ulugo/sgf-core', replacement: path.resolve(__dirname, '../../packages/sgf-core/src')},
        {find: '@ulugo/go-core', replacement: path.resolve(__dirname, '../../packages/go-core/src')},
        {find: '@ulugo/ui-shared', replacement: path.resolve(__dirname, '../../packages/ui-shared/src')},
        {find: '@ulugo/analysis-core', replacement: path.resolve(__dirname, '../../packages/analysis-core/src')},
        {
          find: '@ulugo/sgf-analysis-tree',
          replacement: path.resolve(__dirname, '../../packages/sgf-analysis-tree/src'),
        },
        {find: '@ulugo/katago-core', replacement: path.resolve(__dirname, '../../packages/katago-core/src')},
      ],
    },
  };
});
