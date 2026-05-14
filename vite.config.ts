import { defineConfig, loadEnv } from 'vite'
import { cp } from 'node:fs/promises'
import { resolve } from 'node:path'
import cesium from 'vite-plugin-cesium'

export default defineConfig(({ command, mode }) => {
  loadEnv(mode, process.cwd(), '')

  const isProd = command === 'build'
  const basePath = isProd ? '/digital-twin-drone/' : '/'

  return {
    base: basePath,
    define: {
      CESIUM_BASE_URL: JSON.stringify(`${basePath}cesium/`),
    },
    plugins: [
      !isProd && cesium({ cesiumBaseUrl: 'cesium/' }),
      {
        name: 'copy-cesium-assets',
        apply: 'build',
        async closeBundle() {
          const cesiumSource = resolve('node_modules/cesium/Build/Cesium')
          const cesiumTarget = resolve('dist/cesium')

          await Promise.all([
            cp(resolve(cesiumSource, 'Assets'), resolve(cesiumTarget, 'Assets'), { recursive: true }),
            cp(resolve(cesiumSource, 'ThirdParty'), resolve(cesiumTarget, 'ThirdParty'), { recursive: true }),
            cp(resolve(cesiumSource, 'Workers'), resolve(cesiumTarget, 'Workers'), { recursive: true }),
            cp(resolve(cesiumSource, 'Widgets'), resolve(cesiumTarget, 'Widgets'), { recursive: true }),
          ])
        },
      },
    ],
    root: '.',
    publicDir: 'public',
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  }
})