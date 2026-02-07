import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
    base: "./",
    plugins: [react()],
    build: {
        rollupOptions: {
            output: {
                manualChunks: function (id) {
                    if (!id.includes("node_modules"))
                        return undefined;
                    if (id.includes("/echarts/"))
                        return "vendor-echarts";
                    if (id.includes("/react/") || id.includes("/react-dom/"))
                        return "vendor-react";
                    if (id.includes("/zod/"))
                        return "vendor-zod";
                    return "vendor";
                },
            },
        },
    },
});
