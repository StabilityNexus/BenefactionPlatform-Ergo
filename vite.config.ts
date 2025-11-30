import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from "path";

export default defineConfig({
        plugins: [sveltekit()],
        resolve: {
                alias: {
                        $lib: path.resolve("./src/lib"),
                },
        },
        server: {
                host: '0.0.0.0',
                port: 5000,
                strictPort: true,
        },
        preview: {
                host: '0.0.0.0',
                port: 5000,
                strictPort: true,
        }
})
