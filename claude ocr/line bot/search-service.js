// search-service.js - 搜尋服務 (V3.0 修復認證問題版本)
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const configLine = require('./config-line');

class SearchService {
    constructor() {
        this.cache = new Map();
        this.lastCacheUpdate = 0;
        this.cacheTimeout = configLine.cache.searchCacheMinutes * 60 * 1000;
        this.sheets = null;
        this.isInitialized = false;
    }
    
    async initialize() {
        try {
            console.log('🚀 初始化搜尋服務...');
            
            // === 修復處1：直接建立認證，避免使用 AuthService ===
            const CREDENTIALS_PATH = path.join(__dirname, '..', 'oauth-credentials.json');
            const TOKEN_PATH = path.join(__dirname, '..', 'oauth-token.json');
            
            console.log('🔍 檢查憑證文件路徑:');
            console.log('   Credentials:', CREDENTIALS_PATH);
            console.log('   Token:', TOKEN_PATH);
            
            // 檢查文件是否存在
            if (!fs.existsSync(CREDENTIALS_PATH)) {
                throw new Error(`找不到憑證文件: ${CREDENTIALS_PATH}`);
            }
            
            if (!fs.existsSync(TOKEN_PATH)) {
                throw new Error(`找不到Token文件: ${TOKEN_PATH}`);
            }
            
            // === 修復處2：讀取並驗證憑證內容 ===
            const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
            const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
            
            if (!credentials.installed) {
                throw new Error('oauth-credentials.json 格式錯誤：缺少 installed 節點');
            }
            
            const { client_secret, client_id, redirect_uris } = credentials.installed;
            
            console.log('📋 使用的 Client ID:', client_id);
            console.log('🔑 Token 到期時間:', token.expiry_date ? new Date(token.expiry_date) : '無');
            
            // === 修復處3：建立 OAuth2 客戶端 ===
            const oAuth2Client = new google.auth.OAuth2(
                client_id, 
                client_secret, 
                redirect_uris ? redirect_uris[0] : 'urn:ietf:wg:oauth:2.0:oob'
            );
            
            oAuth2Client.setCredentials(token);
            
            // === 修復處4：測試認證是否有效 ===
            try {
                console.log('🔧 測試 OAuth 認證...');
                const tokenInfo = await oAuth2Client.getAccessToken();
                console.log('✅ OAuth 認證測試成功');
            } catch (authError) {
                console.error('❌ OAuth 認證測試失敗:', authError.message);
                
                // 如果是 invalid_grant，提供具體解決方案
                if (authError.message.includes('invalid_grant')) {
                    console.log('💡 解決方案：請執行以下命令重新授權：');
                    console.log('   cd "D:\\business-card-bot\\claude ocr"');
                    console.log('   del oauth-token.json');
                    console.log('   node simple-oauth-fix.js');
                }
                
                throw new Error(`OAuth 認證無效：${authError.message}`);
            }
            
            // === 修復處5：建立 Sheets API 客戶端 ===
            this.sheets = google.sheets({ version: 'v4', auth: oAuth2Client });
            
            // === 修復處6：測試 Sheets API 連線 ===
            const config = require('../config');
            try {
                console.log('📊 測試 Google Sheets 連線...');
                const testResponse = await this.sheets.spreadsheets.get({
                    spreadsheetId: config.SPREADSHEET_ID,
                    fields: 'properties.title'
                });
                console.log('✅ Google Sheets 連線測試成功:', testResponse.data.properties.title);
            } catch (sheetsError) {
                console.error('❌ Google Sheets 連線測試失敗:', sheetsError.message);
                
                // 提供具體的錯誤診斷
                if (sheetsError.code === 404) {
                    console.log('💡 錯誤原因：找不到指定的試算表');
                    console.log('   請檢查 config.js 中的 SPREADSHEET_ID 是否正確');
                } else if (sheetsError.code === 403) {
                    console.log('💡 錯誤原因：沒有存取權限');
                    console.log('   請確認 Google 帳戶有該試算表的編輯權限');
                }
                
                throw sheetsError;
            }
            
            // === 修復處7：初始化快取 ===
            await this.refreshCache();
            this.isInitialized = true;
            console.log('✅ 搜尋服務初始化完成');
            
        } catch (error) {
            console.error('❌ 搜尋服務初始化失敗:', error.message);
            console.log('⚠️ 搜尋功能將暫時停用，名片識別功能仍可正常使用');
            
            // 不拋出錯誤，讓其他功能可以繼續運作
            this.isInitialized = false;
        }
    }
    
