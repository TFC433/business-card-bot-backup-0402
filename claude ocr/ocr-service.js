// ocr-service.js - OCR文字識別服務 (V2.0 雲端/本地兩用版)
const fs = require('fs');
const https = require('https');
const config = require('./config');

class OCRService {
    constructor() {
        this.vision = null;
    }

    // 主要OCR識別入口
    async recognizeText(imagePath) {
        try {
            console.log('🔍 進行OCR文字識別...');
            
            if (!fs.existsSync(imagePath)) {
                throw new Error('找不到圖片檔案');
            }
            
            // 方法1: 嘗試使用服務帳戶憑證 (已修改為優先讀取環境變數)
            let result = await this.tryServiceAccount(imagePath);
            if (result) return result;
            
            // 方法2: 嘗試使用API Key
            result = await this.tryAPIKey(imagePath);
            if (result) return result;
            
            // 都失敗了
            throw new Error('OCR識別失敗：沒有有效的Vision API認證');
            
        } catch (error) {
            console.error('❌ Vision API調用失敗:', error.message);
            throw error;
        }
    }

    // 方法1: 服務帳戶認證
    async tryServiceAccount(imagePath) {
        // [修改處] 優先從環境變數建立 client (for Render)
        if (process.env.GOOGLE_SERVICE_CREDENTIALS) {
            console.log('🔐 從環境變數載入服務帳戶憑證進行OCR...');
            try {
                const vision = require('@google-cloud/vision');
                const credentials = JSON.parse(process.env.GOOGLE_SERVICE_CREDENTIALS);
                const client = new vision.ImageAnnotatorClient({ credentials });
                const [result] = await client.textDetection(imagePath);
                
                if (result.textAnnotations && result.textAnnotations.length > 0) {
                    console.log('✅ 服務帳戶OCR識別成功 (來自環境變數)');
                    return {
                        responses: [{ textAnnotations: result.textAnnotations }]
                    };
                }
                return null; // 雖然成功但沒有識別到文字
            } catch (error) {
                console.log('⚠️ 環境變數服務帳戶Vision API失敗:', error.message);
                return null; // 失敗，讓流程繼續嘗試其他方法
            }
        }

        // 如果沒有環境變數，則從檔案讀取 (for local development)
        if (!fs.existsSync('./credentials.json')) {
            return null;
        }

        try {
            console.log('🔐 使用本地檔案憑證進行OCR...');
            
            const vision = require('@google-cloud/vision');
            
            // 暫時設定憑證路徑
            const originalCreds = process.env.GOOGLE_APPLICATION_CREDENTIALS;
            process.env.GOOGLE_APPLICATION_CREDENTIALS = './credentials.json';
            
            const client = new vision.ImageAnnotatorClient();
            const [result] = await client.textDetection(imagePath);
            
            // 恢復原始憑證設定
            if (originalCreds) {
                process.env.GOOGLE_APPLICATION_CREDENTIALS = originalCreds;
            } else {
                delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
            }
            
            if (result.textAnnotations && result.textAnnotations.length > 0) {
                console.log('✅ 本地服務帳戶OCR識別成功');
                return {
                    responses: [{ textAnnotations: result.textAnnotations }]
                };
            }
            
            return null;
            
        } catch (error) {
            console.log('⚠️ 本地服務帳戶Vision API失敗:', error.message);
            return null;
        }
    }

    // 方法2: API Key認證 (無需修改，已透過config檔支援環境變數)
    async tryAPIKey(imagePath) {
        if (!config.VISION_API_KEY || config.VISION_API_KEY === 'YOUR_VISION_API_KEY') {
            return null;
        }

        try {
            console.log('🌐 使用API Key進行OCR...');
            
            const imageBuffer = fs.readFileSync(imagePath);
            const base64Image = imageBuffer.toString('base64');
            
            const requestBody = {
                requests: [{
                    image: { content: base64Image },
                    features: [{ type: 'TEXT_DETECTION', maxResults: 50 }]
                }]
            };
            
            return new Promise((resolve, reject) => {
                const data = JSON.stringify(requestBody);
                
                const options = {
                    hostname: 'vision.googleapis.com',
                    path: `/v1/images:annotate?key=${config.VISION_API_KEY}`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': data.length
                    }
                };
                
                const req = https.request(options, (res) => {
                    let responseData = '';
                    res.on('data', (chunk) => responseData += chunk);
                    res.on('end', () => {
                        try {
                            const result = JSON.parse(responseData);
                            if (result.error) {
                                reject(new Error(`Vision API錯誤: ${result.error.message}`));
                            } else {
                                console.log('✅ API Key OCR識別成功');
                                resolve(result);
                            }
                        } catch (error) {
                            reject(new Error('解析Vision API回應失敗'));
                        }
                    });
                });
                
                req.on('error', reject);
                req.write(data);
                req.end();
            });
            
        } catch (error) {
            console.log('⚠️ API Key Vision API失敗:', error.message);
            return null;
        }
    }

    // 提取文字內容
    extractText(visionResult) {
        if (!visionResult.responses || !visionResult.responses[0] || !visionResult.responses[0].textAnnotations) {
            throw new Error('未識別到文字');
        }
        
        const detections = visionResult.responses[0].textAnnotations;
        if (detections.length === 0) {
            throw new Error('未識別到文字');
        }
        
        const fullText = detections[0].description;
        
        console.log('✅ OCR識別成功');
        console.log('================');
        console.log('識別到的完整文字：');
        console.log(fullText);
        console.log('================');
        
        return {
            fullText,
            detections
        };
    }
}

module.exports = OCRService;