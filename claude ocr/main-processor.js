// main-processor.js - 主程式協調器 (重構版)
const fs = require('fs');
const path = require('path');
const config = require('./config');
const AuthService = require('./auth-service');
const OCRService = require('./ocr-service');
const CardParser = require('./card-parser');
const StorageService = require('./storage-service');

// 動態載入AI解析器（避免沒有檔案時出錯）
let AIParser = null;
try {
    AIParser = require('./ai-parser');
} catch (error) {
    console.log('ℹ️ AI解析器模組未找到，將使用傳統解析');
}

class MainProcessor {
    constructor() {
        this.authService = new AuthService();
        this.ocrService = new OCRService();
        this.cardParser = new CardParser();
        this.storageService = new StorageService(this.authService);
        
        // 初始化AI解析器（如果可用）
        this.aiParser = null;
        if (AIParser && config.GEMINI_ENABLED) {
            try {
                this.aiParser = new AIParser();
                console.log('🤖 AI解析器已載入');
            } catch (error) {
                console.log('⚠️ AI解析器初始化失敗:', error.message);
            }
        }
    }

    // ==================== [新增函式 1/2] ====================
    /**
     * 步驟1：處理圖片辨識
     * 接收圖片路徑，執行OCR與解析，並回傳結果物件。
     * @param {string} imagePath - 圖片的本地路徑
     * @param {string} messageId - LINE 訊息的原始 ID
     * @returns {Promise<object|null>} - 包含辨識結果的物件
     */
    async processImage(imagePath, messageId) {
        const startTime = Date.now();
        try {
            console.log('🚀 開始圖片辨識流程...');
            console.log('📷 圖片路徑：', imagePath);

            if (!fs.existsSync(imagePath)) {
                throw new Error('找不到圖片檔案');
            }
            
            // 步驟1: Vision API OCR識別
            const visionResult = await this.ocrService.recognizeText(imagePath);
            const { fullText, detections } = this.ocrService.extractText(visionResult);
            
            // 步驟2: 智慧解析 (傳統 + AI)
            let finalResult;
            if (this.aiParser && config.GEMINI_ENABLED) {
                finalResult = await this.performDualParsing(fullText, detections);
            } else {
                console.log('⚙️ 使用傳統解析器');
                finalResult = this.cardParser.parse(fullText, detections);
                finalResult.source = 'traditional-only';
            }

            const processingTime = (Date.now() - startTime) / 1000;

            console.log('✅ 圖片辨識完成！');
            this.displayResult(finalResult, null, processingTime); // 暫時顯示結果，此時還沒有 Drive 連結

            // 回傳包含所有必要資訊的物件
            return {
                success: true,
                data: finalResult,
                processingTime,
                messageId
            };

        } catch (error) {
            console.error('❌ 圖片辨識失敗:', error.message);
            return { success: false, error: error.message };
        }
    }
    // ======================================================

    // ==================== [新增函式 2/2] ====================
    /**
     * 步驟2：儲存最終資料
     * 接收確認後的資料，執行上傳 Drive 和寫入 Sheets 的操作。
     * @param {object} params - 包含所有儲存所需資訊的物件
     * @param {object} params.finalData - 最終確認或編輯後的資料
     * @param {string} params.imagePath - 圖片的本地路徑
     * @param {object} params.userInfo - LINE 使用者資訊 { userId, displayName }
     * @param {string} params.messageId - LINE 訊息的原始 ID
     * @param {number} params.processingTime - 辨識過程花費的時間
     * @returns {Promise<object|null>} - 包含儲存結果的物件
     */
    async saveData({ finalData, imagePath, userInfo, messageId, processingTime }) {
        try {
            console.log('💾 開始儲存資料流程...');
            
            // 步驟1: 上傳到Google Drive (此函式將在下一步被修改)
            const driveResult = await this.storageService.uploadToDrive(imagePath, finalData, userInfo);

            // 步驟2: 寫入Google Sheets (此函式將在下一步被修改)
            await this.storageService.writeToSheets(finalData, driveResult, processingTime, imagePath, userInfo, messageId);

            console.log('✅ 資料儲存成功！');
            this.displayResult(finalData, driveResult, processingTime);

            return {
                success: true,
                driveLink: driveResult ? driveResult.webViewLink : null
            };

        } catch (error) {
            console.error('❌ 資料儲存失敗:', error.message);
            return { success: false, error: error.message };
        }
    }
    // ======================================================

    // (原有的 processBusinessCard 函式已被上述兩個新函式取代)

