// config.js - 系統設定檔 (支援Gemini AI)
// 確保能夠讀取 .env 檔案
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

module.exports = {
    // Google服務設定
    SPREADSHEET_ID: process.env.SPREADSHEET_ID,
    DRIVE_FOLDER_ID: process.env.DRIVE_FOLDER_ID,
    
    // Vision API設定
    VISION_API_KEY: process.env.VISION_API_KEY,
    
    // Gemini AI設定
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_MODELS: {
        primary: "gemini-2.5-flash",
        fallbacks: [
            "gemini-2.5-flash-lite",
            "gemini-2.0-flash",
            "gemini-2.0-flash-lite"
        ]
    },
    GEMINI_ENABLED: true, // 是否啟用AI解析
    GEMINI_FUSION_MODE: true, // 是否融合AI與傳統解析結果
    
    // AI解析設定
    AI_RATE_LIMIT_DELAY: 12000, // 請求間隔毫秒 (12秒 = 每分鐘5次)
    AI_MAX_RETRIES: 2, // API失敗重試次數
    AI_TIMEOUT: 30000, // API超時時間毫秒
    
    // 支援的圖片格式
    SUPPORTED_FORMATS: ['.jpg', '.jpeg', '.png', '.gif', '.bmp'],
    
    // 處理設定
    BATCH_DELAY: 2000, // 批次處理間隔(毫秒)
    
    // Sheets表頭 (更新為24欄，包含使用者資訊與未來擴充欄位)
    SHEET_HEADERS: [
        '時間', '姓名', '公司', '職位', '部門', '電話', '手機', 
        '傳真', '電子郵件', '網址', '地址', '信心度', '處理時間', 
        'Drive連結', '智慧檔名', '本地路徑', '原始文字',
        'AI解析', 'AI信心度', '資料來源', 'LINE用戶ID', '用戶暱稱',
        '用戶標籤', '原始ID'
    ],
    
    // 中文數字對照表
    CHINESE_NUMBERS: {
        '○': '0', '〇': '0', '零': '0',
        '一': '1', '二': '2', '三': '3', '四': '4', '五': '5',
        '六': '6', '七': '7', '八': '8', '九': '9', '十': '10'
    },
    
    // 常見姓氏
    COMMON_SURNAMES: [
        '陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊', '許', 
        '鄧', '蕭', '馮', '曾', '程', '蘇', '丁', '朱', '潘', '范', '董', 
        '梁', '賴', '徐', '葉', '郭', '廖', '謝', '邱', '何', '羅', '高', 
        '周', '趙', '孫', '龍', '江', '施', '沈', '余', '盧', '胡', '姚'
    ],
    
    // 常見名字用字
    COMMON_NAME_CHARS: [
        '家', '旭', '明', '剛', '志', '文', '豪', '德', '成', '建', '國', '民',
        '安', '康', '福', '祥', '和', '平', '正', '義', '智', '勇', '強', '輝',
        '光', '宏', '達', '英', '富', '貴', '榮', '昌', '興', '盛', '發', '展',
        '進', '步', '新', '美', '善', '真', '愛', '仁', '慈', '孝', '廉', '樂',
        '禮', '信', '君', '雄', '英', '傑', '才', '學', '博', '深', '高', '頂',
        '俊', '晟', '宇', '軒', '豪', '氣', '宸', '泰', '翔', '鈞', '翰', '凱'
    ]
};
