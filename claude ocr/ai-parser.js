// ai-parser.js - Gemini AI智慧解析器（修正UTF-8編碼問題 + 模型容錯）
const https = require('https');
const config = require('./config');

class AIParser {
    constructor() {
        this.apiKey = config.GEMINI_API_KEY;
        // [修改處] 讀取模型列表，並提供向下相容
        this.modelsToTry = [];
        if (config.GEMINI_MODELS && config.GEMINI_MODELS.primary) {
            this.modelsToTry.push(config.GEMINI_MODELS.primary);
            if (config.GEMINI_MODELS.fallbacks) {
                this.modelsToTry.push(...config.GEMINI_MODELS.fallbacks);
            }
        } else if (config.GEMINI_MODEL) { // 向下相容舊設定
            this.modelsToTry.push(config.GEMINI_MODEL);
        } else {
            this.modelsToTry.push('gemini-1.5-flash'); // 最終預設
        }

        this.requestCount = 0;
        this.lastRequestTime = 0;
        this.rateLimitDelay = config.AI_RATE_LIMIT_DELAY || 12000;
    }

    // 主要解析入口（新增模型容錯邏輯）
    async parseBusinessCard(ocrText, detections = []) {
        if (!this.apiKey || this.apiKey === 'YOUR_GEMINI_API_KEY' || this.modelsToTry.length === 0) {
            console.log('⚠️ Gemini API Key未配置或無可用模型，跳過AI解析');
            return null;
        }

        console.log('🤖 啟動AI核心欄位解析（模型容錯模式）...');
        
        await this.enforceRateLimit();
        const prompt = this.buildFocusedPrompt(ocrText);

        for (const model of this.modelsToTry) {
            try {
                console.log(`🧠 嘗試使用模型: ${model}...`);
                const aiResult = await this.tryModel(prompt, model);
                const parsedResult = this.parseAIResponse(aiResult);
                
                console.log(`✅ AI核心解析成功 (使用 ${model})，信心度: ${parsedResult.confidence}%`);
                // 在成功解析的結果中註明是哪個模型完成的
                parsedResult.modelUsed = model; 
                return parsedResult;

            } catch (error) {
                console.warn(`❌ 模型 ${model} 執行失敗: ${error.message}`);
                // 如果不是最後一個模型，就繼續嘗試下一個
                if (this.modelsToTry.indexOf(model) < this.modelsToTry.length - 1) {
                    console.log('🔄 嘗試下一個備用模型...');
                } else {
                    // 所有模型都失敗了
                    console.error('❌ 所有AI模型均解析失敗。');
                    throw new Error('All Gemini models failed to process the request.');
                }
            }
        }
        // 理論上不會執行到這裡，但在迴圈為空的情況下提供保護
        return null;
    }
    
    // [新增] 輔助函式，用於嘗試單一模型
    async tryModel(prompt, model) {
        try {
            const content = await this.callGeminiAPI(prompt, model);
            return content;
        } catch (error) {
            // 直接拋出錯誤，由上層的迴圈捕捉
            throw error;
        }
    }


    // 構建專注的提示詞
    buildFocusedPrompt(ocrText) {
        const prompt = `你是專業的名片資訊提取專家。請分析以下OCR識別的名片文字，只提取4項核心資訊。

OCR文字內容：
${ocrText}

請專注提取以下4項資訊：
1. 完整姓名（如果姓名被拆分成單字符，請智慧重組）
2. 完整公司名稱（包含完整的企業正式名稱）
3. 職位/頭銜（如經理、工程師、主任等）
4. 部門/單位（如技術部、營業部等）

請以標準JSON格式回傳：

{
  "name": "完整姓名",
  "company": "完整公司名稱",
  "position": "職位",
  "department": "部門",
  "confidence": 85
}`;

        return prompt;
    }

    // 調用Gemini API（修正UTF-8編碼，並接受模型參數）
    async callGeminiAPI(prompt, model) {
        return new Promise((resolve, reject) => {
            const requestBody = {
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    topK: 1,
                    topP: 0.8,
                    maxOutputTokens: 1024
                }
            };

            const data = Buffer.from(JSON.stringify(requestBody), 'utf8');
            
            const options = {
                hostname: 'generativelanguage.googleapis.com',
                path: `/v1beta/models/${model}:generateContent?key=${this.apiKey}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Content-Length': data.length
                }
            };

            const req = https.request(options, (res) => {
                let responseData = '';
                res.setEncoding('utf8');
                
                res.on('data', (chunk) => {
                    responseData += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const result = JSON.parse(responseData);
                        
                        if (result.error) {
                            reject(new Error(`Gemini API錯誤: ${result.error.message}`));
                            return;
                        }
                        
                        if (!result.candidates || 
                            !Array.isArray(result.candidates) || 
                            result.candidates.length === 0 ||
                            !result.candidates[0] ||
                            !result.candidates[0].content ||
                            !result.candidates[0].content.parts ||
                            !Array.isArray(result.candidates[0].content.parts) ||
                            result.candidates[0].content.parts.length === 0) {
                            console.error('API回應結構異常:', JSON.stringify(result, null, 2));
                            reject(new Error('Gemini API回應格式異常'));
                            return;
                        }
                        
                        const content = result.candidates[0].content.parts[0].text;
                        if (!content) {
                            reject(new Error('API回應內容為空'));
                            return;
                        }
                        
                        resolve(content);
                        
                    } catch (error) {
                        console.error('解析錯誤，原始回應:', responseData);
                        reject(new Error(`解析Gemini API回應失敗: ${error.message}`));
                    }
                });
            });

            req.on('error', (error) => {
                reject(new Error(`Gemini API請求失敗: ${error.message}`));
            });

            req.write(data);
            req.end();
            
            this.requestCount++;
        });
    }

    // 解析AI回應
    parseAIResponse(aiResponse) {
        try {
            let cleanResponse = aiResponse.trim();
            if (cleanResponse.startsWith('```json')) {
                cleanResponse = cleanResponse.replace(/```json\n?/, '').replace(/\n?```$/, '');
            }
            if (cleanResponse.startsWith('```')) {
                cleanResponse = cleanResponse.replace(/```\n?/, '').replace(/\n?```$/, '');
            }

            const parsed = JSON.parse(cleanResponse);
            
            const result = {
                name: this.cleanString(parsed.name),
                company: this.cleanString(parsed.company),
                position: this.cleanString(parsed.position),
                department: this.cleanString(parsed.department),
                confidence: Math.min(Math.max(parseInt(parsed.confidence) || 0, 0), 100),
                source: 'ai-core-fields',
                rawAIResponse: cleanResponse
            };
            
            return result;
            
        } catch (error) {
            console.error('❌ 解析AI回應失敗:', error.message);
            
            return {
                name: '', company: '', position: '', department: '',
                confidence: 0,
                source: 'ai-core-fields-failed',
                rawAIResponse: aiResponse,
                error: error.message
            };
        }
    }