    // === 新增：檢查服務是否可用 ===
    isServiceAvailable() {
        return this.isInitialized && this.sheets !== null;
    }
    
    async searchContacts(keyword) {
        try {
            // 檢查服務是否可用
            if (!this.isServiceAvailable()) {
                console.log('⚠️ 搜尋服務未初始化，返回空結果');
                return [];
            }
            
            const now = Date.now();
            if (now - this.lastCacheUpdate > this.cacheTimeout) {
                await this.refreshCache();
            }
            
            const allContacts = this.cache.get('allContacts') || [];
            if (allContacts.length === 0) { 
                console.log('📋 搜尋快取為空');
                return []; 
            }
            
            const results = this.performSearch(allContacts, keyword);
            console.log(`🔍 搜尋「${keyword}」找到 ${results.length} 筆結果`);
            return results.slice(0, configLine.limits.searchResultLimit);
            
        } catch (error) {
            console.error('❌ 搜尋失敗:', error);
            return [];
        }
    }
    
    performSearch(contacts, keyword) {
        const lowerKeyword = keyword.toLowerCase();
        const results = [];
        
        contacts.forEach(contact => {
            let score = 0;
            const fieldsToSearch = ['name', 'company', 'position', 'department', 'phone', 'mobile', 'email', 'address'];
            
            for (const field of fieldsToSearch) {
                const value = contact[field];
                if (value && typeof value === 'string' && value.toLowerCase().includes(lowerKeyword)) {
                    score++;
                    
                    // 完全匹配給更高分數
                    if (value.toLowerCase() === lowerKeyword) {
                        score += 2;
                    }
                    
                    // 姓名欄位匹配給更高權重
                    if (field === 'name') {
                        score += 1;
                    }
                }
            }

            if (score > 0) {
                results.push({ ...contact, searchScore: score });
            }
        });
        
        return results.sort((a, b) => b.searchScore - a.searchScore);
    }

    async refreshCache() {
        try {
            // 檢查服務是否可用
            if (!this.sheets) {
                console.log('⚠️ Sheets API 客戶端未初始化，跳過快取更新');
                return;
            }
            
            console.log('🔄 刷新搜尋快取...');
            const config = require('../config');
            
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: config.SPREADSHEET_ID,
                range: 'A:X' // 擴展到所有欄位
            });
            
            const rows = response.data.values;
            if (!rows || rows.length <= 1) {
                console.log('📋 試算表無資料或只有表頭');
                this.cache.set('allContacts', []);
                this.lastCacheUpdate = Date.now();
                return;
            }
            
            const headers = rows[0];
            const contacts = rows.slice(1)
                .map((row, index) => this.parseContactRow(row, headers, index + 2))
                .filter(Boolean);
            
