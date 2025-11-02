import fs from "fs";
import { rollup, watch, RollupOptions, OutputOptions } from "rollup";
import nodeResolve from "@rollup/plugin-node-resolve";
import babel from "@rollup/plugin-babel";
import { jsxInclude, jsxBin, jsxPonyfill } from "vite-cep-plugin";
import { CEP_Config } from "vite-cep-plugin";
import json from "@rollup/plugin-json";
import path from "path";
import { defineConfig } from "vite";
import cepConfig from "./cep.config";

const GLOBAL_THIS = "thisObj";
const extensions = [".js", ".ts", ".jsx"];

export const extendscriptConfig = (
  extendscriptEntry: string,
  outPath: string,
  cepConfig: CEP_Config,
  extensions: string[],
  isProduction: boolean,
  isPackage: boolean,
) => {
  console.log(`Building ${extendscriptEntry} -> ${outPath}`);
  const config: RollupOptions = {
    input: extendscriptEntry,
    treeshake: true,
    output: {
      file: outPath,
      sourcemap: isPackage
        ? cepConfig.zxp.sourceMap
        : cepConfig.build?.sourceMap,
    },
    plugins: [
      json(),
      nodeResolve({
        extensions,
      }),
      babel({
        extensions,
        exclude: /node_modules/,
        babelrc: false,
        babelHelpers: "inline",
        presets: ["@babel/preset-env", "@babel/preset-typescript"],
        plugins: [
          "@babel/plugin-syntax-dynamic-import",
          "@babel/plugin-proposal-class-properties",
        ],
      }),
      jsxPonyfill(),
      jsxInclude({
        iife: true,
        globalThis: GLOBAL_THIS,
      }),
      jsxBin(isPackage ? cepConfig.zxp.jsxBin : cepConfig.build?.jsxBin),
    ],
  };

  async function build() {
    try {
      const bundle = await rollup(config);
      await bundle.write(config.output as OutputOptions);
      await bundle.close();
    } catch (error) {
      console.error(`Build error for ${extendscriptEntry}:`, error);
      throw error;
    }
  }

  const triggerHMR = () => {
    console.log("ExtendScript Change");
    cepConfig.panels.map((panel) => {
      const tmpPath = path.join(process.cwd(), "src", "js", panel.mainPath);
      if (fs.existsSync(tmpPath)) {
        const txt = fs.readFileSync(tmpPath, { encoding: "utf-8" });
        fs.writeFileSync(tmpPath, txt, { encoding: "utf-8" });
      }
    });
  };

  const watchRollup = async () => {
    const watcher = watch(config);
    watcher.on("event", ({ result }: any) => {
      if (result) {
        triggerHMR();
        result.close();
      }
    });
    watcher.close();
  };

  if (isProduction) {
    return build();
  } else {
    return watchRollup();
  }
};

// Build JSX files
const isProduction = process.env.NODE_ENV === "production";
const isPackage = process.env.ZXP_PACKAGE === "true";

// Build main entry point - imports all host-specific modules
(async () => {
  try {
    await extendscriptConfig(
      `src/jsx/index.ts`,
      `dist/cep/jsx/index.js`,
      cepConfig,
      extensions,
      isProduction,
      isPackage,
    );
  } catch (error) {
    console.error("JSX build failed:", error);
    // Don't exit - let vite build continue
  }
})();

// Export empty config for vite (actual build happens above)
export default defineConfig({
  build: {
    rollupOptions: {
      input: {},
    },
  },
});
