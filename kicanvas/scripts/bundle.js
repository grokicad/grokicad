/*
    Copyright (c) 2023 Alethea Katherine Flowers.
    Published under the standard MIT License.
    Full text available at: https://opensource.org/licenses/MIT
*/

import esbuild from "esbuild";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { config } from "dotenv";

// Load environment variables from .env file
config();

export const ENTRY = resolve("src/index.ts");

export async function bundle(options = {}) {
    // Build API URL from environment variables
    const backendIp = process.env.BACKEND_IP || "localhost";
    const backendPort = process.env.BACKEND_PORT || "443";
    const backendUrl = `http://${backendIp}:${backendPort}`;

    console.log(`[bundle] Using backend URL: ${backendUrl}`);

    // Merge define options from caller with our defaults
    const mergedDefine = {
        DEBUG: "false",
        "process.env.BACKEND_URL": JSON.stringify(backendUrl),
        ...(options.define || {}),
    };

    options = {
        entryPoints: [ENTRY],
        bundle: true,
        format: "esm",
        target: "es2022",
        keepNames: true,
        sourcemap: false,
        loader: {
            ".js": "ts",
            ".glsl": "text",
            ".css": "text",
            ".svg": "text",
            ".kicad_wks": "text",
        },
        ...options,
        define: mergedDefine,
        plugins: [CSSMinifyPlugin, ESbuildProblemMatcherPlugin],
    };
    return { options: options, context: await esbuild.context(options) };
}

// Minify CSS when used with the file loader.
export const CSSMinifyPlugin = {
    name: "css-minify",
    setup(build) {
        build.onLoad({ filter: /\.css$/ }, async (args) => {
            const f = await readFile(args.path);
            const css = await esbuild.transform(f, {
                loader: "css",
                minify: true,
            });
            return { loader: "text", contents: css.code };
        });
    },
};

// Enables VSCode to detect when the build starts/finishes
const ESbuildProblemMatcherPlugin = {
    name: "esbuild-problem-matcher",

    setup(build) {
        build.onStart(() => {
            console.log("[watch] build started");
        });
        build.onEnd((result) => {
            console.log("[watch] build finished");
        });
    },
};