    cleanString(str) {
        if (!str || typeof str !== 'string') return '';
        return str.trim().replace(/\s+/g, ' ');
    }

    async enforceRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        
        if (timeSinceLastRequest < this.rateLimitDelay) {
            const waitTime = this.rateLimitDelay - timeSinceLastRequest;
            console.log(`⏱️ 速率限制：等待 ${Math.ceil(waitTime/1000)} 秒...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        
        this.lastRequestTime = Date.now();
    }

    // 與傳統解析器結果融合
    fuseWithTraditionalParser(aiResult, traditionalResult) {
        if (!aiResult && !traditionalResult) return null;
        if (!aiResult) return { ...traditionalResult, source: 'traditional-only' };
        if (!traditionalResult) return this.expandAIResult(aiResult);

        console.log('🔄 融合AI核心欄位與傳統解析結果...');
        
        const fused = {
            name: this.selectBestValue(aiResult.name, traditionalResult.name, 'name'),
            company: this.selectBestValue(aiResult.company, traditionalResult.company, 'company'),
            position: this.selectBestValue(aiResult.position, traditionalResult.position, 'position'),
            department: this.selectBestValue(aiResult.department, traditionalResult.department, 'department'),
            
            phone: traditionalResult.phone || '',
            mobile: traditionalResult.mobile || '',
            fax: traditionalResult.fax || '',
            email: traditionalResult.email || '',
            website: traditionalResult.website || '',
            address: traditionalResult.address || '',
            
            confidence: Math.max(aiResult.confidence || 0, traditionalResult.confidence || 0),
            source: 'ai-traditional-fused',
            rawText: traditionalResult.rawText || ''
        };

        console.log(`✅ 方案D融合完成，最終信心度: ${fused.confidence}%`);
        return fused;
    }

    expandAIResult(aiResult) {
        return {
            name: aiResult.name || '',
            company: aiResult.company || '',
            position: aiResult.position || '',
            department: aiResult.department || '',
            phone: '',
            mobile: '',
            fax: '',
            email: '',
            website: '',
            address: '',
            confidence: aiResult.confidence || 0,
            source: 'ai-only-core',
            rawText: ''
        };
    }

    selectBestValue(aiValue, traditionalValue, fieldType) {
        if (!aiValue && traditionalValue) return traditionalValue;
        if (aiValue && !traditionalValue) return aiValue;
        if (!aiValue && !traditionalValue) return '';

        switch (fieldType) {
            case 'name':
                return this.isValidChineseName(aiValue) ? aiValue : 
                       this.isValidChineseName(traditionalValue) ? traditionalValue : aiValue;

            case 'company':
                const aiHasCompanyKeyword = /(公司|企業|集團|科技|工業|Corporation|Company|Ltd|Inc)/i.test(aiValue);
                const tradHasCompanyKeyword = /(公司|企業|集團|科技|工業|Corporation|Company|Ltd|Inc)/i.test(traditionalValue);
                
                if (aiHasCompanyKeyword && !tradHasCompanyKeyword) return aiValue;
                if (!aiHasCompanyKeyword && tradHasCompanyKeyword) return traditionalValue;
                return aiValue;

            case 'position':
            case 'department':
                return aiValue || traditionalValue;

            default:
                return aiValue || traditionalValue;
        }
    }

    isValidChineseName(name) {
        if (!name || typeof name !== 'string') return false;
        if (name.length < 2 || name.length > 4) return false;
        if (!/^[\u4e00-\u9fa5]+$/.test(name)) return false;
        
        const commonSurnames = ['陳', '林', '黃', '張', '李', '王', '吳', '劉', '蔡', '楊', '許', '鄧'];
        return commonSurnames.some(surname => name.startsWith(surname));
    }

    getUsageStats() {
        return {
            totalRequests: this.requestCount,
            modelUsed: this.modelsToTry, // 顯示所有可能的模型
            strategy: 'core-4-fields-fallback',
            rateLimitDelay: this.rateLimitDelay,
            lastRequestTime: new Date(this.lastRequestTime).toISOString()
        };
    }

    async testConnection() {
        try {
            if (!this.apiKey || this.apiKey === 'YOUR_GEMINI_API_KEY') {
                return { success: false, error: 'API Key未配置' };
            }

            const testPrompt = 'Hello';
            // 測試時只用第一個模型
            await this.callGeminiAPI(testPrompt, this.modelsToTry[0]);
            
            return { success: true, message: `Gemini API連接正常 (主模型: ${this.modelsToTry[0]})` };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
}

module.exports = AIParser;
