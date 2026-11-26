import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist' },
  // 预览服务器经隧道暴露时，Host 头不是本机地址；这里显式放开（只影响 `vite preview`）。
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, allowedHosts: true },
});
