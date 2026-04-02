// line-bot.js - LINE Bot主程式 (V6.0 支援額度監控完整版)
const express = require('express');
const line = require('@line/bot-sdk');
const fs = require('fs');
const path = require('path');

const configLine = require('./config-line');
const WebhookHandler = require('./webhook-handler');
const quotaService = require('./quota-service');

class LineBotServer {
    constructor() {
        this.app = express();
        this.port = configLine.port;
        
        this.config = {
            channelAccessToken: configLine.channelAccessToken,
            channelSecret: configLine.channelSecret,
        };
        
        this.client = new line.Client(this.config);
        this.webhookHandler = new WebhookHandler(this.client);
        
        this.setupMiddleware();
        this.setupRoutes();
        this.setupErrorHandling();
    }
    
    setupMiddleware() {
        this.app.use((req, res, next) => {
            console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
            next();
        });
    }
    
    setupRoutes() {
        this.app.get('/', (req, res) => res.json({ status: 'ok' }));
        this.app.get('/quota', (req, res) => res.json(quotaService.getSummary()));
        
        this.app.post('/webhook', line.middleware(this.config), async (req, res) => {
            try {
                console.log('📨 收到Webhook事件');
                const events = req.body.events;
                
                if (!events || events.length === 0) {
                    return res.status(200).json({ message: 'No events' });
                }
                
                console.log(`🎯 處理 ${events.length} 個事件`);
                
                const promises = events.map(event => this.handleEvent(event));
                await Promise.all(promises);
                
                res.status(200).json({ message: 'OK' });
                
            } catch (error) {
                console.error('❌ Webhook處理錯誤:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    }
    
    async handleEvent(event) {
        console.log(`🎯 處理事件類型: ${event.type}`);
        try {
            switch (event.type) {
                case 'message':
                    return await this.webhookHandler.handleMessage(event);
                case 'follow':
                    if (this.webhookHandler.handleFollow) {
                        return await this.webhookHandler.handleFollow(event);
                    }
                    return null;
                default:
                    return null;
            }
        } catch (error) {
            console.error(`❌ 處理事件失敗:`, error);
        }
    }
    
    setupErrorHandling() {
        this.app.use((error, req, res, next) => {
            console.error('❌ 伺服器錯誤:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        });
    }
    
    async start() {
        try {
            if (!configLine.channelAccessToken || !configLine.channelSecret) {
                throw new Error('LINE憑證未設定，請檢查.env檔案');
            }
            const tempDir = path.join(__dirname, 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            await this.webhookHandler.initialize();
            await quotaService.initialize();

            this.app.listen(this.port, () => {
                console.log('🚀 LINE Bot伺服器啟動成功!');
                console.log(`📍 服務地址: http://localhost:${this.port}`);
            });
            
        } catch (error) {
            console.error('❌ 啟動失敗:', error.message);
            process.exit(1);
        }
    }
}

if (require.main === module) {
    const bot = new LineBotServer();
    bot.start();
}

module.exports = LineBotServer;