            this.cache.set('allContacts', contacts);
            this.lastCacheUpdate = Date.now();
            console.log(`✅ 快取更新完成，共 ${contacts.length} 筆聯絡人`);
            
        } catch (error) {
            console.error('❌ 刷新快取失敗:', error.message);
            
            // 根據錯誤類型提供診斷信息
            if (error.code === 403) {
                console.log('💡 可能原因：OAuth Token 已過期，請重新授權');
            } else if (error.code === 404) {
                console.log('💡 可能原因：試算表ID不正確或已被刪除');
            }
        }
    }

    parseContactRow(row, headers, rowIndex) {
        const contact = { rowIndex };
        
        // 更完整的欄位映射
        const fieldMapping = {
            '時間': 'createdTime', 
            '姓名': 'name', 
            '公司': 'company', 
            '職位': 'position', 
            '部門': 'department', 
            '電話': 'phone', 
            '手機': 'mobile', 
            '傳真': 'fax', 
            '電子郵件': 'email', 
            '網址': 'website', 
            '地址': 'address', 
            '信心度': 'confidence',
            '處理時間': 'processingTime',
            'Drive連結': 'driveLink', 
            '智慧檔名': 'smartFilename',
            '本地路徑': 'localPath',
            '原始文字': 'rawText',
            'AI解析': 'aiParsing',
            'AI信心度': 'aiConfidence',
            '資料來源': 'dataSource',
            'LINE用戶ID': 'userId', 
            '用戶暱稱': 'userNickname',
            '用戶標籤': 'userTag',
            '原始ID': 'originalId'
        };
        
        headers.forEach((header, index) => {
            if (fieldMapping[header]) {
                contact[fieldMapping[header]] = row[index] || '';
            }
        });
        
        // 只有姓名或公司有值才視為有效聯絡人
        return (contact.name || contact.company) ? contact : null;
    }

    async getContactById(rowIndex) {
        try {
            if (!this.isServiceAvailable()) {
                return null;
            }
            
            const allContacts = this.cache.get('allContacts') || [];
            return allContacts.find(contact => contact.rowIndex === rowIndex);
        } catch (error) {
            console.error('❌ 取得聯絡人詳細資料失敗:', error);
            return null;
        }
    }
    
    async generateUserStats(userId) {
        try {
            if (!this.isServiceAvailable()) {
                return { total: 0, error: '搜尋服務未初始化' };
            }
            
            await this.refreshCache(); // 確保數據最新
            const allContacts = this.cache.get('allContacts') || [];
            const userContacts = allContacts.filter(c => c.userId === userId);

            if (userContacts.length === 0) {
                return { total: 0 };
            }

            // 統計公司分布
            const companyCounts = userContacts.reduce((acc, contact) => {
                if (contact.company) {
                    acc[contact.company] = (acc[contact.company] || 0) + 1;
                }
                return acc;
            }, {});

            const topCompanies = Object.entries(companyCounts)
                .sort(([, a], [, b]) => b - a)
                .slice(0, 3)
                .map(([name, count]) => ({ name, count }));

            // 按時間排序
            const sortedByDate = userContacts.sort((a, b) => 
                new Date(a.createdTime) - new Date(b.createdTime)
            );

            // 計算使用頻率（最近30天）
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const recentContacts = userContacts.filter(contact => 
                new Date(contact.createdTime) > thirtyDaysAgo
            );

            return {
                total: userContacts.length,
                recentCount: recentContacts.length,
                topCompanies,
                firstScanDate: sortedByDate[0]?.createdTime,
                lastScanDate: sortedByDate[sortedByDate.length - 1]?.createdTime,
                averageConfidence: this.calculateAverageConfidence(userContacts)
            };
            
        } catch (error) {
            console.error('❌ 生成用戶統計失敗:', error);
            return { total: 0, error: error.message };
        }
    }
    
    // === 新增：計算平均信心度 ===
    calculateAverageConfidence(contacts) {
        const validConfidences = contacts
            .map(c => parseFloat(c.confidence))
            .filter(c => !isNaN(c) && c > 0);
            
        if (validConfidences.length === 0) return 0;
        
        const sum = validConfidences.reduce((acc, conf) => acc + conf, 0);
        return Math.round(sum / validConfidences.length);
    }
    
    // === 新增：健康檢查方法 ===
    async healthCheck() {
        const status = {
            initialized: this.isInitialized,
            sheetsConnected: this.sheets !== null,
            cacheSize: this.cache.get('allContacts')?.length || 0,
            lastUpdate: this.lastCacheUpdate ? new Date(this.lastCacheUpdate) : null
        };
        
        if (this.isServiceAvailable()) {
            try {
                const config = require('../config');
                await this.sheets.spreadsheets.get({
                    spreadsheetId: config.SPREADSHEET_ID,
                    fields: 'properties.title'
                });
                status.apiTest = 'success';
            } catch (error) {
                status.apiTest = 'failed';
                status.apiError = error.message;
            }
        } else {
            status.apiTest = 'not_available';
        }
        
        return status;
    }
}

module.exports = SearchService;