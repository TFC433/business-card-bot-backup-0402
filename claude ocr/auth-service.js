// auth-service.js - 認證服務模組 (V2.2 雲端/本地兩用版)
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path'); // 引用 path 模組

class AuthService {
    constructor() {
        this.oauthClient = null;
    }

    // OAuth認證
    async getOAuthClient() {
        if (this.oauthClient) return this.oauthClient;

        try {
            let token, credentials;

            // 優先從環境變數讀取 (for Render)
            if (process.env.GOOGLE_OAUTH_TOKEN && process.env.GOOGLE_OAUTH_CREDENTIALS) {
                console.log('🔑 從環境變數載入 OAuth 憑證...');
                token = JSON.parse(process.env.GOOGLE_OAUTH_TOKEN);
                credentials = JSON.parse(process.env.GOOGLE_OAUTH_CREDENTIALS);
            } else { 
                // 如果沒有環境變數，則從檔案讀取 (for local development)
                console.log('🔑 從本地檔案載入 OAuth 憑證...');
                const TOKEN_PATH = path.join(__dirname, 'oauth-token.json');
                const CREDENTIALS_PATH = path.join(__dirname, 'oauth-credentials.json');
                if (!fs.existsSync(TOKEN_PATH) || !fs.existsSync(CREDENTIALS_PATH)) {
                    throw new Error('OAuth憑證檔案或環境變數不存在');
                }
                token = JSON.parse(fs.readFileSync(TOKEN_PATH));
                credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
            }
            
            const { client_secret, client_id, redirect_uris } = credentials.installed;
            this.oauthClient = new google.auth.OAuth2(
                client_id, 
                client_secret, 
                redirect_uris ? redirect_uris[0] : 'urn:ietf:wg:oauth:2.0:oob'
            );
            
            this.oauthClient.setCredentials(token);
            return this.oauthClient;
            
        } catch (error) {
            console.error('❌ OAuth認證失敗:', error.message);
            return null;
        }
    }

    // 檢查認證狀態
    checkAuthFiles() {
        const checks = [];
        
        // 檢查環境變數
        if (process.env.GOOGLE_OAUTH_TOKEN && process.env.GOOGLE_OAUTH_CREDENTIALS) {
             checks.push({ type: 'oauth', status: true, message: '✅ OAuth憑證 (來自環境變數)' });
        } else {
            // 檢查本地檔案
            const oauthTokenPath = path.join(__dirname, 'oauth-token.json');
            const oauthCredsPath = path.join(__dirname, 'oauth-credentials.json');
            if (fs.existsSync(oauthTokenPath) && fs.existsSync(oauthCredsPath)) {
                checks.push({ type: 'oauth', status: true, message: '✅ OAuth憑證 (來自本地檔案)' });
            } else {
                checks.push({ type: 'oauth', status: false, message: '❌ OAuth憑證 - 請執行 node simple-oauth-fix.js' });
            }
        }

        // 檢查服務帳戶
        if (process.env.GOOGLE_SERVICE_CREDENTIALS) {
            checks.push({ type: 'service', status: true, message: '✅ 服務帳戶憑證 (來自環境變數)' });
        } else {
            const serviceCredsPath = path.join(__dirname, 'credentials.json');
            if (fs.existsSync(serviceCredsPath)) {
                checks.push({ type: 'service', status: true, message: '✅ 服務帳戶憑證 (來自本地檔案)' });
            } else {
                checks.push({ type: 'service', status: false, message: '⚠️ 服務帳戶憑證 - 可選' });
            }
        }
        
        return checks;
    }

    // 檢查Vision API認證方式
    checkVisionAuth(apiKey) {
        const methods = [];

        // 服務帳戶
        if (process.env.GOOGLE_SERVICE_CREDENTIALS || fs.existsSync(path.join(__dirname, 'credentials.json'))) {
             methods.push({ type: 'service_account', available: true });
        }
        
        // API Key
        if (apiKey && apiKey !== 'YOUR_VISION_API_KEY') {
            methods.push({ type: 'api_key', available: true });
        }
        
        return methods;
    }
}

module.exports = AuthService;