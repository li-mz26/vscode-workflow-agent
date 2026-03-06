"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.HTTPNodeExecutor = void 0;
const NodeExecutor_1 = require("./NodeExecutor");
class HTTPNodeExecutor extends NodeExecutor_1.NodeExecutor {
    constructor() {
        super(...arguments);
        this.type = 'http';
    }
    async execute(node, context) {
        const { method = 'GET', url, headers = {}, body, timeout = 30000, retryCount = 0, retryDelay = 1000 } = node.data;
        if (!url) {
            return { success: false, error: new Error('URL is required') };
        }
        // 渲染模板变量
        const renderedUrl = this.renderTemplate(url, context);
        const renderedHeaders = {};
        for (const [key, value] of Object.entries(headers)) {
            renderedHeaders[key] = this.renderTemplate(String(value), context);
        }
        const renderedBody = body ? this.renderTemplate(body, context) : undefined;
        let lastError;
        for (let attempt = 0; attempt <= retryCount; attempt++) {
            try {
                const response = await this.makeRequest({
                    method,
                    url: renderedUrl,
                    headers: renderedHeaders,
                    body: renderedBody,
                    timeout
                });
                return {
                    success: true,
                    outputs: {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers,
                        body: response.body,
                        json: response.json
                    }
                };
            }
            catch (error) {
                lastError = error;
                if (attempt < retryCount) {
                    await this.sleep(retryDelay * Math.pow(2, attempt));
                }
            }
        }
        return {
            success: false,
            error: lastError,
            outputs: { error: lastError?.message }
        };
    }
    async makeRequest(options) {
        const { method, url, headers, body, timeout } = options;
        // Node.js 环境使用内置 http/https 模块
        const http = await Promise.resolve().then(() => __importStar(require('http')));
        const https = await Promise.resolve().then(() => __importStar(require('https')));
        const { URL } = await Promise.resolve().then(() => __importStar(require('url')));
        const parsedUrl = new URL(url);
        const client = parsedUrl.protocol === 'https:' ? https : http;
        return new Promise((resolve, reject) => {
            const req = client.request({
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname + parsedUrl.search,
                method,
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                timeout
            }, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    let json = null;
                    try {
                        json = JSON.parse(data);
                    }
                    catch {
                        // Not JSON
                    }
                    resolve({
                        status: res.statusCode,
                        statusText: res.statusMessage,
                        headers: res.headers,
                        body: data,
                        json
                    });
                });
            });
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timeout'));
            });
            if (body) {
                req.write(body);
            }
            req.end();
        });
    }
    renderTemplate(template, context) {
        return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, path) => {
            const parts = path.split('.');
            let value = context.inputs;
            for (const part of parts) {
                value = value?.[part];
                if (value === undefined)
                    break;
            }
            if (value === undefined) {
                value = context.variables.get(path);
            }
            return value !== undefined ? String(value) : match;
        });
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    validate(config) {
        const errors = [];
        if (!config.url) {
            errors.push('URL is required');
        }
        if (config.method && !['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(config.method)) {
            errors.push('Invalid HTTP method');
        }
        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }
}
exports.HTTPNodeExecutor = HTTPNodeExecutor;
//# sourceMappingURL=HTTPNodeExecutor.js.map