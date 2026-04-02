// config-line.js - LINE Bot專用設定檔 (V6.0 流量優化與邏輯修正版)
require('dotenv').config();

module.exports = {
    // LINE Bot 基本設定
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
    botBasicId: process.env.LINE_BOT_BASIC_ID || '@462ayymt',
    channelId: process.env.LINE_CHANNEL_ID || '2007917224',
    
    // Webhook 設定
    port: process.env.WEBHOOK_PORT || 3000,
    webhookUrl: process.env.WEBHOOK_URL,

    // [新增] 流量管控與體驗設定
    quotaManagement: {
        pushThreshold: 150,          // 到達 150 則時進入 Eco 模式
        loadingSeconds: 60,         // 讀取動畫持續時間 (5-60)
        replyTimeoutLimit: 55000     // 55秒超時競爭判斷 (毫秒)
    },
    
    // 功能開關
    features: {
        enableSearch: true,
        enableEdit: true,
        enableStats: true,
        enableBatch: false
    },
    
    // 使用限制
    limits: {
        dailyProcessLimit: 150,
        searchResultLimit: 10,
        editTimeoutMinutes: 10,
        maxRetries: 2
    },
    
    // 訊息範本
    messages: {
        welcome: `👋 歡迎使用AI名片識別助手！\n\n請傳送名片照片，或點擊下方選單開始操作。`,
        help: `🤖 您好！\n\n我可以為您掃描名片、搜尋聯絡人。\n請點擊下方主選單中的按鈕進行操作，或輸入「選單」隨時呼叫此選單。`,
        processing: `📸 收到名片照片，處理中...`,
        ecoProcessing: `⏳ 名片處理中... (當前為：省電模式 🍃)\n\n由於本月額度將盡，辨識完成後系統不會主動噴出結果。請於 1 分鐘後點擊選單「查看最新結果」領取您的資料。`,
        error: `❌ 處理失敗\n\n💡 請確保照片清晰、光線充足且平整。\n\n🔄 請重新拍攝上傳。`,
        sessionExpired: `抱歉，操作已逾時，請重新傳送名片。`
    },
    
    // 狀態定義
    userStates: {
        IDLE: 'idle',
        PROCESSING: 'processing',
        CONFIRMING: 'confirming',
        EDITING: 'editing',
        AWAITING_INPUT: 'awaiting_input',
        SEARCHING: 'searching',
        DUPLICATE_CONFIRM: 'duplicate_confirm'
    },
    
    // 操作按鈕定義
    actions: {
        SAVE: ['儲存', '✅', '正確', '確認'],
        EDIT: ['修改', '✏️', '編輯', '更正'],
        RETRY: ['重新識別', '🔄', '重試', '再試一次'],
        SEARCH: ['搜尋', '🔍', '查找', '找'],
        HELP: ['說明', '❓', '幫助', '使用說明']
    },
    
    // 快取設定
    cache: {
        searchCacheMinutes: 5,
        userStateTimeoutMinutes: 30,
        tempDataTimeoutMinutes: 15
    }
};
