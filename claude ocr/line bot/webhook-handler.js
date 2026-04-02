// webhook-handler.js - 核心改動：流量優化與邏輯修正版 (V6.0 完整功能還原)
const fs = require('fs');
const path = require('path');
const https = require('https');
const configLine = require('./config-line');
const MessageBuilder = require('./message-builder');
const SearchService = require('./search-service');
const EditService = require('./edit-service');
const MainProcessor = require('../main-processor');
const quotaService = require('./quota-service');

class WebhookHandler {
    constructor(lineClient) {
        this.client = lineClient;
        this.messageBuilder = new MessageBuilder();
        this.searchService = new SearchService();
        this.editService = new EditService();
        this.mainProcessor = new MainProcessor();
        this.userStates = new Map();
        this.tempData = new Map();
        this.processingUsers = new Set();
    }
    
    async initialize() {
        try {
            await this.searchService.initialize();
            console.log('✅ 搜尋服務初始化完成');
            this.setupCleanupTasks();
            console.log('✅ Webhook處理器初始化完成');
        } catch (error) {
            console.error('❌ Webhook處理器初始化失敗:', error);
            throw error;
        }
    }
    
    async showLoadingAnimation(userId) {
        return new Promise((resolve) => {
            const data = JSON.stringify({
                chatId: userId,
                loadingSeconds: configLine.quotaManagement.loadingSeconds || 60
            });

            const options = {
                hostname: 'api.line.me',
                path: '/v2/bot/chat/loading/start',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${configLine.channelAccessToken}`
                }
            };

            const req = https.request(options, (res) => {
                resolve(res.statusCode === 202);
            });

            req.on('error', (e) => {
                console.error(`❌ 動畫請求失敗: ${e.message}`);
                resolve(false);
            });
            req.write(data);
            req.end();
        });
    }

    async handleMessage(event) {
        const userId = event.source.userId;
        const messageType = event.message.type;
        try {
            const userState = this.userStates.get(userId) || configLine.userStates.IDLE;
            console.log(`👤 用戶 ${userId.substring(0, 8)}... 狀態: ${userState} 訊息類型: ${messageType}`);
            
            if (messageType === 'image') {
                return await this.handleImageMessage(event);
            } else if (messageType === 'text') {
                return await this.handleTextMessage(event, userState);
            } else if (messageType === 'sticker') {
                return await this.handleStickerMessage(event);
            }
        } catch (error) {
            console.error('❌ 處理訊息失敗:', error);
        }
    }

    async getUserNickname(userId) {
        try {
            const profile = await this.client.getProfile(userId);
            return profile.displayName;
        } catch (e) {
            console.error('取得用戶資料失敗:', e);
            return '';
        }
    }

    async handleStickerMessage(event) {
        const userId = event.source.userId;
        this.userStates.set(userId, configLine.userStates.IDLE);
        const nickname = await this.getUserNickname(userId);
        const mainMenu = this.messageBuilder.buildMainMenuMessage(nickname);
        return await this.client.replyMessage(event.replyToken, mainMenu);
    }
    
    async handleImageMessage(event) {
        const userId = event.source.userId;
        const replyToken = event.replyToken;
        const messageId = event.message.id;
        
        if (this.processingUsers.has(userId)) {
            return await this.client.replyMessage(replyToken, { type: 'text', text: '⏳ 您上一張名片還在處理中，請稍候...' });
        }
        
        const isEco = await quotaService.isEcoMode();

        try {
            this.processingUsers.add(userId);
            this.userStates.set(userId, configLine.userStates.PROCESSING);

            if (isEco) {
                await this.client.replyMessage(replyToken, { type: 'text', text: configLine.messages.ecoProcessing });
            } else {
                await this.showLoadingAnimation(userId);
            }
            
            const imageBuffer = await this.downloadImage(messageId);
            const imagePath = await this.saveImage(imageBuffer, userId);
            
            const processingPromise = this.mainProcessor.processImage(imagePath, messageId);
            const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve({ timeout: true }), configLine.quotaManagement.replyTimeoutLimit));

            const result = await Promise.race([processingPromise, timeoutPromise]);

            if (result.timeout) {
                console.log(`⏰ 用戶 ${userId.substring(0,8)} 解析超時，轉為背景處理`);
                if (!isEco) {
                    try {
                        await this.client.replyMessage(replyToken, { type: 'text', text: '⏱️ 解析時間較長，稍後將會主動傳送結果給您。' });
                    } catch (e) { }
                }
                const finalResult = await processingPromise;
                if (finalResult.success) {
                    await this.sendFinalResult(userId, null, finalResult, imagePath, isEco);
                }
                return;
            }

            if (!result.success) {
                this.userStates.set(userId, configLine.userStates.IDLE);
                if (isEco) return;
                try {
                    await this.client.replyMessage(replyToken, { type: 'text', text: result.error || '辨識失敗，請重新嘗試' });
                } catch (e) {
                    await this.client.pushMessage(userId, { type: 'text', text: result.error || '辨識失敗，請重新嘗試' });
                    quotaService.incrementUsage();
                }
                return;
            }

            if (isEco) {
                this.saveToTempData(userId, result, imagePath);
                console.log(`🍃 Eco 模式：用戶 ${userId.substring(0,8)} 背景處理完成。`);
            } else {
                await this.sendFinalResult(userId, replyToken, result, imagePath, false);
            }
            
        } catch (error) {
            console.error('❌ 圖片處理失敗:', error);
            this.userStates.set(userId, configLine.userStates.IDLE);
            if (!isEco) {
                await this.client.pushMessage(userId, { type: 'text', text: configLine.messages.error });
                quotaService.incrementUsage();
            }
        } finally {
            this.processingUsers.delete(userId);
        }
    }

    async sendFinalResult(userId, replyToken, result, imagePath, isEco) {
        const { name, company } = result.data;
        let existingContact = null;

        if (name) { 
            const duplicates = await this.searchService.searchContacts(name);
            existingContact = duplicates.find(contact =>
                contact.name === name && (contact.company === company || !contact.company || !company)
            );
        }

        this.saveToTempData(userId, result, imagePath, existingContact);
        
        let message;
        if (existingContact) {
            this.userStates.set(userId, configLine.userStates.DUPLICATE_CONFIRM);
            message = this.messageBuilder.buildDuplicateConfirmMessage(existingContact, result.data);
        } else {
            this.userStates.set(userId, configLine.userStates.CONFIRMING);
            message = this.messageBuilder.buildResultMessage(result.data, isEco);
        }

        try {
            if (replyToken) {
                await this.client.replyMessage(replyToken, message);
                console.log('✅ 透過 Reply 發送成功');
            } else if (!isEco) {
                await this.client.pushMessage(userId, message);
                quotaService.incrementUsage();
                console.log('⚠️ 透過 Push 發送成功');
            }
        } catch (e) {
            console.error('發送結果訊息失敗:', e.message);
        }
    }

    saveToTempData(userId, result, imagePath, existingContact = null) {
        this.tempData.set(userId, { 
            data: result.data, 
            imagePath, 
            processingTime: result.processingTime, 
            messageId: result.messageId, 
            existingContact,
            timestamp: Date.now() 
        });
    }

    async handleTextMessage(event, userState) {
        const userId = event.source.userId;
        const text = event.message.text.trim();
        const lowerCaseText = text.toLowerCase();

        if (['取消', '結束', 'exit', 'cancel', '主選單', '選單', 'menu'].includes(lowerCaseText)) {
            this.userStates.set(userId, configLine.userStates.IDLE);
            const nickname = await this.getUserNickname(userId);
            const mainMenu = this.messageBuilder.buildMainMenuMessage(nickname);
            return await this.client.replyMessage(event.replyToken, mainMenu);
        }

        switch (userState) {
            case configLine.userStates.CONFIRMING:
                return await this.handleConfirmCommand(event, text);
            case configLine.userStates.DUPLICATE_CONFIRM:
                return await this.handleDuplicateConfirmCommand(event, text);
            case configLine.userStates.EDITING:
                return await this.handleEditSelection(event, text);
            case configLine.userStates.AWAITING_INPUT:
                return await this.handleNewValueInput(event, text);
            case configLine.userStates.SEARCHING:
                if (lowerCaseText.startsWith('查看')) {
                    const rowIndexStr = text.substring(2).trim();
                    const rowIndex = parseInt(rowIndexStr, 10);
                    if (isNaN(rowIndex)) { return await this.client.replyMessage(event.replyToken, { type: 'text', text: '指令格式錯誤，請輸入：「查看123」' }); }
                    const contact = await this.searchService.getContactById(rowIndex);
                    if (contact) {
                        const detailMessage = this.messageBuilder.buildContactDetail(contact);
                        return await this.client.replyMessage(event.replyToken, detailMessage);
                    } else {
                        return await this.client.replyMessage(event.replyToken, { type: 'text', text: `找不到編號為 ${rowIndex} 的聯絡人。`, quickReply: this.messageBuilder.cancelSearchQuickReply });
                    }
                }
                const results = await this.searchService.searchContacts(text);
                const searchMessage = this.messageBuilder.buildSearchResults(results, text);
                return await this.client.replyMessage(event.replyToken, searchMessage);
        }

        if (lowerCaseText === '搜尋') {
            this.userStates.set(userId, configLine.userStates.SEARCHING);
            const promptMessage = this.messageBuilder.buildSearchPromptMessage();
            return await this.client.replyMessage(event.replyToken, promptMessage);
        }
        
        if (text === '名片總覽') {
            const sheetUrl = this.mainProcessor.storageService.getSheetsUrl();
            const overviewMessage = this.messageBuilder.buildOverviewMessage(sheetUrl);
            return await this.client.replyMessage(event.replyToken, overviewMessage);
        }

        if (text === '我的統計') {
            const stats = await this.searchService.generateUserStats(userId);
            const statsMessage = this.messageBuilder.buildStatsMessage(stats);
            return await this.client.replyMessage(event.replyToken, statsMessage);
        }

        const nickname = await this.getUserNickname(userId);
        const mainMenu = this.messageBuilder.buildMainMenuMessage(nickname);
        return await this.client.replyMessage(event.replyToken, mainMenu);
    }
    
    async handleConfirmCommand(event, text) {
        if (text === '儲存') {
            return await this.executeSave(event);
        } else if (text === '編輯') {
            const userId = event.source.userId;
            const tempData = this.tempData.get(userId);
            if (!tempData) return this.replySessionExpired(event.replyToken);
            this.userStates.set(userId, configLine.userStates.EDITING);
            const editMenu = this.messageBuilder.buildEditMenu(tempData.data);
            return await this.client.replyMessage(event.replyToken, editMenu);
        } else if (text === '重新識別') {
            return await this.executeReset(event);
        } else {
            return await this.client.replyMessage(event.replyToken, { type: 'text', text: '請點選下方的按鈕操作。' });
        }
    }
    
    async handleDuplicateConfirmCommand(event, text) {
        const userId = event.source.userId;
        const tempData = this.tempData.get(userId);
        if (!tempData) return this.replySessionExpired(event.replyToken);

        if (text.startsWith('更新')) {
            const rowIndex = parseInt(text.replace('更新', '').trim(), 10);
            if (!isNaN(rowIndex)) {
                return await this.executeUpdate(event, rowIndex);
            }
        } else if (text === '強制新增') {
            this.userStates.set(userId, configLine.userStates.CONFIRMING);
            const resultMessage = this.messageBuilder.buildResultMessage(tempData.data);
            return await this.client.replyMessage(event.replyToken, resultMessage);
        }
        
        const duplicateMessage = this.messageBuilder.buildDuplicateConfirmMessage(tempData.existingContact, tempData.data);
        return await this.client.replyMessage(event.replyToken, duplicateMessage);
    }
    
    async handleEditSelection(event, text) {
        const userId = event.source.userId;
        const fieldKey = this.editService.getFieldKeyByLabel(text);
        const tempData = this.tempData.get(userId);
        if (!tempData) return this.replySessionExpired(event.replyToken);
        if (fieldKey) {
            tempData.editingField = { key: fieldKey, label: text };
            this.userStates.set(userId, configLine.userStates.AWAITING_INPUT);
            const currentValue = tempData.data[fieldKey] || '(無)';
            return await this.client.replyMessage(event.replyToken, { type: 'text', text: `📝 請輸入新的「${text}」內容：\n(目前為: ${currentValue})` });
        } else if (text === '儲存') {
            return await this.executeSave(event);
        } else if (text === '重新識別' || text === '放棄修改') {
            return await this.executeReset(event);
        } else {
            const editMenu = this.messageBuilder.buildEditMenu(tempData.data);
            return await this.client.replyMessage(event.replyToken, editMenu);
        }
    }
    
    async handleNewValueInput(event, text) {
        const userId = event.source.userId;
        const tempData = this.tempData.get(userId);
        if (!tempData || !tempData.editingField) return this.replySessionExpired(event.replyToken);
        const { key, label } = tempData.editingField;
        const updateResult = this.editService.updateField(tempData.data, key, text);
        if (updateResult.success) {
            tempData.data = updateResult.data;
            delete tempData.editingField;
            this.userStates.set(userId, configLine.userStates.EDITING);
            const updatedMessage = this.messageBuilder.buildUpdatedResult(label, text);
            return await this.client.replyMessage(event.replyToken, updatedMessage);
        } else {
            return await this.client.replyMessage(event.replyToken, { type: 'text', text: `❌ 輸入無效：${updateResult.error}\n\n請重新輸入新的「${label}」內容：` });
        }
    }
    
    async executeSave(event) {
        const userId = event.source.userId;
        const tempData = this.tempData.get(userId);
        if (!tempData) return this.replySessionExpired(event.replyToken);
        
        try {
            const profile = await this.client.getProfile(userId);
            const userInfo = { userId, displayName: profile.displayName };
            
            // 重要：這裡使用的 tempData.imagePath 必須是有效的
            const driveResult = await this.mainProcessor.storageService.uploadToDrive(tempData.imagePath, tempData.data, userInfo);
            await this.mainProcessor.storageService.writeToSheets(tempData.data, driveResult, tempData.processingTime, tempData.imagePath, userInfo, tempData.messageId);
            
            await this.client.replyMessage(event.replyToken, this.messageBuilder.buildSaveSuccessMessage(driveResult.webViewLink));
            await this.searchService.refreshCache();

        } catch (error) {
            console.error('❌ 儲存流程失敗:', error);
            await this.client.pushMessage(userId, this.messageBuilder.buildSaveFailedMessage(error.message));
            quotaService.incrementUsage();
        } finally {
            this.cleanupTempData(userId);
        }
    }

    async executeUpdate(event, rowIndex) {
        const userId = event.source.userId;
        const tempData = this.tempData.get(userId);
        if (!tempData) return this.replySessionExpired(event.replyToken);
        
        try {
            const profile = await this.client.getProfile(userId);
            const userInfo = { userId, displayName: profile.displayName };

            await this.mainProcessor.storageService.updateSheetRow(rowIndex, tempData.data, tempData.processingTime, userInfo);
            
            const successMessage = { type: 'text', text: `✅ 已成功更新 #${rowIndex} ${tempData.data.name} 的資料！`};
            await this.client.replyMessage(event.replyToken, successMessage);
            await this.searchService.refreshCache();

        } catch (error) {
            console.error('❌ 更新流程失敗:', error);
            await this.client.pushMessage(userId, { type: 'text', text: `❌ 更新失敗: ${error.message}` });
            quotaService.incrementUsage();
        } finally {
            this.cleanupTempData(userId);
        }
    }

    async executeReset(event) {
        this.cleanupTempData(event.source.userId);
        return await this.client.replyMessage(event.replyToken, { type: 'text', text: '好的，操作已取消。請重新傳送一張新的名片照片。' });
    }
    
    cleanupTempData(userId) {
        const tempData = this.tempData.get(userId);
        if (tempData && tempData.imagePath && fs.existsSync(tempData.imagePath)) {
            fs.unlinkSync(tempData.imagePath);
            console.log(`🗑️ 已刪除暫存圖片: ${tempData.imagePath}`);
        }
        this.tempData.delete(userId);
        this.userStates.set(userId, configLine.userStates.IDLE);
    }
    
    async replySessionExpired(replyToken) {
        return await this.client.replyMessage(replyToken, { type: 'text', text: configLine.messages.sessionExpired });
    }
    
    async downloadImage(messageId) {
        return new Promise((resolve, reject) => {
            const options = { hostname: 'api-data.line.me', path: `/v2/bot/message/${messageId}/content`, method: 'GET', headers: { 'Authorization': `Bearer ${configLine.channelAccessToken}` } };
            const req = https.request(options, (res) => {
                if (res.statusCode !== 200) { reject(new Error(`圖片下載失敗: ${res.statusCode}`)); return; }
                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
            });
            req.on('error', reject);
            req.end();
        });
    }
    
    async saveImage(imageBuffer, userId) {
        const timestamp = Date.now();
        const filename = `card_${userId.substring(0, 8)}_${timestamp}.jpg`;
        const imagePath = path.join(__dirname, 'temp', filename);
        const tempDir = path.join(__dirname, 'temp');
        if (!fs.existsSync(tempDir)) { fs.mkdirSync(tempDir, { recursive: true }); }
        fs.writeFileSync(imagePath, imageBuffer);
        return imagePath;
    }
    
    setupCleanupTasks() {
        setInterval(() => {
            const now = Date.now();
            this.tempData.forEach((data, userId) => {
                if (now - data.timestamp > 15 * 60 * 1000) {
                    this.cleanupTempData(userId);
                }
            });
        }, 30 * 60 * 1000);
    }
}

module.exports = WebhookHandler;
