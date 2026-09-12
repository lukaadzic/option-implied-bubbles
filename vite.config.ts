import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
	plugins: [
		TanStackRouterVite({ autoCodeSplitting: true }),
		viteReact(),
		tailwindcss(),
	],
	build: {
		// plotly.js is ~4MB minified. Splitting it out keeps the app shell small
		// and lets the browser cache it across deploys.
		rollupOptions: {
			output: {
				manualChunks: {
					plotly: ["plotly.js/dist/plotly.min.js"],
				},
			},
		},
		chunkSizeWarningLimit: 5000,
	},
	resolve: {
		alias: {
			"@": resolve(__dirname, "./src"),
		},
	},
	test: {
		globals: true,
		environment: "jsdom",
	},
});
