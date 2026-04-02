// quota-service.js - LINE 額度監控服務
const https = require('https');
const configLine = require('./config-line');

class QuotaService {
    constructor() {
        this.currentPushUsage = 0;
        this.lastUpdate = 0;
        this.updateInterval = 30 * 60 * 1000; // 每 30 分鐘更新一次
    }

    /**
     * 初始化並執行第一次更新
     */
    async initialize() {
        console.log('📊 正在初始化額度監控服務...');
        await this.updateUsage();
    }

    /**
     * 從 LINE API 取得本月 Push 消耗量
     */
    async updateUsage() {
        return new Promise((resolve) => {
            const options = {
                hostname: 'api.line.me',
                path: '/v2/bot/message/quota/consumption',
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${configLine.channelAccessToken}`
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        const result = JSON.parse(data);
                        this.currentPushUsage = result.totalUsage || 0;
                        this.lastUpdate = Date.now();
                        console.log(`📈 額度更新成功：本月已使用 ${this.currentPushUsage} 則 Push`);
                    } else {
                        console.error(`❌ 無法取得額度資訊：HTTP ${res.statusCode}`, data);
                    }
                    resolve();
                });
            });

            req.on('error', (e) => {
                console.error(`❌ 額度 API 請求出錯: ${e.message}`);
                resolve();
            });
            req.end();
        });
    }

    /**
     * 判斷當前是否處於 Eco 模式 (超過預值)
     */
    async isEcoMode() {
        // 如果距離上次更新超過 30 分鐘，主動更新一次
        if (Date.now() - this.lastUpdate > this.updateInterval) {
            await this.updateUsage();
        }
        
        const threshold = configLine.quotaManagement.pushThreshold || 150;
        const isEco = this.currentPushUsage >= threshold;
        
        if (isEco) {
            console.log(`⚠️ 系統目前處於 Eco 模式 (已用: ${this.currentPushUsage}, 閾值: ${threshold})`);
        }
        return isEco;
    }

    /**
     * 手動增加計數 (當發送一次 Push 後，不需要等 API 更新即可即時累加)
     */
    incrementUsage() {
        this.currentPushUsage++;
    }

    /**
     * 取得目前狀態摘要
     */
    getSummary() {
        return {
            usage: this.currentPushUsage,
            threshold: configLine.quotaManagement.pushThreshold || 150,
            isEco: this.currentPushUsage >= (configLine.quotaManagement.pushThreshold || 150),
            lastUpdate: new Date(this.lastUpdate).toLocaleString()
        };
    }
}

module.exports = new QuotaService();
