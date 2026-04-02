// clear-auth-cache.js - 清理所有認證快取
const fs = require('fs');
const path = require('path');

console.log('🧹 清理認證快取...');

// 檢查當前憑證狀態
const CREDENTIALS_PATH = path.join(__dirname, 'oauth-credentials.json');
const TOKEN_PATH = path.join(__dirname, 'oauth-token.json');

if (fs.existsSync(CREDENTIALS_PATH)) {
    const creds = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));
    console.log('📋 當前 oauth-credentials.json Client ID:', creds.installed.client_id);
} else {
    console.log('❌ oauth-credentials.json 不存在');
}

if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
    console.log('🔑 當前 oauth-token.json 有效期:', new Date(token.expiry_date));
    console.log('🔄 Refresh Token 前綴:', token.refresh_token ? token.refresh_token.substring(0, 20) + '...' : '無');
} else {
    console.log('❌ oauth-token.json 不存在');
}

// 清理可能的快取目錄
const possibleCacheDirs = [
    path.join(require('os').homedir(), '.google'),
    path.join(require('os').tmpdir(), 'google-nodejs-auth'),
    path.join(__dirname, 'node_modules', '.cache')
];

possibleCacheDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
        console.log(`🗑️ 發現快取目錄: ${dir}`);
        try {
            fs.rmSync(dir, { recursive: true, force: true });
            console.log(`✅ 已清理: ${dir}`);
        } catch (error) {
            console.log(`⚠️ 無法清理: ${dir} - ${error.message}`);
        }
    }
});

// 檢查環境變數
if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log('🔍 發現 GOOGLE_APPLICATION_CREDENTIALS 環境變數:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
    console.log('💡 建議清除此環境變數，避免衝突');
}

console.log('🎉 快取清理完成！請重新啟動應用程式。');