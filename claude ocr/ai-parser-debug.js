// ai-parser-debug.js - 逐步驗證版本
const https = require('https');
const config = require('./config');

class AIParserDebug {
    constructor() {
        this.apiKey = config.GEMINI_API_KEY;
        this.model = config.GEMINI_MODEL || 'gemini-2.5-flash';
    }

    // 基礎API調用（不做任何文字處理）
    async callGeminiAPI(prompt) {
        return new Promise((resolve, reject) => {
            const requestBody = {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }]
            };

            const data = JSON.stringify(requestBody);
            console.log('🔍 發送的JSON:', data);
            
            const options = {
                hostname: 'generativelanguage.googleapis.com',
                path: `/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    console.log('📨 API回應:', responseData);
                    try {
                        const result = JSON.parse(responseData);
                        if (result.error) {
                            reject(new Error(`API錯誤: ${result.error.message}`));
                        } else {
                            resolve(result);
                        }
                    } catch (error) {
                        reject(new Error(`解析回應失敗: ${error.message}`));
                    }
                });
            });

            req.on('error', reject);
            req.write(data);
            req.end();
        });
    }

    // 測試1：純英文
    async test1_EnglishOnly() {
        console.log('\n🧪 測試1：純英文');
        try {
            const prompt = "Hello, please respond with: {\"test\": \"success\"}";
            const result = await this.callGeminiAPI(prompt);
            console.log('✅ 純英文測試成功');
            return true;
        } catch (error) {
            console.log('❌ 純英文測試失敗:', error.message);
            return false;
        }
    }

    // 測試2：簡單中文
    async test2_SimpleChinese() {
        console.log('\n🧪 測試2：簡單中文');
        try {
            const prompt = "請回覆: {\"測試\": \"成功\"}";
            const result = await this.callGeminiAPI(prompt);
            console.log('✅ 簡單中文測試成功');
            return true;
        } catch (error) {
            console.log('❌ 簡單中文測試失敗:', error.message);
            return false;
        }
    }

    // 測試3：OCR文字的各個部分
    async test3_OCRParts() {
        const parts = [
            "FANUO",
            "www.fanuc.tw", 
            "台灣發那科股份有限公司",
            "營業技術部 DX技術課",
            "莊宜潔",
            "407019台中市西屯區工業區十六路十號",
            "話:(〇四)二三五九—〇五二二分機六五三〇",
            "統一編號:二 二 三 四。。一九",
            "電子郵件:chuang.ichieh@fanuctaiwan.com.tw"
        ];

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            console.log(`\n🧪 測試3.${i+1}：OCR部分 "${part}"`);
            
            try {
                const prompt = `分析文字: ${part}`;
                const result = await this.callGeminiAPI(prompt);
                console.log(`✅ 部分${i+1}測試成功`);
            } catch (error) {
                console.log(`❌ 部分${i+1}測試失敗:`, error.message);
                console.log(`🔍 問題文字: "${part}"`);
                return false;
            }

            // 避免太快
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
        return true;
    }

    // 測試4：完整OCR文字
    async test4_FullOCR() {
        console.log('\n🧪 測試4：完整OCR文字');
        
        const fullOCR = `FANUO
www.fanuc.tw
台灣發那科股份有限公司
營業技術部 DX技術課
莊
宜
潔
407019台中市西屯區工業區十六路十號
話:(〇四)二三五九—〇五二二分機六五三〇
統一編號:二 二 三 四。。一九
電子郵件:chuang.ichieh@fanuctaiwan.com.tw`;

        try {
            const prompt = `分析以下文字: ${fullOCR}`;
            const result = await this.callGeminiAPI(prompt);
            console.log('✅ 完整OCR測試成功');
            return true;
        } catch (error) {
            console.log('❌ 完整OCR測試失敗:', error.message);
            return false;
        }
    }

    // 執行完整測試
    async runDiagnostics() {
        console.log('🔬 開始API診斷測試...');
        
        const results = {};
        
        results.test1 = await this.test1_EnglishOnly();
        if (!results.test1) {
            console.log('💥 基礎API調用失敗，停止測試');
            return results;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        results.test2 = await this.test2_SimpleChinese();
        if (!results.test2) {
            console.log('💥 中文支援失敗，問題可能是字符編碼');
            return results;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        results.test3 = await this.test3_OCRParts();
        if (!results.test3) {
            console.log('💥 OCR特定部分失敗，已找到問題文字');
            return results;
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        results.test4 = await this.test4_FullOCR();
        
        console.log('\n📊 測試結果總結:');
        console.log('- 純英文:', results.test1 ? '✅' : '❌');
        console.log('- 簡單中文:', results.test2 ? '✅' : '❌');
        console.log('- OCR部分:', results.test3 ? '✅' : '❌');
        console.log('- 完整OCR:', results.test4 ? '✅' : '❌');
        
        return results;
    }
}

// 如果直接執行此檔案，運行診斷
if (require.main === module) {
    const diagnostic = new AIParserDebug();
    diagnostic.runDiagnostics().then(results => {
        console.log('\n🎯 診斷完成');
        process.exit(0);
    }).catch(error => {
        console.error('💥 診斷過程出錯:', error);
        process.exit(1);
    });
}

module.exports = AIParserDebug;