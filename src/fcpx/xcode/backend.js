#!/usr/bin/env node
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as http from "http";
import { spawn, exec } from "child_process";
import { fileURLToPath } from "url";
import { dirname } from "path";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pluginDir = __dirname;
debugLog("sync. FCPX plugin starting...");
function debugLog(message, data = {}) {
  try {
    console.log(`[fcpx] ${message}`, data);
    try {
      const logData = JSON.stringify({
        message: `[fcpx] ${message}`,
        data,
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        hostConfig: { hostId: "FCPX" }
      });
      const req = http.request({
        hostname: "127.0.0.1",
        port: 3e3,
        path: "/debug",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: 100
      }, () => {
      });
      req.on("error", () => {
      });
      req.on("timeout", () => req.destroy());
      req.write(logData);
      req.end();
    } catch (_) {
    }
    const home = os.homedir();
    let baseDir;
    if (process.platform === "win32") {
      baseDir = process.env.SYNC_EXTENSIONS_DIR || path.join(home, "AppData", "Roaming", "sync. extensions");
    } else if (process.platform === "darwin") {
      baseDir = process.env.SYNC_EXTENSIONS_DIR || path.join(home, "Library", "Application Support", "sync. extensions");
    } else {
      baseDir = process.env.SYNC_EXTENSIONS_DIR || path.join(home, ".config", "sync. extensions");
    }
    const logsDir = path.join(baseDir, "logs");
    const debugFlag = path.join(logsDir, ".debug");
    if (!fs.existsSync(debugFlag)) {
      return;
    }
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    const debugFile = path.join(logsDir, "sync_fcpx_debug.log");
    const timestamp = (/* @__PURE__ */ new Date()).toISOString();
    const logEntry = `[${timestamp}] [fcpx] ${message} ${JSON.stringify(data)}
`;
    fs.appendFileSync(debugFile, logEntry);
  } catch (error) {
  }
}
debugLog("backend.ts started", {
  nodeVersion: process.version,
  platform: process.platform,
  argv: process.argv
});
const NODE_HEALTH_URL = "http://127.0.0.1:3000/health";
let nodeProcess = null;
let nodeLock = false;
let fcpxAPI = null;
async function loadFCPXAPI() {
  if (fcpxAPI) return;
  try {
    const apiPath = path.join(pluginDir, "static", "fcpx_api.js");
    const apiUrl = path.isAbsolute(apiPath) ? `file://${apiPath}` : `file://${path.resolve(pluginDir, "static", "fcpx_api.js")}`;
    fcpxAPI = await import(apiUrl);
    debugLog("FCPX API module loaded", { path: apiPath });
  } catch (error) {
    const err = error;
    debugLog("Error loading FCPX API module", { error: err.message });
    throw new Error(`Failed to load FCPX API: ${err.message}`);
  }
}
async function callFCPXAPI(functionName, payload = {}) {
  try {
    await loadFCPXAPI();
    if (!fcpxAPI) {
      throw new Error("FCPX API module not loaded");
    }
    debugLog("Calling FCPX API", { functionName, payload });
    const functionMap = {
      "getProjectDir": "getProjectDirAsync",
      "exportInOutVideo": "exportInOutVideo",
      "exportInOutAudio": "exportInOutAudio",
      "importFileToBin": "importFileToBin",
      "insertFileAtPlayhead": "insertFileAtPlayhead",
      "insertAtPlayhead": "insertAtPlayhead",
      "importIntoBin": "importIntoBin",
      "revealFile": "revealFile",
      "diagInOut": "diagInOut",
      "diag": "diag",
      "showFileDialog": "showFileDialog"
    };
    const actualFunctionName = functionMap[functionName] || functionName;
    const apiFunction = fcpxAPI[actualFunctionName];
    if (!apiFunction || typeof apiFunction !== "function") {
      throw new Error(`FCPX API function ${actualFunctionName} not found`);
    }
    const result = await apiFunction(payload);
    if (typeof result === "string") {
      try {
        return JSON.parse(result);
      } catch {
        return { ok: false, error: "Invalid JSON response from FCPX API" };
      }
    }
    return result;
  } catch (error) {
    const err = error;
    debugLog("FCPX API error", { functionName, error: err.message, stack: err.stack });
    return { ok: false, error: err.message };
  }
}
function checkNodeHealth() {
  return new Promise((resolve) => {
    const req = http.get(NODE_HEALTH_URL, { timeout: 1e3 }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}
async function spawnNodeServer() {
  if (nodeLock) return { ok: true, alreadyRunning: true };
  const isHealthy = await checkNodeHealth();
  if (isHealthy) return { ok: true, alreadyRunning: true };
  nodeLock = true;
  const nodeBin = process.platform === "darwin" ? path.join(pluginDir, "static", "bin", "darwin-arm64", "node") : process.platform === "win32" ? path.join(pluginDir, "static", "bin", "win32-x64", "node.exe") : path.join(pluginDir, "static", "bin", "darwin-x64", "node");
  const serverTs = path.join(pluginDir, "static", "server", "server.ts");
  const tsxBin = path.join(pluginDir, "static", "server", "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
  if (!fs.existsSync(nodeBin) || !fs.existsSync(serverTs)) {
    nodeLock = false;
    debugLog("Server spawn failed - missing files", {
      nodeBin: fs.existsSync(nodeBin),
      serverTs: fs.existsSync(serverTs),
      tsxBin: fs.existsSync(tsxBin),
      nodeBinPath: nodeBin,
      serverTsPath: serverTs
    });
    return { ok: false, error: "Node binary or server file missing" };
  }
  const cwd = path.join(pluginDir, "static", "server");
  const executable = fs.existsSync(tsxBin) ? tsxBin : nodeBin;
  const args = fs.existsSync(tsxBin) ? [serverTs] : ["-r", "tsx/cjs", serverTs];
  debugLog("Spawning Node server with tsx", { executable, serverTs, cwd, usingTsx: fs.existsSync(tsxBin) });
  nodeProcess = spawn(executable, args, {
    cwd,
    detached: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HOST_APP: "FCPX", NODE_ENV: "production" }
  });
  nodeProcess.stdout.on("data", (data) => {
    const output = data.toString();
    debugLog("Node server stdout", { output });
  });
  nodeProcess.stderr.on("data", (data) => {
    const output = data.toString();
    debugLog("Node server stderr", { output });
  });
  nodeProcess.on("error", (err) => {
    debugLog("Node server spawn error", { error: err.message });
    nodeLock = false;
    nodeProcess = null;
  });
  nodeProcess.on("exit", (code, signal) => {
    debugLog("Node server exited", { code, signal });
    nodeProcess = null;
    nodeLock = false;
  });
  await new Promise((resolve) => setTimeout(resolve, 2e3));
  const isHealthyAfterSpawn = await checkNodeHealth();
  if (!isHealthyAfterSpawn) {
    debugLog("Node server health check failed after spawn");
  }
  return { ok: true, spawned: true, healthy: isHealthyAfterSpawn };
}
const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  const origin = req.headers.origin;
  if (origin && (origin.startsWith("http://localhost:") || origin.startsWith("http://127.0.0.1:"))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization, X-CEP-Panel, x-auth-token");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-api-key, Authorization, X-CEP-Panel, x-auth-token");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end();
    return;
  }
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;
  if (pathname.startsWith("/nle/")) {
    res.setHeader("Content-Type", "application/json");
    if (pathname === "/nle/startBackend" && req.method === "POST") {
      try {
        const result = await spawnNodeServer();
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (error) {
        const err = error;
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    if (pathname === "/nle/getProjectDir" && req.method === "GET") {
      try {
        const result = await callFCPXAPI("getProjectDir", {});
        if (!result || typeof result !== "object") {
          debugLog("getProjectDir invalid result", { result, resultType: typeof result });
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Invalid response from FCPX API" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      } catch (error) {
        const err = error;
        debugLog("getProjectDir error", { error: err.message, stack: err.stack });
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: err.message || "Unknown error occurred" }));
      }
      return;
    }
    if (pathname === "/nle/exportInOutVideo" && req.method === "POST") {
      try {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const opts = JSON.parse(body || "{}");
            const result = await callFCPXAPI("exportInOutVideo", opts);
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error) {
            const err = error;
            res.writeHead(500);
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      } catch (error) {
        const err = error;
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    if (pathname === "/nle/exportInOutAudio" && req.method === "POST") {
      try {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const opts = JSON.parse(body || "{}");
            const result = await callFCPXAPI("exportInOutAudio", opts);
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error) {
            const err = error;
            res.writeHead(500);
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      } catch (error) {
        const err = error;
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    if (pathname === "/nle/importFileToBin" && req.method === "POST") {
      try {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const payload = JSON.parse(body || "{}");
            const result = await callFCPXAPI("importFileToBin", payload);
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error) {
            const err = error;
            res.writeHead(500);
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      } catch (error) {
        const err = error;
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    if (pathname === "/nle/insertFileAtPlayhead" && req.method === "POST") {
      try {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const payload = JSON.parse(body || "{}");
            const result = await callFCPXAPI("insertFileAtPlayhead", payload);
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error) {
            const err = error;
            res.writeHead(500);
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      } catch (error) {
        const err = error;
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    if (pathname === "/nle/insertAtPlayhead" && req.method === "POST") {
      try {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const payload = JSON.parse(body || "{}");
            const jobId = payload.jobId || payload;
            const result = await callFCPXAPI("insertAtPlayhead", { jobId });
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error) {
            const err = error;
            res.writeHead(500);
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      } catch (error) {
        const err = error;
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    if (pathname === "/nle/importIntoBin" && req.method === "POST") {
      try {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const payload = JSON.parse(body || "{}");
            const jobId = payload.jobId || payload;
            const result = await callFCPXAPI("importIntoBin", { jobId });
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error) {
            const err = error;
            res.writeHead(500);
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      } catch (error) {
        const err = error;
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    if (pathname === "/nle/revealFile" && req.method === "POST") {
      try {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const payload = JSON.parse(body || "{}");
            const result = await callFCPXAPI("revealFile", payload);
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error) {
            const err = error;
            res.writeHead(500);
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      } catch (error) {
        const err = error;
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    if (pathname === "/nle/diagInOut" && req.method === "GET") {
      try {
        const result = await callFCPXAPI("diagInOut", {});
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (error) {
        const err = error;
        debugLog("diagInOut error", { error: err.message });
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    if (pathname === "/nle/diag" && req.method === "GET") {
      try {
        const result = await callFCPXAPI("diag", {});
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (error) {
        const err = error;
        debugLog("diag error", { error: err.message });
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    if (pathname === "/nle/showFileDialog" && req.method === "POST") {
      try {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const options = JSON.parse(body || "{}");
            const result = await callFCPXAPI("showFileDialog", options);
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error) {
            const err = error;
            res.writeHead(500);
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      } catch (error) {
        const err = error;
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    if (pathname === "/nle/ensureDir" && req.method === "POST") {
      try {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const payload = JSON.parse(body || "{}");
            const dirPath = payload?.path || payload;
            if (!dirPath || typeof dirPath !== "string") {
              res.writeHead(400);
              res.end(JSON.stringify({ ok: false, error: "Invalid directory path" }));
              return;
            }
            if (!fs.existsSync(dirPath)) {
              fs.mkdirSync(dirPath, { recursive: true });
              debugLog("Created directory", { path: dirPath });
            }
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
          } catch (error) {
            const err = error;
            res.writeHead(500);
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      } catch (error) {
        const err = error;
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    if (pathname === "/nle/fileExists" && req.method === "POST") {
      try {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const payload = JSON.parse(body || "{}");
            const filePath = payload?.path || payload;
            if (!filePath || typeof filePath !== "string") {
              res.writeHead(400);
              res.end(JSON.stringify({ ok: false, error: "Invalid file path", exists: false }));
              return;
            }
            const exists = fs.existsSync(filePath);
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, exists }));
          } catch (error) {
            const err = error;
            res.writeHead(500);
            res.end(JSON.stringify({ ok: false, error: err.message, exists: false }));
          }
        });
      } catch (error) {
        const err = error;
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message, exists: false }));
      }
      return;
    }
    if (pathname === "/nle/readThumbnail" && req.method === "POST") {
      try {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const payload = JSON.parse(body || "{}");
            const filePath = payload?.path || payload;
            if (!filePath || typeof filePath !== "string") {
              res.writeHead(400);
              res.end(JSON.stringify({ ok: false, error: "Invalid file path" }));
              return;
            }
            if (!fs.existsSync(filePath)) {
              res.writeHead(404);
              res.end(JSON.stringify({ ok: false, error: "File not found" }));
              return;
            }
            const fileBuffer = fs.readFileSync(filePath);
            const base64 = fileBuffer.toString("base64");
            const mimeType = filePath.endsWith(".png") ? "image/png" : "image/jpeg";
            const dataUrl = `data:${mimeType};base64,${base64}`;
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true, dataUrl }));
          } catch (error) {
            const err = error;
            res.writeHead(500);
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      } catch (error) {
        const err = error;
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    if (pathname === "/nle/saveThumbnail" && req.method === "POST") {
      try {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });
        req.on("end", async () => {
          try {
            const payload = JSON.parse(body || "{}");
            const filePath = payload?.path;
            const dataUrl = payload?.dataUrl;
            if (!filePath || !dataUrl) {
              res.writeHead(400);
              res.end(JSON.stringify({ ok: false, error: "Invalid parameters" }));
              return;
            }
            const base64Match = dataUrl.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/);
            if (!base64Match) {
              res.writeHead(400);
              res.end(JSON.stringify({ ok: false, error: "Invalid data URL format" }));
              return;
            }
            const base64Data = base64Match[2];
            const buffer = Buffer.from(base64Data, "base64");
            const dirPath = path.dirname(filePath);
            if (!fs.existsSync(dirPath)) {
              fs.mkdirSync(dirPath, { recursive: true });
            }
            fs.writeFileSync(filePath, buffer);
            debugLog("Saved thumbnail", { path: filePath, size: buffer.length });
            res.writeHead(200);
            res.end(JSON.stringify({ ok: true }));
          } catch (error) {
            const err = error;
            res.writeHead(500);
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      } catch (error) {
        const err = error;
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    if (pathname === "/nle/stopBackend" && req.method === "POST") {
      try {
        const isWindows = process.platform === "win32";
        if (isWindows) {
          exec(`for /f "tokens=5" %a in ('netstat -aon ^| findstr :3000') do taskkill /f /pid %a`, (error) => {
            if (error) {
              debugLog("stopBackend error", { error: error.message });
            }
          });
        } else {
          exec("lsof -tiTCP:3000 | xargs kill -9 || true", (error) => {
            if (error) {
              debugLog("stopBackend error", { error: error.message });
            }
          });
        }
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, message: "Backend stopped" }));
      } catch (error) {
        const err = error;
        res.writeHead(500);
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
      return;
    }
    res.writeHead(404);
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
    return;
  }
  res.writeHead(404);
  res.end("Not found");
});
server.listen(45791, "127.0.0.1", () => {
  debugLog("HTTP server started on port 45791");
  spawnNodeServer();
});
