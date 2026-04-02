#!/bin/bash

# LINE Bot 啟動腳本

echo "🚀 啟動 LINE Bot 名片識別系統"
echo "=================================="

# 檢查目錄
if [ ! -f "package.json" ]; then
    echo "❌ 錯誤: 請在line-bot目錄中執行此腳本"
    exit 1
fi

# 檢查環境變數檔案
if [ ! -f ".env" ]; then
    echo "❌ 錯誤: .env檔案不存在"
    echo "請先建立.env檔案並設定LINE Bot憑證"
    exit 1
fi

# 檢查Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 錯誤: Node.js未安裝"
    echo "請先安裝Node.js (版本 >= 16.0.0)"
    exit 1
fi

# 檢查npm
if ! command -v npm &> /dev/null; then
    echo "❌ 錯誤: npm未安裝"
    exit 1
fi

# 檢查依賴套件
if [ ! -d "node_modules" ]; then
    echo "📦 安裝依賴套件..."
    npm install
    if [ $? -ne 0 ]; then
        echo "❌ 依賴套件安裝失敗"
        exit 1
    fi
fi

# 檢查上層目錄的主處理器
if [ ! -f "../main-processor.js" ]; then
    echo "❌ 錯誤: 找不到主處理器 (../main-processor.js)"
    echo "請確認在正確的專案目錄結構中"
    exit 1
fi

# 建立temp目錄
if [ ! -d "temp" ]; then
    echo "📁 建立暫存目錄..."
    mkdir temp
fi

# 檢查ngrok (可選)
if command -v ngrok &> /dev/null; then
    echo "✅ ngrok已安裝，可用於本地測試"
else
    echo "⚠️  ngrok未安裝，本地測試時需要手動安裝"
    echo "   安裝指令: npm install -g ngrok"
fi

# 顯示系統資訊
echo ""
echo "📋 系統資訊:"
echo "   Node.js版本: $(node --version)"
echo "   npm版本: $(npm --version)"
echo "   工作目錄: $(pwd)"
echo ""

# 顯示使用說明
echo "💡 使用說明:"
echo "   1. 確認LINE Developer Console已設定Webhook URL"
echo "   2. 如需本地測試，另開終端機執行: ngrok http 3000"
echo "   3. 將ngrok提供的HTTPS網址設定到LINE Webhook"
echo "   4. 用LINE掃描QR Code加入好友: @302winpe"
echo ""

# 啟動服務
echo "🔥 啟動LINE Bot服務..."
echo "   服務地址: http://localhost:3000"
echo "   測試頁面: http://localhost:3000/test"
echo "   停止服務: Ctrl+C"
echo ""

# 執行主程式
node line-bot.js