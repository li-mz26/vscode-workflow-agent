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
exports.WebhookNodeExecutor = void 0;
const NodeExecutor_1 = require("./NodeExecutor");
class WebhookNodeExecutor extends NodeExecutor_1.NodeExecutor {
    constructor() {
        super(...arguments);
        this.type = 'webhook';
    }
    async execute(node, context) {
        const { provider = 'generic', webhookUrl, message, title, severity = 'info', fields = [], mentions = [] } = node.data;
        if (!webhookUrl) {
            return { success: false, error: new Error('Webhook URL is required') };
        }
        try {
            let payload;
            switch (provider) {
                case 'slack':
                    payload = this.buildSlackPayload({ title, message, severity, fields, mentions });
                    break;
                case 'dingtalk':
                    payload = this.buildDingTalkPayload({ title, message, severity, fields, mentions });
                    break;
                case 'discord':
                    payload = this.buildDiscordPayload({ title, message, severity, fields, mentions });
                    break;
                case 'pagerduty':
                    payload = this.buildPagerDutyPayload({ title, message, severity, fields });
                    break;
                default:
                    payload = { title, message, severity, fields, timestamp: new Date().toISOString() };
            }
            // 使用 HTTP 发送
            const https = await Promise.resolve().then(() => __importStar(require('https')));
            const { URL } = await Promise.resolve().then(() => __importStar(require('url')));
            const parsedUrl = new URL(webhookUrl);
            await new Promise((resolve, reject) => {
                const data = JSON.stringify(payload);
                const req = https.request({
                    hostname: parsedUrl.hostname,
                    path: parsedUrl.pathname + parsedUrl.search,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(data)
                    }
                }, (res) => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(undefined);
                    }
                    else {
                        reject(new Error(`HTTP ${res.statusCode}`));
                    }
                });
                req.on('error', reject);
                req.write(data);
                req.end();
            });
            return {
                success: true,
                outputs: { sent: true, provider, timestamp: new Date().toISOString() }
            };
        }
        catch (error) {
            return {
                success: false,
                error: error,
                outputs: { sent: false, error: error.message }
            };
        }
    }
    buildSlackPayload(options) {
        const { title, message, severity, fields, mentions } = options;
        const colorMap = {
            info: '#36a64f',
            warning: '#ff9900',
            error: '#ff0000',
            critical: '#990000'
        };
        return {
            text: title,
            attachments: [{
                    color: colorMap[severity] || colorMap.info,
                    text: message,
                    fields: fields.map((f) => ({
                        title: f.name,
                        value: f.value,
                        short: f.short !== false
                    })),
                    footer: 'Workflow Agent',
                    ts: Math.floor(Date.now() / 1000)
                }],
            mentions: mentions.map((m) => `<@${m}>`).join(' ')
        };
    }
    buildDingTalkPayload(options) {
        const { title, message, severity, fields } = options;
        const colorMap = {
            info: '#00ff00',
            warning: '#ff9900',
            error: '#ff0000',
            critical: '#990000'
        };
        const text = fields.map((f) => `**${f.name}**: ${f.value}`).join('\n');
        return {
            msgtype: 'markdown',
            markdown: {
                title,
                text: `## ${title}\n\n${message}\n\n${text}`
            }
        };
    }
    buildDiscordPayload(options) {
        const { title, message, severity, fields } = options;
        const colorMap = {
            info: 3066993,
            warning: 15105570,
            error: 15158332,
            critical: 10038562
        };
        return {
            embeds: [{
                    title,
                    description: message,
                    color: colorMap[severity] || colorMap.info,
                    fields: fields.map((f) => ({
                        name: f.name,
                        value: f.value,
                        inline: f.short !== false
                    })),
                    timestamp: new Date().toISOString()
                }]
        };
    }
    buildPagerDutyPayload(options) {
        const { title, message, severity, fields } = options;
        return {
            payload: {
                summary: title,
                severity: severity === 'critical' ? 'critical' : severity === 'error' ? 'error' : 'warning',
                source: 'Workflow Agent',
                custom_details: {
                    message,
                    fields: Object.fromEntries(fields.map((f) => [f.name, f.value]))
                }
            }
        };
    }
    validate(config) {
        const errors = [];
        if (!config.webhookUrl) {
            errors.push('Webhook URL is required');
        }
        if (!config.message) {
            errors.push('Message is required');
        }
        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }
}
exports.WebhookNodeExecutor = WebhookNodeExecutor;
//# sourceMappingURL=WebhookNodeExecutor.js.map