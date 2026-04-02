// simple-oauth-fix.js - Google OAuth 2.0 授權修復工具 (V3.0 - 強制 OOB)
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// --- 設定 ---
const CREDENTIALS_PATH = path.join(__dirname, 'oauth-credentials.json');
const TOKEN_PATH = path.join(__dirname, 'oauth-token.json');
const SCOPES = [
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/spreadsheets'
];

/**
 * 主要授權函式
 */
async function authorize() {
    console.log('🚀 啟動 Google 授權修復工具 (V3.0)...');

    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.error('❌ 錯誤：找不到 oauth-credentials.json 檔案！');
        return;
    }

    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH));
    const { client_secret, client_id } = credentials.installed;
    
    // 關鍵修正：直接指定 'oob' (Out-of-Band) 作為重新導向 URI，忽略憑證檔中的設定
    const oAuth2Client = new google.auth.OAuth2(
        client_id, 
        client_secret, 
        'urn:ietf:wg:oauth:2.0:oob'
    );

    const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });

    console.log('\n================================================================');
    console.log('請在您的瀏覽器中開啟以下網址，並完成授權：');
    console.log(authUrl);
    console.log('================================================================\n');

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    rl.question('授權完成後，Google 會提供一組授權碼 (Code)，請將它完整地貼到這裡，然後按下 Enter：\n> ', async (code) => {
        rl.close();
        if (!code || code.trim() === '') {
            console.error('❌ 未輸入授權碼，程序已終止。');
            return;
        }

        try {
            console.log('\n正在用授權碼交換 Token...');
            const { tokens } = await oAuth2Client.getToken(code.trim());
            fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
            console.log('✅ Token 已成功儲存至:', TOKEN_PATH);
            console.log('\n🎉 授權修復完成！您現在可以重新啟動您的名片機器人了。');

        } catch (err) {
            console.error('❌ 交換 Token 時發生錯誤:', err.message);
            console.log('請檢查您是否複製了正確且完整的授權碼。');
        }
    });
}

// 執行主函式
authorize().catch(console.error);