    // 執行雙重解析 (傳統 + AI) - 保持不變
    async performDualParsing(fullText, detections) {
        // ... 此函式內部邏輯保持不變 ...
        console.log('🔄 執行雙重解析策略...');
        
        let traditionalResult = null;
        let aiResult = null;
        
        const [traditionalPromise, aiPromise] = await Promise.allSettled([
            Promise.resolve().then(() => {
                console.log('⚙️ 執行傳統語義解析...');
                return this.cardParser.parse(fullText, detections);
            }),
            this.aiParser.parseBusinessCard(fullText, detections)
        ]);
        
        if (traditionalPromise.status === 'fulfilled') {
            traditionalResult = traditionalPromise.value;
            console.log(`✅ 傳統解析完成，信心度: ${traditionalResult.confidence}%`);
        } else {
            console.error('❌ 傳統解析失敗:', traditionalPromise.reason);
        }
        
        if (aiPromise.status === 'fulfilled') {
            aiResult = aiPromise.value;
            if (aiResult) {
                console.log(`🤖 AI解析完成，信心度: ${aiResult.confidence}%`);
            } else {
                console.log('⚠️ AI解析返回空結果');
            }
        } else {
            console.error('❌ AI解析失敗:', aiPromise.reason);
        }
        
        if (config.GEMINI_FUSION_MODE && aiResult && traditionalResult) {
            console.log('🔀 融合AI與傳統解析結果...');
            return this.fuseResults(aiResult, traditionalResult);
        } else if (aiResult) {
            console.log('🤖 使用AI解析結果');
            return aiResult;
        } else if (traditionalResult) {
            console.log('⚙️ 使用傳統解析結果');
            traditionalResult.source = 'traditional-fallback';
            return traditionalResult;
        } else {
            console.error('❌ 所有解析方法都失敗');
            return {
                name: '', company: '', position: '', department: '',
                phone: '', mobile: '', fax: '', email: '', website: '', address: '',
                confidence: 0, rawText: fullText, source: 'parsing-failed'
            };
        }
    }

    // 融合兩種解析結果 - 保持不變
    fuseResults(aiResult, traditionalResult) {
        // ... 此函式內部邏輯保持不變 ...
        if (!this.aiParser || !this.aiParser.fuseWithTraditionalParser) {
            return this.simpleFusion(aiResult, traditionalResult);
        }
        return this.aiParser.fuseWithTraditionalParser(aiResult, traditionalResult);
    }

    // 簡單的結果融合邏輯 - 保持不變
    simpleFusion(aiResult, traditionalResult) {
        // ... 此函式內部邏輯保持不變 ...
        const fused = {
            name: this.selectBetter(aiResult.name, traditionalResult.name),
            company: this.selectBetter(aiResult.company, traditionalResult.company),
            position: this.selectBetter(aiResult.position, traditionalResult.position),
            department: this.selectBetter(aiResult.department, traditionalResult.department),
            phone: this.selectBetter(aiResult.phone, traditionalResult.phone),
            mobile: this.selectBetter(aiResult.mobile, traditionalResult.mobile),
            fax: this.selectBetter(aiResult.fax, traditionalResult.fax),
            email: this.selectBetter(aiResult.email, traditionalResult.email),
            website: this.selectBetter(aiResult.website, traditionalResult.website),
            address: this.selectBetter(aiResult.address, traditionalResult.address),
            confidence: Math.max(aiResult.confidence || 0, traditionalResult.confidence || 0),
            source: 'simple-fused',
            rawText: traditionalResult.rawText || ''
        };
        return fused;
    }

    // 選擇較好的值 - 保持不變
    selectBetter(aiValue, traditionalValue) {
        // ... 此函式內部邏輯保持不變 ...
        if (!aiValue && !traditionalValue) return '';
        if (aiValue && !traditionalValue) return aiValue;
        if (!aiValue && traditionalValue) return traditionalValue;
        return aiValue.length >= traditionalValue.length ? aiValue : traditionalValue;
    }
    
    // (原有的 batchProcessCards, systemCheck, run 等函式可以暫時保留或移除，因為它們使用的是舊的流程)

    // 顯示單張處理結果 - 保持不變
    displayResult(data, driveResult, processingTime) {
        // ... 此函式內部邏輯保持不變 ...
        console.log('\n📋 最終識別結果：');
        console.log('┌' + '─'.repeat(78) + '┐');
        console.log('👤 姓名：', data.name || '(未識別)');
        console.log('🏢 公司：', data.company || '(未識別)');
        console.log('💼 職位：', data.position || '(未識別)');
        console.log('🏛️ 部門：', data.department || '(未識別)');
        console.log('📞 電話：', data.phone || '(未識別)');
        console.log('📱 手機：', data.mobile || '(未識別)');
        console.log('📠 傳真：', data.fax || '(未識別)');
        console.log('📧 Email：', data.email || '(未識別)');
        console.log('🌐 網址：', data.website || '(未識別)');
        console.log('📍 地址：', data.address || '(未識別)');
        console.log('📈 信心度：', `${data.confidence}%`);
        if (data.source) {
            console.log('🔄 資料來源：', data.source);
        }
        console.log('⏱️ 處理時間：', `${processingTime}秒`);
        if (driveResult) {
            console.log('📁 Google Drive：', driveResult.webViewLink);
        }
        console.log('└' + '─'.repeat(78) + '┘');
    }
}

module.exports = MainProcessor;